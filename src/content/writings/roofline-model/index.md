---
title: "Roofline Model: Why Your Kernel Is Slow, Geometrically"
description: "A geometric performance model for deciding whether a kernel is limited by memory bandwidth, compute throughput, or implementation inefficiency."
date: "2026-05-10"
tags:
  - "GPU"
  - "Performance"
  - "Architecture"
draft: false
---
Every kernel does two kinds of work: it performs arithmetic, and it moves data. A kernel is fast only when both sides are used well. If the arithmetic units are waiting for data, the kernel is memory-bandwidth-limited. If data is arriving fast enough but the arithmetic units are saturated, the kernel is compute-limited.

The **Roofline performance model** helps separate those two cases. It gives a first-order way to ask: is this kernel limited by peak arithmetic throughput, by peak memory bandwidth, or by inefficient use of the hardware, where neither peak compute throughput nor peak memory bandwidth is being achieved?

The model is intentionally simplified. It ignores most hardware details and keeps only the first-order limits that matter for performance: how fast the machine can do FLOPs, and how fast it can move bytes.

* * *

## The Simplified Machine

Roofline starts with a deliberately simple picture of the hardware:  

```text
+----------------------+   bytes moved through HBM   +----------------------+
| GPU SMs              | <-------------------------> | HBM                  |
|                      |                             |                      |
| peak_FLOPs_per_sec   |                             | peak_BW              |
+----------------------+                             +----------------------+

        compute work: FLOPs                 memory work: bytes
```

The left side is the processor. For this article, assume the compute units are a GPU's SMs. We summarize all of them with one number: the maximum rate at which they can perform floating-point work, `peak_FLOPs_per_sec`.

The right side is memory the processor needs to read from and write to. For this article, assume that memory is HBM. We summarize the path between HBM and the SMs with one number too: the maximum rate at which bytes can be transferred between HBM and the compute units, `peak_BW`.

For a kernel to run, two things must happen:  

```text
memory work:   bytes must move to or from HBM
compute work:  FLOPs must be executed
```

Terminology matters here:

-   **FLOPs** means total floating-point operations.
-   **FLOP/s** means a rate: floating-point operations per second.

* * *

## Arithmetic Intensity

The key quantity in Roofline is **arithmetic intensity**:  

```text
Arithmetic Intensity (AI) = FLOPs / bytes
```

It measures how much computation the kernel performs for each byte moved to or from HBM. A low-AI kernel moves a lot of data for each unit of arithmetic. A high-AI kernel reuses data well and performs many FLOPs per byte.

There are two versions of AI, and the difference between them matters.

**Algorithmic AI** is the ideal value implied by the algorithm itself. You count the FLOPs the algorithm must perform, then divide by the minimum bytes the algorithm must move. In this view, every input is loaded only when it is truly needed, reused perfectly after that, and every output is written only as required. Algorithmic AI answers:  

```text
If memory reuse were perfect, how many FLOPs could this algorithm get per byte?
```

**Observed AI** is what the implemented kernel actually achieves at runtime. You still count FLOPs, but now the byte count comes from the real traffic through HBM. If the same value is loaded multiple times, those bytes count multiple times. If an uncoalesced access fetches a full memory sector but uses only part of it, the fetched bytes count. If register spills or cache misses create extra traffic, those bytes count too. Observed AI answers:  

```text
Given the traffic this implementation really generated, how many FLOPs did it get per byte?
```

Ideally, under consistent FLOP accounting and the same memory boundary:  

```text
observed AI <= algorithmic AI
```

The Roofline point uses **observed AI**. The algorithmic AI is an upper-bound reference: it tells you how far right the kernel should be able to move if wasted memory traffic is removed.

* * *

## Drawing the Roofline

Now take the simplified machine and run one kernel on it.

### Plot the kernel point

At runtime, suppose the kernel:

-   moves some total number of bytes to or from HBM
-   performs some total number of FLOPs
-   takes some amount of time to finish

From those observed quantities, we compute two values:  

```text
observed AI          = FLOPs / bytes moved through HBM
achieved performance = FLOPs / time
```

These two values become the kernel's point on the Roofline chart:  

```text
x-position = observed AI
y-position = achieved performance
```

Next we draw the two hardware limits.

