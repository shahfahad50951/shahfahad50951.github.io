---
title: "Programming Hopper GPUs: The Memory Consistency Model"
description: "A practical walkthrough of Hopper GPU memory consistency: visibility, ordering, fences, release/acquire, scopes, and producer-consumer correctness."
date: "2026-04-25"
tags:
  - "CUDA"
  - "GPU"
  - "Architecture"
  - "Systems"
draft: false
---
You've decided to write fast code for an NVIDIA Hopper GPU. Maybe you want to build a custom attention kernel. Maybe you're trying to understand how CUTLASS and ThunderKittens work under the hood. Either way, before you can use any of the cool Hopper hardware — TMA, wgmma, mbarriers, clusters — you need to understand one thing: **how memory works when thousands of threads share it.**

That's what the _memory consistency model_ describes. It's the rulebook for what one thread can or cannot see about another thread's writes. Without it, the rest of the stack is undefined behavior waiting to happen.

This article covers the minimum you need to write correct multi-threaded GPU code. We'll build it from one concrete bug, then introduce the two primitives that fix it.

Code examples are schematic unless noted. Full PTX spells out scope, state space, and type — for example `fence.release.gpu` or `st.release.gpu.global.u32`.

* * *

## The bug we're trying to prevent

Imagine the simplest possible producer-consumer pattern. One thread fills a buffer, then sets a flag to say "I'm done." Another thread waits for the flag, then reads the buffer.  

```text
Producer (thread T1):              Consumer (thread T2):

  data = 42;       // (1)            while (flag == 0) {}    // (3) wait for flag
  flag = 1;        // (2)            x = data;               // (4) expects 42
```

Looks fine, right? It's how you'd write it in any single-threaded language. But on a GPU (or any modern CPU, for that matter), this code can produce `x == 0` instead of `x == 42`. Here's why.

From the producer's own perspective, `(1)` and `(2)` are two completely unrelated stores to two different memory locations. There's nothing in T1's own code that depends on the order in which they hit memory. So the **compiler is free to reorder them**, and the **hardware is free to commit them out of order** — neither change is visible from inside T1.

But the consumer T2 _can_ see the reorder. If `flag = 1` arrives in memory _before_ `data = 42` does, then T2 might see `flag == 1`, exit its wait loop, and read `data` while it's still `0`. The consumer's assumption — "if the flag is set, the data is ready" — silently breaks.  

```text
What T1 thinks happens:        What T2 might actually see:

  data = 42                      flag = 1     ← becomes visible first
  flag = 1                       data = 42    ← arrives later

  T2 reads:                      T2 reads:
    flag → 1 ✓                     flag → 1 ✓ (exits wait loop)
    data → 42 ✓                    data → 0 ✗ (reads stale value!)
```

**This is the central problem of shared-memory programming.** A program that looks logically correct can fail because the system reorders operations that are independent from the issuing thread's perspective but not independent from another thread's perspective.

The memory consistency model gives us tools to prevent this. The two main tools are called the **release fence** and the **acquire fence**.

* * *

## The big idea: pair of fences

Think of fences as a contract between the producer and the consumer:

-   **Producer side:** "I promise to _publish_ all my prior work before I tell anyone I'm done."
-   **Consumer side:** "I promise to wait for the announcement, then _read fresh data_ — not anything I might have cached earlier."

The producer holds up its end of the contract using a **release fence**. The consumer holds up its end using an **acquire fence**. When both sides cooperate, the bug above goes away.

Let's see exactly what each fence does, then we'll put them together to fix the bug.

* * *

## The release fence

A release fence sits between two pieces of producer code. Conceptually:  

```text
  data = 42;          // some prior work

  fence.release;      // "publish everything above me before anything below me"

  flag = 1;           // the announcement
```

Two things to understand:

**1\. The compiler cannot move prior memory operations past the fence.**

Without the fence, a compiler optimization might reorder `data = 42` to come _after_ `flag = 1`. With `fence.release` in between, that's forbidden. The fence is a one-way wall: stuff above stays above.  

