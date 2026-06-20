---
title: "CUDA Graphs in LLM Inference: Deep Dive"
description: "A deep dive into CUDA Graphs for LLM inference, decode overhead, graph capture, replay, and TensorRT-LLM graph strategies."
date: "2026-02-21"
tags:
  - "CUDA"
  - "LLM"
  - "Performance"
  - "Systems"
draft: false
---
## Why CUDA Graphs Matter for LLM Inference

LLM inference -- especially the token generation (decode) phase -- is **often dominated by CPU overhead rather than GPU compute**. Each decode step generates a single token per sequence: the actual GPU work (small matmuls, attention over one query) can finish in microseconds, but the CPU can spend tens of microseconds _per kernel launch_ on launch bookkeeping, driver calls, and synchronization. With hundreds of kernel launches per transformer forward pass, this CPU overhead can become the bottleneck (though at higher batch sizes or with heavier kernels, decode can still become GPU-bound).

Making matters worse, the CPU isn't just launching kernels -- it's also preparing data for the next batch: updating token IDs, managing the KV cache block table, running the scheduler, and handling request arrivals/completions. All of this competes for CPU time with kernel launches, amplifying the bottleneck. The GPU ends up sitting idle between launches, throughput drops, latency rises, and expensive GPU cycles are wasted on nothing.

CUDA graphs solve this by **recording the entire kernel sequence once** and **replaying it with a single CPU call**. The driver overhead is paid once at capture time; every subsequent replay amortizes hundreds of per-kernel launches into a single replay launch, largely avoiding the repeated per-kernel launch bookkeeping. For decode-heavy workloads, this can eliminate the majority of per-step overhead.

This post walks through how CUDA graphs work in the context of LLM serving -- why decode is a natural fit, why context/mixed batches are harder, and how TensorRT-LLM (TRT-LLM) implements both monolithic and piecewise CUDA graph strategies.

* * *

## Table of Contents