### Draw the compute roof

The first limit comes from the SMs. No matter how much data reuse the kernel has, it cannot run faster than the maximum arithmetic throughput of the SMs:  

```text
compute roof = peak_FLOPs_per_sec
```

This is a horizontal line on the chart.

### Draw the bandwidth roof

The second limit comes from HBM bandwidth. The hardware has some peak HBM bandwidth, `peak_BW`, measured in bytes per second. For a kernel with arithmetic intensity `AI`, every byte moved from HBM supports `AI` FLOPs. So if the kernel could use the full HBM bandwidth, the maximum compute throughput that HBM could feed is:  

```text
bandwidth roof = AI × peak_BW
```

This is a diagonal line. At low AI, each FLOP requires many bytes, so even peak HBM bandwidth cannot feed enough data to reach the compute roof. As AI increases, each byte supports more FLOPs, so the bandwidth-limited ceiling rises until it eventually meets the compute roof.  

```text
log(FLOP/s)
   ^
   |        bandwidth roof                     compute roof
   |                         o======================================
   |                       / |
   |                     /   |
   |                   /     |
   |                 /       |
   |               /         |
   |             /           |
   |           /             |
   |         /               |
   |       /                 |
   |     /                   |
   |   /                     |
   +-------------------------+--------------------> log(AI = FLOPs / Bytes)
                             |
                             ridge point

        bandwidth-limited    |    compute-limited
```

The Roofline is the lower of those two ceilings. At low AI, the diagonal bandwidth roof is lower, so HBM bandwidth is the applicable ceiling. At high AI, the horizontal compute roof is lower, so SM arithmetic throughput is the applicable ceiling.

### Find the ridge point

The point where the two ceilings meet is the **ridge point**, also called the _machine balance_:  

```text
AI_ridge = peak_FLOPs_per_sec / peak_BW
```

Now compare the kernel's observed AI — the x-position we computed from runtime FLOPs and HBM bytes — against this ridge point.

-   **Observed AI left of the ridge:** the bandwidth roof is the lower ceiling. At this AI, even perfect HBM bandwidth utilization would not reach peak compute throughput. If the point sits below the diagonal roof, the implementation is also failing to use the available bandwidth efficiently.
-   **Observed AI right of the ridge:** the compute roof is the lower ceiling. At this AI, HBM bandwidth is high enough in the Roofline model, so peak arithmetic throughput becomes the main limit.

The exact ridge location depends on the machine and on which compute peak you choose. The important question is not the absolute value of the ridge; it is whether the kernel's observed AI lands to the left or right of it.

* * *

## The Two Diagnostic Gaps

Once the kernel point is on the chart, there are two different questions to ask.

First: **is the point below the Roofline at its current observed AI?** That is a vertical gap.

Second: **is the observed AI far left of the algorithmic AI?** That is a horizontal gap.

These gaps mean different things. A vertical gap means the kernel is not using the relevant hardware limit efficiently. A horizontal gap means the kernel is moving more bytes than the algorithm ideally requires.

### Vertical Gap: Below the Roofline

At a fixed observed AI, the Roofline tells you the best performance the hardware could provide. If the kernel point sits below that roof, the kernel is not reaching the applicable ceiling.  

```text
log(FLOP/s)
   ^
   |        bandwidth roof                     compute roof
   |                         R==============================
   |                       / |                         |
   |                     /   |                         |
   |                   /     |                         v compute-side gap
   |                 /       |                         C
   |               /         |
   |             /           |
   |           /             |
   |         /               |
   |       /                 |
   |     / |                 |
   |   /   v memory-side gap |
   | /     M                 |
   +-------------------------+-------------------------> log(AI = FLOPs / Bytes)
                             |
                         ridge point

        bandwidth-limited    |    compute-limited
```

Point `M` is left of the ridge, so its applicable roof is the diagonal bandwidth roof. The vertical distance between the bandwidth roof and `M` means the kernel is not achieving peak HBM bandwidth for its current observed AI. The bytes are what they are, but they are not being moved fast enough.

Common reasons:

-   Too few memory operations in flight to saturate HBM bandwidth.
-   Synchronous loads that stall instead of overlapping with compute.
-   Poor producer-consumer overlap: load phase, then compute phase, instead of a pipeline.
-   HBM row-buffer thrashing or memory channel imbalance.
-   A problem too small to expose enough parallelism.