```text
Without the fence:                With fence.release:

  data = 42                         data = 42
  flag = 1                          fence.release  ← prior writes pinned above
                                    flag = 1
  ⇒ compiler/hardware may swap     ⇒ data = 42 stays before flag = 1
```

**The fence is one-way, not two-way.** This is a subtle but important point. The release fence only blocks downward motion — operations _above_ it can't sink below. Operations _below_ the fence are technically allowed to move above it; the fence does not pin them in place. This is by design: the release only promises "everything above me is published," so it has nothing to say about what comes after.  

```text
   memory op above                    ← cannot sink below the fence
   memory op above                    ← cannot sink below the fence
   ─── fence.release ───
   memory op below                    ← in general, CAN move above the fence
   memory op below                    ← in general, CAN move above the fence
```

This sounds dangerous — wouldn't the compiler also be free to move the `flag = 1` write above the fence? In source PTX, the answer is no for the store that forms the release pattern: NVIDIA defines the pattern by program order, so moving that store would change the program's synchronization behavior.

**2\. The fence makes the prior writes "publishable."**

This is the more subtle part. After the fence, when the producer writes `flag = 1`, that flag write effectively _carries with it_ the promise that everything before the fence is also visible. It's like attaching a receipt to the announcement: "by the way, my data is ready too."

This is called a **release pattern**: a `fence.release` followed by a write to a flag. The pair together is what publishes the producer's prior work to anyone watching the flag.

**Pattern exception — the paired flag write is pinned.** The "later operations can move above the fence" rule has one exception: the _specific strong write_ that pairs with the fence to form the release pattern. NVIDIA's model defines `fence.release; st.relaxed [flag], 1` as a release pattern because those instructions occur in that program order. A compiler or assembler cannot preserve the same PTX semantics while hoisting that store above the fence, because doing so would dismantle the release pattern entirely.

So in practice, the rules around a release fence are:

-   Anything before the fence stays before it.
-   Unrelated memory operations after the fence are not protected by the release semantics in the same way.
-   The specific strong flag write that pairs with the fence must stay after the fence — it's the whole point of the pattern.

**One important nuance:** the fence does NOT eagerly broadcast anything to other threads. It just guarantees an _ordering_ — that the data is ready in memory before the flag is. Other threads will observe the change at their own pace; the release fence doesn't push anything to them. This is why we'll need a spin loop on the consumer side.

* * *

## The acquire fence

The acquire fence is the mirror image. It sits between two pieces of consumer code:  

```text
  flag_value = flag;   // read the announcement

  fence.acquire;       // "anything below me sees a fresh view of memory"

  x = data;            // read the data, guaranteed up-to-date
```

Two things to understand:

**1\. The compiler cannot move later memory operations before the fence.**

Without the fence, a compiler might prefetch `data` into a register before the flag check (a common optimization). With `fence.acquire`, that's forbidden. The fence is again a one-way wall, but in the opposite direction this time: stuff below stays below.  

```text
Without the fence:                With fence.acquire:

  flag_value = flag                 flag_value = flag
  x = data         ← may be         fence.acquire  ← later reads pinned below
                     prefetched     x = data
                     above flag!
```

**The fence is one-way, in the opposite direction from release.** Symmetrically with `fence.release`, the acquire fence only blocks upward motion — operations _below_ it can't hoist above. Operations _above_ the fence are technically allowed to move below it; the fence doesn't pin them in place. This is by design: the acquire only promises "everything below me sees a fresh view," so it has nothing to say about what came before.  

```text
   memory op above                    ← in general, CAN move below the fence
   memory op above                    ← in general, CAN move below the fence
   ─── fence.acquire ───
   memory op below                    ← cannot hoist above the fence
   memory op below                    ← cannot hoist above the fence
```

Just like for release, this raises a question: couldn't the compiler also move the `flag_value = flag` read _below_ the fence? Not for the read that forms the acquire pattern: NVIDIA defines the pattern by program order, so moving that read would change the synchronization behavior.

**2\. The fence makes subsequent reads "fresh."**

After the fence, later reads are ordered after any matching release that was observed through the flag. In other words, the consumer cannot use an old value of `data` from before the producer's published write; it must see the released write or a later write in that location's coherence order.