-   [1\. CUDA Graphs Fundamentals](#1-cuda-graphs-fundamentals)
-   [2\. Generation (Decode) CUDA Graphs](#2-generation-decode-cuda-graphs)
-   [3\. KV Cache with Static Addresses](#3-kv-cache-with-static-addresses)
-   [4\. Why Context & Mixed Batches Are Hard](#4-why-context--mixed-batches-are-hard)
-   [5\. Piecewise CUDA Graphs (torch.compile)](#5-piecewise-cuda-graphs-torchcompile)
-   [6\. Configuration Guide](#6-configuration-guide)

* * *

## 1\. CUDA Graphs Fundamentals

A CUDA graph captures a sequence of GPU operations (kernel launches, memory copies) into a single replayable unit.

### What Gets Captured (Fixed)

```text
+--------------------------------------------------------------------+
| CUDA Graph Recording                                               |
|                                                                    |
| +----------+      +----------+      +----------+      +----------+ |
| | Kernel A |      | Kernel B |      | Kernel C |      | Kernel D | |
| |grid(4,1) |----->|grid(8,1) |----->|grid(4,1) |----->|grid(2,1) | |
| |@0x100 -> |      |@0x200 -> |      |@0x300 -> |      |@0x400 -> | |
| |  0x200   |      |  0x300   |      |  0x400   |      |  0x500   | |
| +----------+      +----------+      +----------+      +----------+ |
+--------------------------------------------------------------------+
```

**Baked into the graph:**

-   Which kernels to launch, in what order
-   Memory addresses (pointers) each kernel reads/writes
-   Kernel launch parameters (grid dims, block dims, shared memory)

**NOT baked (can change between replays):**

-   The actual data at those addresses
-   Data-dependent control flow inside kernels (loops, branches)

### Replay Contract

On replay, the entire sequence launches with minimal CPU overhead. The user's responsibility is to place correct data at the captured addresses before each replay.

### Why It's Fast

```text
+----------------------------+
| Without CUDA Graph (eager) |
|                            |
| CPU -- launch --> Kernel A |
| CPU <-- wait ----+         |
| CPU -- launch --> Kernel B |
| CPU <-- wait ----+         |
| CPU -- launch --> Kernel C |
| CPU <-- wait ----+         |
| CPU -- launch --> Kernel D |
|                            |
| = 4x CPU round-trips       |
+----------------------------+

+------------------------------------------+
| With CUDA Graph                          |
|                                          |
| CPU -- replay --> [ Kernel A, B, C, D ]  |
|                                          |
| = 1 launch, entire chain executes on GPU |
+------------------------------------------+
```

* * *

## 2\. Generation (Decode) CUDA Graphs

### Why Decode Is Well-Suited

In decode, each sequence contributes exactly **1 new token** per step. Total tokens = batch size. This makes the input shape predictable.  

```text
+---------------------------------------------------------------+
| Decode step N                                                 |
|                                                               |
| seq0: 1 token  \                                              |
| seq1: 1 token   \                                             |
|                   >-- batch_size = 4, shape = [4, hidden_dim] |
| seq2: 1 token   /                                             |
| seq3: 1 token  /                                              |
+---------------------------------------------------------------+
```

### Pre-allocated Static Buffers

```text
+-----------------------------------------------------------------+
| Input token IDs buffer (pre-allocated, max_batch_size = 4096)   |
|                                                                 |
| [ token_0 ][ token_1 ][ token_2 ][ token_3 ] ... [ token_4095 ] |
|   @addr_0    @addr_1    @addr_2    @addr_3          @addr_4095  |
|                                                                 |
|   fixed addresses -- same every replay                          |
+-----------------------------------------------------------------+
```

### Multiple Graphs for Different Batch Sizes

```text
Captured graphs (one per supported batch size, typically powers of two):

  batch_size   grid size     reads
  ----------   ---------     -----
       1  -->  (1, ...)  --> addr_0
       2  -->  (2, ...)  --> addr_0..1
       4  -->  (4, ...)  --> addr_0..3
       8  -->  (8, ...)  --> addr_0..7
       :
    4096  -->  (4096,..) --> addr_0..4095
```

At runtime with 5 active sequences → use batch\_size=8 graph, pad 3 dummy sequences.

### Intermediate Activations Have Stable Addresses

During capture, intermediate tensors are allocated from a graph-private memory pool, giving them stable device addresses:  

```text
+----------------------------------------------------------+
| Transformer layer (captured; all addresses fixed)        |
|                                                          |
| [QKV Projection] ----> [Attention] ----> [Output Proj]   |
|  in @A, out @B          in @B, out @C    in @C, out @D   |
|                                               |          |
|                                               v          |
| [FFN Layer 1] --------> [FFN Layer 2] ----> (next layer) |
|  in @D, out @E           in @E, out @F                   |
+----------------------------------------------------------+
```

On replay, the same chain executes at the same addresses. Intermediate buffers are never freed between replays -- they persist in the graph's memory pool. This is why **each captured batch size has its own set of stable-address buffers**, and capturing many batch sizes consumes significant GPU memory.

### What the Runtime Updates Before Each Replay

```text
+-----------------------------------------------------+
| 1. input_token_ids[0:B]  <-- new token IDs          |
| 2. position_ids[0:B]     <-- new positions          |
| 3. sequence_lengths[0:B] += 1                       |
| 4. block_table           <-- update if new KV block |
+-----------------------------------------------------+
| 5. >>> REPLAY GRAPH <<<                             |
+-----------------------------------------------------+
| 6. new_logits <-- output_buffer[0:B]                |
+-----------------------------------------------------+
| B = batch_size                                      |
+-----------------------------------------------------+
```

* * *

## 3\. KV Cache with Static Addresses

### The Apparent Contradiction

KV cache grows every step (new K,V written for each token), yet CUDA graphs require fixed addresses. The solution: **paged/block-based KV cache** with an **indirection table**.

### Block-Based KV Cache Pool

```text
+-------------------------------------------------------------+
| KV cache pool (pre-allocated; addresses never change)       |
|                                                             |
| [ Block 0 ][ Block 1 ][ Block 2 ][ Block 3 ][ Block 4 ] ... |
|   @blk_0     @blk_1     @blk_2     @blk_3     @blk_4        |
|  32 slots   32 slots   32 slots   32 slots   32 slots       |
|                                                             |
| each block holds K,V for a fixed number of tokens (e.g. 32) |
+-------------------------------------------------------------+
```

### Block Table (Indirection)

Each sequence has a block table mapping logical positions to physical blocks:

| Logical positions | Physical block |
| --- | --- |
| tokens 0–31 | Block 7 |
| tokens 32–63 | Block 12 |
| tokens 64–95 | Block 3 (partially filled, e.g. up to 82) |

_Sequence 0's block table at fixed address @tbl\_0_

### How Attention Kernel Uses Indirection

```python
# Inside the attention kernel (pseudo-code):
for each past token position i in range(sequence_length[seq_id]):
    block_idx = block_table[seq_id][i / block_size]    # read from @tbl_0
    offset    = i % block_size
    K_i = kv_cache_pool[block_idx][offset]              # indirect lookup into pool
    V_i = kv_cache_pool[block_idx][offset]
    score += dot(Q, K_i)
```

### Step-by-Step: How KV Cache Grows Within CUDA Graph

| Buffer | Step N | Step N+1 | Notes |
| --- | --- | --- | --- |
| `block_table` @tbl\_0 | `[7, 12, 3]` | `[7, 12, 3]` | Same address, same indices |
| `seq_length` @len\_0 | `82` | `83` | Same address, incremented |
| kv\_pool Block 3, slot 18 | K,V for token 82 | K,V for token 82 | Unchanged |
| kv\_pool Block 3, slot 19 | _(empty)_ | **K,V for token 83** | **NEW** — written by kernel |

The kernel wrote to a different slot because `sequence_length` told it to. All addresses remain fixed -- only the data changes.

### Why This Doesn't Violate CUDA Graph Rules

| What's fixed (baked in graph) | What changes (data at fixed addrs) |
| --- | --- |
| `kv_cache_pool` base address | Which blocks are assigned (block\_table data) |
| `block_table` buffer address | The integer block indices |
| `sequence_length` buffer address | The actual length values |
| Kernel grid dimensions | Data-dependent loops inside kernel iterate more/fewer times |

* * *

## 4\. Why Context & Mixed Batches Are Hard

### The Core Problem: Variable Total Token Count

In decode, total tokens = batch size (each sequence = 1 token). In context/mixed, total tokens varies wildly:

| Batch type | Sequences | Total tokens | Predictable? |
| --- | --- | --- | --- |
| Decode | `seq₀(1) + seq₁(1) + seq₂(1)` | 3 | Yes — always = batch\_size |
| Context | `seq₀(137) + seq₁(2048)` | 2185 | No |
| Mixed | `seq₀(512 prefill) + seq₁(1 decode)` | 513 | No |

### Problem 1: Kernel Grid Dimensions Depend on Total Tokens

```cpp
// Kernel launch -- grid dims are a function of input shape
dim3 grid((total_tokens + TILE_M - 1) / TILE_M, (hidden_dim + TILE_N - 1) / TILE_N);
matmul_kernel<<<grid, block>>>(input, weight, output, total_tokens, hidden_dim);
```

| total\_tokens | grid size | Implication |
| --- | --- | --- |
| 512 | `(4, …)` | 4 blocks — one graph |
| 3072 | `(24, …)` | 24 blocks — **different** graph required |

The grid is baked at capture time. Different total tokens = different grid = different graph.

### Problem 2: Attention Grid Depends on Max Context Seq Length and Num Context Requests

For MLP, every token is independent: `output[i] = MLP(input[i])`. Fix total\_tokens and you're done.

For attention, the kernel grid depends on **two per-iteration variables**:  

```text
+--------------------------------------------------------------+
| TRT-LLM attention grid (simplified call chain)               |
|                                                              |
| Python (trtllm.py)                                           |
|   max_ctx_seq_len = seq_lens[:num_contexts].max()            |
|                             |                                |
|                             v                                |
| C++ (fmhaRunner / fused_multihead_attention_v2)              |
|   |                   |                   |                  |
|   v                   v                   v                  |
|   grid.x              grid.y              grid.z             |
|   ceil(s/unroll)      num_heads           num_ctx_requests   |
|   [VARIES]            [FIXED]             [VARIES]           |
|                                                              |
|   --> grid = ( ceil(s/unroll), num_heads, num_ctx_requests ) |
+--------------------------------------------------------------+
```

**Grid = `(ceil(max_ctx_seq_len / unroll_step), num_heads, num_context_requests)`**

TRT-LLM uses a **padded tiling strategy**: the grid is sized for the longest context request, and shorter requests have their extra tiles skip computation (the kernel checks `cu_seqlens` internally):

_Padded tiling: 3 context requests, `seq_lens = [64, 128, 256]`, `unroll_step = 64`.  
Grid = `(4, num_heads, 3)` — sized for longest request (256)._

|  | Tile 0 | Tile 1 | Tile 2 | Tile 3 |
| --- | --- | --- | --- | --- |
| **Req 0** (64 tokens) | compute | skip | skip | skip |
| **Req 1** (128 tokens) | compute | compute | skip | skip |
| **Req 2** (256 tokens) | compute | compute | compute | compute |

Even with this padded approach, the grid changes per iteration because **both `max_ctx_seq_len` and `num_context_requests`** change depending on which requests the scheduler assigns to the context phase:

| Iteration | Context requests | max\_len | grid | What changed |
| --- | --- | --- | --- | --- |
| 1 | 32 | 128 | `(2, heads, 32)` | — |
| 2 | 1 | 128 | `(2, heads, 1)` | grid.z |
| 3 | 2 | 256 | `(4, heads, 2)` | grid.x and z |

_Different iterations produce different grids/launch parameters — the combination space explodes across multiple variables (e.g., `max_ctx_seq_len`, `num_context_requests`, and sequence-length distributions), making “one reusable CUDA graph” impractical._

A CUDA graph captured with one grid would produce **incorrect results** if replayed with a different grid/launch configuration (missing tiles = unprocessed tokens; extra tiles = out-of-bounds/garbage work). To make this safe, you’d need to capture graphs for many combinations or pad/standardize to a fixed worst-case launch shape.

### Why Decode Attention Doesn't Have This Problem

In decode, every sequence has exactly 1 query token. The decode attention uses a different kernel path where:

Decode attention: `grid = (batch_size, num_heads)` — both fixed per captured graph.

-   `batch_size` is fixed per captured graph (one graph per supported batch size)
-   Variable KV cache lengths are handled by data-dependent loops **inside** the kernel (loop over `sequence_length[i]`) -- the grid doesn't change

### Where Each Layer Type Falls

| Layer | Shape | Capturable? |
| --- | --- | --- |
| Layer norm | `[total_tokens, hidden]` — flat | Yes |
| Q, K, V projections | `[total_tokens, hidden]` — flat matmuls | Yes |
| **Fused attention** (Q@K^T, softmax, scores@V) | **per-sequence, variable tiles** | **No** — grid varies |
| Output projection | `[total_tokens, hidden]` — flat matmul | Yes |
| MLP | `[total_tokens, hidden]` — flat matmuls | Yes |

* * *

## 5\. Piecewise CUDA Graphs (torch.compile)

### Two Separate CUDA Graph Systems

TRT-LLM uses **two independent** CUDA graph systems -- understanding this distinction is critical:  

```text
                  Python model forward()
                          |
            +-------------+-------------+
            |                           |
            v                           v
+-------------------------+ +-------------------------+
| torch.compile           | | Native CUDA Graph       |
| (Dynamo tracing)        | | (stream capture)        |
+-------------------------+ +-------------------------+
| Traces Python -> FX     | | Records GPU kernels     |
| Decomposes to ATen ops  | | on the CUDA stream      |
| Custom ops -> split pt  | | Captures everything     |
+-------------------------+ +-------------------------+
| Result: Pieces          | | Result: One monolithic  |
| [graph][eager][graph]...| | graph of full fwd pass  |
+-------------------------+ +-------------------------+
            |                           |
            v                           v
  Used for: mixed/context    Used for: decode-only
  (attn grid varies)         (attn grid fixed)
```

**Generation-only (decode)**: Uses **native `torch.cuda.CUDAGraph`** capture. This records every kernel launch on the CUDA stream at the driver level -- including FlashAttention. It doesn't need to "understand" the kernels; it just records them. This works because decode attention's grid depends only on `batch_size` (fixed per capture).

**Piecewise (mixed/context)**: Uses **torch.compile** to trace the model into an FX graph, then TRT-LLM's custom backend splits at attention boundaries and captures each non-attention piece as a CUDA graph. Attention runs eagerly.

### The Piecewise Architecture

```text
+--------------------------------------------------------+
| CUDA GRAPH -- piece 1                     [captured]   |
|   layer_norm -> qkv_projection                         |
|   pre-allocates output buffer @ addr_X                 |
+--------------------------------------------------------+
|                         |                              |
|                         v                              |
+--------------------------------------------------------+
| EAGER -- not graphed                 [runs every time] |
|   flash_attention(q, k, v, cu_seqlens, ...)            |
|   writes result IN-PLACE to addr_X                     |
+--------------------------------------------------------+
|                         |                              |
|                         v                              |
+--------------------------------------------------------+
| CUDA GRAPH -- piece 2                     [captured]   |
|   reads from addr_X                                    |
|   output_proj -> layer_norm -> mlp_up ->               |
|   activation -> mlp_down -> residual_add               |
+--------------------------------------------------------+
|                         |                              |
|                         v                              |
|                 ... next layer ...                     |
+--------------------------------------------------------+
```

The in-place attention design is critical: attention writes into a buffer pre-allocated by piece 1, ensuring piece 2's captured graph reads from the correct fixed address.

### Why Attention Is Excluded

Attention is excluded from CUDA graph capture for a **correctness** reason, not a tracing limitation.

**The tracing works fine.** TRT-LLM registers a FakeTensor implementation for the attention custom op, so `torch.compile` in fullgraph mode traces the entire forward pass into one FX graph without graph breaks.

**The exclusion is a deliberate choice.** TRT-LLM's `piecewise_optimizer.py` explicitly identifies attention ops and excludes them from CUDA graph pieces:  

```python
# tensorrt_llm/_torch/compilation/piecewise_optimizer.py
if is_call_function(node, [
        torch.ops.trtllm.attn_custom_op_inplace.default,
        torch.ops.trtllm.mla_custom_op_inplace.default,
]):
    exclude_modules_id.append(idx)  # ← excluded from CUDA graph capture
```

**The reason: replay correctness.** If attention were captured in a CUDA graph, the kernel's grid dimensions would be baked in. But attention's grid depends on the per-sequence query distribution, not just total tokens:

| Kernel source | grid.x | grid.y | grid.z |
| --- | --- | --- | --- |
| `fused_multihead_attention_v2.cpp` | `ceil(params.s / mUnrollStep)` — **varies** | `params.h` (heads) — fixed | `params.b` (batch) — **varies** |
| `triton_attention.py` | `num_prefill` — **varies** | `n_heads` — fixed | `ceil(max(seq_len) / SEQ_BLOCK)` — **varies** |
| `unfusedAttentionKernels.cu` | `ceil(q_length / 32.0f)` — **varies** |  |  |

For the same `total_tokens=4096`, different sequence distributions can produce different grids/launch metadata. A captured graph replays the capture-time launch configuration; unless you pad/standardize to that same configuration, replaying on a different distribution would be incorrect. MLP doesn't have this problem because its grid depends primarily on `total_tokens`.

### What `capture_num_tokens` Controls

Pre-captures piecewise graphs for specific total token counts. At runtime, pads **up** to the next captured value.  

```text
capture_num_tokens: [1, 2, 4, 8, ..., 8192]

Runtime: 4160 total tokens → pad up to the next captured value (e.g., 5120)
  - Waste: (5120 - 4160) / 5120 = 18.7% extra compute
  - Benefit: CUDA graph replay for MLP pieces (zero launch overhead)
```

### Graph Type Summary

| Graph Type | Capture Mechanism | What It Captures | When Used | Key Parameter |
| --- | --- | --- | --- | --- |
| Generation-only | Native `torch.cuda.CUDAGraph` | Full forward pass (including attention) | Pure decode iterations | `cuda_graph_config.batch_sizes` or `max_batch_size` |
| Piecewise | torch.compile + native capture per piece | All non-attention ops (attention runs eager) | Mixed/context iterations | `torch_compile_config.capture_num_tokens` |

### Memory vs. Coverage Trade-off

Each piecewise capture at token count N pre-allocates intermediate buffers of size `[N, hidden_dim]` per piece per layer. Capturing at large N (e.g., 8192) can consume enough GPU memory to shrink KV cache capacity below usable levels. In some setups, pushing `capture_num_tokens` too high (e.g., up to 8192) with aggressive `kv_cache_free_gpu_mem_fraction` can shrink the KV cache max length enough to cause warmup failures.

* * *

## 6\. Configuration Guide

### TensorRT-LLM `llm_api_options_yaml` Settings

```yaml
# Generation-only CUDA graphs (decode phase)
cuda_graph_config:
  enable_padding: true
  max_batch_size: 4096    # or explicit batch_sizes list

# Piecewise CUDA graphs (context/mixed phases, requires torch.compile)
torch_compile_config:
  enable_piecewise_cuda_graph: true
  capture_num_tokens: [1, 2, 4, ...]   # Must cover runtime max_num_tokens!
  enable_userbuffers: false             # Default is true; disable if needed
```

### Key Principles for `capture_num_tokens`

1.  **Must cover `max_num_tokens`**: If the runtime scheduler can produce up to N total tokens, the largest capture point must be >= N. Otherwise, iterations exceeding the max fall back to eager.
    
2.  **Dense where iterations cluster**: Use iteration logs to find the hot zone. Pack capture points there to minimize padding waste.
    
3.  **Sparse where few iterations land**: Ramp-up and transition regions need minimal captures (powers of 2 suffice).
    
4.  **Fewer captures = less memory**: Each capture pre-allocates intermediate buffers sized `[capture_tokens, hidden_dim]` per piece. On memory-constrained systems, fewer large captures may be preferable.
    

### TorchCompileConfig Defaults (TensorRT-LLM)

| Field | Default | Notes |
| --- | --- | --- |
| `torch_compile_config` | `None` | Torch compile completely off unless explicitly set |
| `enable_piecewise_cuda_graph` | `False` | Must opt-in |
| `capture_num_tokens` | `None` (auto: max 3072) | Auto-generated: `[1,2,4,...,128,256,512,...,3072]` |
| `enable_userbuffers` | `True` | Enabled by default when torch compile is on |
| `enable_fullgraph` | `True` | Full graph compilation in torch.compile |
| `enable_inductor` | `False` | Inductor backend disabled by default |

### Checking Coverage at Runtime

Parse the iteration log and compute:  

```text
total_tokens_per_iter = numCtxTokens + numGenRequests

For each iteration:
  - If numCtxTokens == 0: uses generation-only CUDA graph (match on numGenRequests)
  - If numCtxTokens > 0:  uses piecewise CUDA graph (match on total_tokens)

Hit rate = iterations with total_tokens <= max(capture_num_tokens) / total iterations
```

Target: **\>95% hit rate** on piecewise graphs for meaningful benefit.