Point `C` is right of the ridge, so its applicable roof is the horizontal compute roof. The vertical distance between the compute roof and `C` means the kernel is not achieving peak arithmetic throughput. HBM bandwidth is no longer the limiting ceiling; the SMs are not being kept fully productive.

Common reasons:

-   Shared-memory bank conflicts that stall operand delivery.
-   Register dependency chains or low instruction-level parallelism.
-   Warp divergence.
-   Not enough asynchronous-MMA work in flight to hide latency.

### Horizontal Gap: Observed AI vs Algorithmic AI

The horizontal gap is different. It compares the kernel's **observed AI** to the algorithm's **algorithmic AI**.  

```text
observed AI    = FLOPs / actual HBM bytes moved
algorithmic AI = FLOPs / minimum bytes required by the algorithm
```

If observed AI is far to the left of algorithmic AI, the implementation is moving extra bytes. The FLOPs may be the same, but the denominator is larger than it should be.

Common reasons:

-   Uncoalesced or scattered global loads that over-fetch memory sectors.
-   Cache thrashing: data is evicted before reuse and loaded again.
-   Redundant loads across thread blocks.
-   Register spills that create local-memory traffic.
-   Unfused kernels that write intermediates to HBM and read them back later.

This is not about whether HBM bandwidth is saturated. A kernel can sit exactly on the bandwidth roof and still have a large horizontal gap. That means it is moving too many bytes, but moving them efficiently.

* * *

## Optimization as a 2D Walk

Once you have the two-gap picture, you can think of optimization as walking the dot on the chart. Every optimization moves the dot in a specific direction.

### Right (raise observed AI)

These optimizations change _which bytes_ (or _how many bytes_) cross the boundary you're measuring at. Same FLOPs, fewer bytes.

-   Tiling and blocking for shared memory and registers.
-   Larger thread-block tiles so each loaded byte is reused more times before being evicted.
-   Kernel fusion — eliminate HBM round trips for intermediates.
-   Multicast loads and cache-residency hints.

The maximum reference target for "right" is the algorithmic AI. Under consistent accounting, it is the upper bound for how much HBM traffic reduction can improve observed AI.

### Up (raise achieved FLOP/s at current AI)

These optimizations change _how fast_ the bytes already in flight are processed. Same bytes, higher throughput.