This is called an **acquire pattern**: a read of a flag, followed by a `fence.acquire`. The pair together is what makes the consumer pick up the producer's published data.

**Pattern exception — the paired flag read is pinned.** The "earlier operations can move below the fence" rule has one exception: the _specific strong read_ that pairs with the fence to form the acquire pattern. NVIDIA's model defines `ld.relaxed [flag]; fence.acquire` as an acquire pattern because those instructions occur in that program order. Moving the flag read below the fence would dismantle the pattern.

So in practice, the rules around an acquire fence are:

-   Anything after the fence stays after it.
-   Unrelated memory operations before the fence are not protected by the acquire semantics in the same way.
-   The specific strong flag read that pairs with the fence must stay before the fence — it's the whole point of the pattern.

* * *

## Putting them together: the bug, fixed

Now let's go back to our buggy code and fix it:  

```text
Producer (thread T1):                 Consumer (thread T2):

  data = 42;          // (1)            while (1) {
  fence.release;      // (F_R)            flag_value = flag;     // (3)
  flag = 1;           // (2)              if (flag_value == 1) break;
                                        }
                                        fence.acquire;           // (F_A)
                                        x = data;                // (4)
```

Walk through it:

1.  T1 writes `data = 42`.
2.  T1 hits `fence.release`. This guarantees `data = 42` is committed to memory before anything that follows.
3.  T1 writes `flag = 1`. This is the announcement; it now "carries" the visibility of `data = 42`.
4.  T2 spins on `flag` until it reads `1`. (We need to spin because the flag's new value takes some real time to propagate to T2 — fences don't push, they just promise ordering.)
5.  T2 hits `fence.acquire`. This guarantees subsequent reads see fresh data — no stale cached values can satisfy them.
6.  T2 reads `data`. Because the producer's release published `data = 42` before publishing the flag, and T2's acquire ensures fresh reads after seeing the flag, T2 is guaranteed to see `42`.

**The key insight:** the bug only got fixed because BOTH sides cooperated. The release alone wouldn't help — the consumer would still cache stale data. The acquire alone wouldn't help — the producer's writes might still arrive out of order. Memory ordering is always a _contract_ between producer and consumer.  

```text
   Producer side:                       Consumer side:

   data = 42                            spin: flag_value = flag
       │                                              │
       ▼                                              ▼
   fence.release        ─ publishes ─►   fence.acquire   ◄─ acquires
       │                  data + flag    │                  fresh view
       ▼                  together       ▼
   flag = 1                              x = data → 42 ✓
```

* * *

## Shorter forms: baked-in release and acquire

In the example above, the producer wrote two separate instructions for the publish step:  

```text
fence.release;
st.relaxed [flag], 1;
```

PTX provides a shorter form that bakes the release semantics directly into the store. Instead of the two-instruction pair, you can write:  

```text
data = 42;
st.release [flag], 1;     // store with release semantics built in
```

For this adjacent publish-store pattern, this gives the same release/acquire synchronization guarantee as `fence.release; st.relaxed [flag], 1`. The release behavior is fused into the store, so the release pattern is inherent in one instruction.

> **Important: it has to be `st.release`, not `st.relaxed`.** A bare `st.relaxed [flag], 1` is _not_ a release pattern — it's a strong store with no release ordering effect on prior writes. The release pattern requires either `st.release` (release baked in) **or** the explicit pair `fence.release; st.relaxed [flag], 1`. Don't drop the `fence.release` and assume the `.relaxed` qualifier carries any release meaning — it doesn't.

The consumer side has the matching shortcut:  

```text
flag_value = ld.acquire [flag];   // load with acquire semantics built in
x = data;                         // sees fresh data
```

`ld.acquire` is shorthand for "do the read, and include acquire semantics in that same operation." Same synchronization guarantee, one instruction.

> **Same warning, mirrored.** A bare `ld.relaxed [flag]` is _not_ an acquire pattern — it's a strong load with no acquire ordering effect on later reads. The acquire pattern requires either `ld.acquire` (acquire baked in) **or** the explicit pair `ld.relaxed [flag]; fence.acquire`. Don't drop the `fence.acquire` and assume the `.relaxed` qualifier carries any acquire meaning.

The fully-baked-in producer/consumer becomes:  

```text
Producer:                          Consumer:

  data = 42;                         while (1) {
  st.release [flag], 1;                flag_value = ld.acquire [flag];
                                       if (flag_value == 1) break;
                                     }
                                     x = data;
```

Same contract, less typing. **For most producer-consumer patterns, this is the form you want.**

When would you reach for the explicit `fence.release` / `fence.acquire` form instead? A few cases:

1.  **You want one fence to publish multiple flags.** A single `fence.release` followed by several flag writes gives all of them release semantics — no need to repeat the fence per flag.
2.  **You want a cheap relaxed read inside a spin loop, then "commit" to acquiring only when you see the right value.** Repeating `ld.acquire` on every spin iteration can be more expensive than a `ld.relaxed` loop followed by one `fence.acquire` after exit. We'll see this pattern again with `mbarrier` in a later article.
3.  **You need the combined fence variant** discussed next.

* * *

## When you need both: `fence.acq_rel`

So far we've kept the producer and consumer roles cleanly separated — release on the producer side, acquire on the consumer side. Each side has a single direction to worry about.

But sometimes a single point in your code needs to do both jobs at once:

-   **Refresh** its view to see what someone else published (acquire side).
-   **Publish** its own writes for someone else to see (release side).

That's exactly what `fence.acq_rel` is for. It's a `fence.release` and `fence.acquire` rolled into one — both effects fused at the same point.  

```text
fence.acq_rel;     // both: prior writes published AND subsequent reads refreshed
```

Both directions of the "one-way wall" apply at once: prior memory ops cannot sink below it (release side), and later memory ops cannot hoist above it (acquire side).  

```text
   memory op above                    ← cannot sink below the fence (release side)
   memory op above                    ← cannot sink below the fence
   ─── fence.acq_rel ───
   memory op below                    ← cannot hoist above the fence (acquire side)
   memory op below                    ← cannot hoist above the fence
```

### Where this actually shows up: atomic operations

The clearest case for `acq_rel` semantics is **atomic operations that read AND write at the same time** — like `atom.cas` (compare-and-swap), `atom.exch` (exchange), `atom.add` (fetch-and-add). These instructions can be simultaneously consumer-like (they read an old value) and producer-like (they write a new value).

Take a shared work queue as an example. Producers fill slots in a queue, then publish progress by advancing a shared index. Consumers atomically claim index values and then read the corresponding slots. In a queue like that, the index is not just a counter — it's also the handoff point between "someone published work" and "someone else is allowed to consume it."

Now imagine one thread advances the index with an atomic fetch-and-add:  

```text
// Atomic fetch-and-add: returns the old value
old = atom.add.acq_rel [queue_index], 1;
slot = old;
```

Why might this atomic want **acq\_rel** semantics? Because the same operation may be doing both jobs:

-   **Acquire half (the read).** The old counter value may point to a slot whose contents were written by another thread before that thread published the index. Before this thread reads `queue[slot]`, it needs to acquire those slot writes.
-   **Release half (the write).** The new counter value may become the value that a later thread observes before reading work or metadata this thread prepared. If this thread did setup before advancing the index, the write-half of the atomic can publish that setup.

That is the kind of situation where `atom.add.acq_rel` makes sense: the same read-modify-write is consuming someone else's publication and publishing this thread's own update. PTX bakes both effects into the atomic with the `.acq_rel` qualifier, for example `atom.acq_rel.gpu.global.add.u32` in full PTX syntax.

For comparison, an ordinary lock usually does **not** need `acq_rel` on lock acquire. Taking a lock is normally just an acquire operation: it consumes the previous holder's release. Releasing the lock is normally just a release store:  

```text
st.release [lock], 0;
```

So the common lock pattern is acquire on lock acquisition and release on unlock. Reach for `acq_rel` when a single atomic really does both jobs for your algorithm.

### Standalone `fence.acq_rel` is rarer