-   Increase ILP — issue more independent MMAs before any synchronizing instruction.
-   Software pipelining and double- or multi-buffering to overlap data movement with compute.
-   Eliminate shared-memory bank conflicts using the right swizzled layouts.
-   Coalesce global memory accesses (this also shifts the dot right, so it's a both-axis optimization).
-   Raise occupancy when you're latency-bound; lower it when register pressure is helping ILP. Both happen.

The maximum target for "up" is the applicable roof — bandwidth roof if you're memory-bandwidth-limited, compute roof if you're compute-limited.

### Up-and-right (combined)

This is the typical trajectory of a real rewrite: naive triple-loop GEMM → tiled GEMM crosses the ridge point and continues climbing toward the compute roof. The dot may zig-zag a bit as you fix one bottleneck and uncover the next.

There is one important constraint to internalize: **once the dot is well into the compute-limited region, further AI is usually no longer the main lever.** In the simple Roofline model, the horizontal compute roof is now the ceiling. At that point, the important question is how close the kernel gets to peak compute throughput.

This is why people working on GEMM kernels at any reasonable size obsess over the vertical gap: their algorithmic AI is so far past the ridge that additional tiling is usually no longer the main lever; the remaining question is how close to peak compute they can get.

* * *

## The Optimization Mental Model

Before optimizing, ask what the change is supposed to improve.

If the optimization reduces the number of HBM bytes needed for the same FLOPs, it increases observed AI. The point moves **right**. These are reuse and traffic-reduction optimizations.

If the optimization keeps the same observed AI but makes the kernel run faster, it increases achieved FLOP/s. The point moves **up**. These are utilization and pipelining optimizations.

Some optimizations do both: they reduce traffic and improve throughput. But the distinction is still useful, because it tells you what movement you should expect on the chart.

| Optimization | Primary axis | What changes |
| --- | --- | --- |
| Coalescing | X (right) | Fewer over-fetched sector bytes. |
| Async copy / pipelining | Y (up, memory-bandwidth-limited side) | Memory latency is hidden and bandwidth utilization improves. |
| SMEM swizzling / bank-conflict fixes | Y (up, compute-limited side) | Same HBM bytes, math pipe stalls less. |
| Tiling / blocking | X (right) | Same algorithm, fewer HBM round trips per FLOP. |
| Kernel fusion | X (right) | Eliminates HBM round trips for intermediates. |
| Multicast loads | X (right) | One thread block's load serves many; eliminates redundant cross-block traffic. |

* * *

## GEMM as a Roofline Example

Now tie the pieces together with GEMM:  

```text
C = A × B
```

Assume a square GEMM where `M = N = K`, with FP16 inputs and FP16 output. The algorithmic work is:  

```text
FLOPs = 2 * M^3
```

For this simplified `C = A × B` case, with no read of an old `C` value, the compulsory HBM traffic is one read of `A`, one read of `B`, and one write of `C`:  

```text
Compulsory bytes = 6 * M^2
```

So the algorithmic AI is:  

```text
algorithmic AI = FLOPs / compulsory bytes = M / 3
```

This is the rightward target. It says that as the matrix grows, GEMM can theoretically do more and more FLOPs for each byte moved from HBM. A large GEMM should therefore live far to the right on the Roofline chart, usually in the compute-limited region.

But that only describes the algorithm. The implementation still has to earn that AI.

### Naive GEMM

A naive implementation might reload the same elements of `A` and `B` many times from HBM. The FLOP count is still the GEMM FLOP count, but the HBM byte count is much larger than the compulsory byte count.

That means:  

```text
observed AI << algorithmic AI
```

On the chart, the point moves far left. If it is left of the ridge, the kernel is in the bandwidth-limited regime. If it is also below the diagonal roof, then it has both problems:

-   a **horizontal gap**, because it moves too many HBM bytes
-   a **vertical memory-side gap**, because it is not using peak HBM bandwidth efficiently

### Tiled GEMM

Tiling attacks the horizontal gap. Instead of loading an element from HBM every time it is used, the kernel loads a tile once and reuses it many times from faster on-chip storage.

The FLOPs are the same, but HBM bytes go down:  

```text
observed AI increases
```

On the chart, the point moves right toward the algorithmic AI. If the point crosses the ridge, the applicable ceiling changes: HBM bandwidth is no longer the lower roof, and the kernel moves into the compute-limited region.

### Well-pipelined GEMM

Once the kernel is in the compute-limited region, moving further right is not enough. The applicable ceiling is now the horizontal compute roof. The remaining problem is the vertical gap between the point and that roof.

Now the question becomes: are the SMs kept busy?

Optimizations in this phase do not primarily reduce HBM bytes. They improve achieved FLOP/s at roughly the same observed AI:

-   overlap HBM loads with computation
-   keep enough independent math work in flight
-   avoid shared-memory bank conflicts
-   avoid long dependency chains
-   reduce synchronization stalls

On the chart, these changes move the point up toward the compute roof.

### The Roofline Reading

GEMM is useful because it shows both directions clearly:

-   Bad reuse moves the point left of algorithmic AI.
-   Better tiling moves the point right.
-   Poor scheduling or operand delivery leaves the point vertically below the applicable roof.
-   Better pipelining and utilization move the point up.

The ideal GEMM implementation is therefore not just "high AI" and not just "high FLOP/s." It is both: observed AI close to algorithmic AI, and achieved performance close to the applicable Roofline ceiling.

* * *

## Closing Thoughts

Roofline is useful because it turns performance tuning into a sequence of concrete questions.

Measure the kernel's FLOPs, HBM bytes, and time. Compute observed AI and achieved FLOP/s. Place the point on the chart. Then ask:

-   Is observed AI left or right of the ridge?
-   Is the point below the applicable roof?
-   Is observed AI far left of algorithmic AI?

Those answers tell you the next direction. Move right by reducing HBM traffic. Move up by improving utilization of the current limiting resource. If the point is already near the roof and near algorithmic AI, the kernel is close to what this model says the hardware can do.