A standalone `fence.acq_rel` (not attached to an atomic) shows up less often, but it's there if you have a non-atomic point in your code that needs both effects. Most of the time it appears inside higher-level synchronization primitives (atomics, mbarriers — which we'll see in later articles) rather than as a programmer-written explicit fence.

One bit of PTX trivia: `fence.acq_rel` is the **default** when you write a plain `fence` without a `.sem` qualifier. So `fence.gpu` is shorthand for `fence.acq_rel.gpu`. This is partly why `acq_rel` shows up so often in PTX disassembly.

For typical one-direction producer-consumer patterns, **stick with the matched `release` + `acquire` pair** we built up in the earlier sections — it's simpler and avoids asking for stronger ordering than you need. Reach for `acq_rel` when one fence point (or one atomic operation) really does need to do both jobs at once, like the work-queue atomic above.

* * *

## Things to remember

A handful of practical points worth keeping in your head as you write code.

### The producer's flag write must be a "real" memory write

In PTX, this means using something like `st.relaxed [flag], 1` rather than the default `st [flag], 1`. The default is what's called a "weak" write — the memory model gives it no cross-thread guarantees, and the release pattern won't form correctly with it. For any flag another thread will read, use a strong store such as `st.relaxed` or `st.release` (the baked-in form discussed above). (`.acquire` and `.acq_rel` do not apply to ordinary stores.)

The same applies to the consumer's flag read: use `ld.relaxed [flag]` or `ld.acquire [flag]`, not plain `ld [flag]`. (`.release` only applies to stores, not loads.)

### Spin loops are normal — fences don't push data

A common confusion is "I issued the release, why doesn't the consumer see it immediately?" The release fence orders your writes; it doesn't shove them down other threads' throats. The consumer's `flag` read may still return `0` for a while after the producer wrote `1`, because the new value has to propagate through the memory system.

That's why the consumer is in a `while (flag == 0)` loop — it's bridging the propagation gap. This is the standard, correct idiom.

### Memory ordering is about visibility, not synchronization

A second and related confusion: people see "fence" and assume it makes threads pause or wait for each other. It doesn't. Fences and release/acquire qualifiers are entirely about **what one thread sees in memory when it reads** — not about pausing or aligning threads in time.

Two different concerns, two different toolboxes:

-   **Visibility** (this article): one thread's writes become observable to another thread's reads, in a well-defined order. Fences and release/acquire qualifiers handle this. A fence may wait until the calling thread's relevant memory operations have reached the point of coherence for its scope, but it **doesn't wait for another thread** to arrive, acknowledge, or read anything.
-   **Synchronization** (a separate concern): threads actually pause and align in time — e.g., "no thread proceeds past this point until all threads have arrived." That's the job of barriers like `bar.sync`, `barrier.cluster`, and the `mbarrier` object. We'll cover those in the next article.

The spin loop in our consumer code is what bridges the two when you want them together: the consumer wants to wait for the producer, so it busy-loops on the flag. That waiting is the programmer's choice (the `while` loop), not something the fence is doing for them.

Keeping these two ideas separate is one of the most useful mental moves you can make in concurrent GPU programming. The memory model is purely about visibility; for actual "wait until X" behavior, reach for the synchronization primitives in the next article.

### Fences have a "scope"

In PTX you'll write things like `fence.release.gpu` or `fence.release.cta`. The scope says which threads can directly participate in the ordering guarantee.

To understand why scope matters, picture the GPU's memory as a layered hierarchy, with caches and storage at different distances from each thread:  

```text
   Per-SM:    L1 / shared-memory crossbar       (closest, fastest)
   Cluster:   DSMEM crossbar (Hopper+)
   Chip:      L2 cache                          (chip-wide)
   System:    HBM and host-memory fabric        (farthest, slowest)
```

For two threads to communicate via a release/acquire pair, the operations must use a scope that includes both threads. A useful hardware mental model is that wider scopes generally have to order through a farther-away coherence point, so they cost more. The exact cache behavior is an implementation detail; the architectural rule is the set of threads covered by the scope.

The scopes are:

-   **`.cta`** — between threads in the same thread block. This is the smallest PTX memory-model scope and is usually the cheapest.
    
-   **`.cluster`** — between threads in the same thread block cluster (Hopper's new feature). This is useful for cluster-level shared memory and cluster barriers.
    
-   **`.gpu`** — between any threads in the current program on the same GPU. In the usual global-memory mental model, this means ordering at a chip-wide level such as L2, so it is more expensive than `.cta`.
    
-   **`.sys`** — across the whole program, including host threads and kernels on other GPUs. This may involve the system fabric and is the most expensive scope.  
    

```text
Rough hardware mental model:

   .cta     ──►  usually local CTA-visible path
   .cluster ──►  cluster-level shared-memory network
   .gpu     ──►  chip-wide ordering point, often L2
   .sys     ──►  system-visible fabric

           ──── generally increasing cost ────►
```

**Pick the smallest scope that covers your producer-consumer pair.** A `fence.release.cta` is much cheaper than a `fence.release.gpu`, which is much cheaper than a `fence.release.sys`. There's no reason to pay for a wider scope than your actual readers need. If both threads are guaranteed to be in the same CTA, use `.cta`. If they could be on any SM, you need `.gpu`.

We'll see scopes again in later articles when we discuss thread block clusters and the TMA engine.

### Single-threaded code never needs fences

If only one thread is touching some piece of memory, you don't need any of this. The reordering issues only matter when there's a second thread observing. Inside one thread, you get this guarantee for free:

> Whenever you read a memory location, you see the most recent value _your own thread_ wrote to **that same location** — in source-code order, no fences needed.

The important nuance is the phrase **"that same location."** The compiler and hardware are still free to reorder operations to _different_ memory addresses, even within a single thread. That reorder is invisible to you, because nothing inside your thread depends on the order. For example:  

```text
data[0] = 42;        // (1)
data[1] = 99;        // (2)
x = data[0];         // (3) guaranteed to see 42 — same address as (1)
```

Here, `(1)` and `(2)` write to _different_ addresses, so the compiler may commit them to memory in either order. But `(3)` reads from the same address as `(1)`, so it's guaranteed to see `42` — the per-address ordering rule pins this down. From your thread's perspective, the reorder of `(1)` and `(2)` is invisible because nothing in your code reads `data[1]` afterward to detect it.

This is exactly the source of the bug at the start of the article: the producer's `data` write and `flag` write are to _different_ addresses, so they can be reordered freely from the producer's own perspective. It only becomes a problem because _another_ thread (the consumer) reads both addresses and notices the reorder. The fences fix it for that exact case.

So the rule is: fences are needed only at the precise places where two threads communicate, and even then only because they need to coordinate their views of _different_ memory addresses. Within one thread, same-address reads work without fences.

* * *

## Mental model summary

If you remember nothing else from this article, remember this:

> **Memory ordering on a GPU is a contract between a producer and a consumer.**
> 
> The producer uses a **release fence** to publish all its prior writes before announcing "done."
> 
> The consumer uses an **acquire fence** to ensure all its subsequent reads see fresh data after observing the "done" signal.
> 
> Both halves of the contract are needed. Each fence is a one-way wall — release pins prior writes above it; acquire pins subsequent reads below it. Together they make a producer-consumer pattern correct on a system where independent operations can otherwise be reordered freely.

* * *

## What's next in this series

The memory consistency model is the foundation. With it in hand, the rest of the Hopper stack starts to make sense. Coming up:

-   **Execution synchronization** — `bar.sync`, `barrier.cluster`, and how to align threads in time (not just memory).
-   **`mbarrier`** — a programmable synchronization object that combines memory ordering, thread arrival counting, and async-engine completion tracking. The Hopper workhorse.
-   **Asynchronous copies** — the TMA engine, `cp.async.bulk`, and the powerful but subtle `CUtensorMap` descriptor.
-   **`wgmma`** — Hopper's warp-group matrix multiply-accumulate, the engine that drives modern GEMM and attention kernels.

Each will build on the same release-acquire ideas you just learned. The TMA engine, mbarriers, and warp-group MMA all rely on exactly the same kind of "one side publishes, the other side acquires" contract — just with more sophisticated machinery to support things like async byte-counting and distributed shared memory.
