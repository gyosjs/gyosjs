# Keyed-list placement benchmark

This work follows the Bloomfall match-three workload: surviving tile IDs retained DOM identity, but 24 moves produced many child-list mutations. The change is internal to keyed `*for`; no directive, public API or replay rule changes.

## Reproduce

Use Node 22 and installed Playwright browsers. Run from the GyosJS repository root:

```sh
node scripts/benchmark-keyed-list.mjs path/to/published/gyos.csp.auto.min.js baseline.json
npm run build
node scripts/benchmark-keyed-list.mjs dist/gyos.csp.auto.min.js candidate.json
```

Windows uses installed Chrome; other platforms use Playwright Chromium. Each scenario uses 64 keyed rows and 20 fresh mounts. Measurement begins before a synchronous batch and ends after pending row microtasks. It excludes initial mount, layout/paint presentation and user input. Raw results include environment and timing; the deterministic DOM-move count is the primary comparison, not a universal FPS claim.

## Placement strategy

Previously, rows were greedily inserted from the beginning of the desired list. Swapping distant rows could move the entire interval between them. The new placement pass reads the actual contiguous DOM order, finds a longest increasing subsequence and moves the remaining rows from the end. Already ordered rows do not move. Existing row scopes still receive the new item and index.

New rows are created/processed in forward order as before. When managed rows are interleaved with a pending leave transition, an unrelated sibling or an externally detached node, placement uses the established contiguous-after-placeholder behavior. That fallback intentionally favors compatibility over the minimum number of moves. Mixed insert/reorder operations can also incur initial insertion plus final placement; the minimum-move claim applies to a contiguous reorder of existing rows.

Moving DOM with `insertBefore` can blur a focused descendant. Placement restores a surviving owned control with `preventScroll` and restores text selection where supported, unless another control has acquired focus. This does not promise suppression of native focus events or preservation of arbitrary embedded media state.

## Validation

- Mutation counts for unchanged order, adjacent/distant swaps, both rotations, reversal, prepend and removal.
- Every permutation of five existing rows, stable DOM identity and correct current labels/indexes.
- Mixed insertion/removal with unrelated siblings, and pending leave/re-add transitions.
- Focused text input and selection, nested scope mount/unmount counts, removed-row cleanup.
- Standard and CSP bundles on Chromium, Firefox and WebKit, plus existing library regressions.
- Bloomfall gameplay, replay, storage, pointer capture and teardown against a candidate runtime on a separate local port. Its installed `gyosjs@0.5.0` dependency stays unchanged until an actual release.

## Results (2026-11-11)

Raw evidence: [published 0.5.0](benchmark-results/keyed-baseline.json) and [candidate](benchmark-results/keyed-candidate.json). Each report includes the tested bundle's SHA-256. Both runs used headless Chrome 157, Node 22.18.0, Windows and an Intel i5-10210U, without throttling.

| Scenario (64 rows) | Existing-row moves: 0.5.0 | Candidate | Median batch time: 0.5.0 / candidate |
| --- | ---: | ---: | ---: |
| Same order, updated values | 0 | 0 | 1.7 / 1.6 ms |
| Adjacent swap | 1 | 1 | 1.6 / 1.2 ms |
| Swap positions 1 and 62 | 61 | 2 | 1.5 / 1.2 ms |
| Rotate left by one | 63 | 1 | 1.6 / 1.1 ms |
| Reverse | 63 | 63 | 1.4 / 1.6 ms |
| Prepend one new row | 0 | 0 | 1.0 / 1.2 ms |
| Remove one row | 0 | 0 | 1.1 / 1.0 ms |

All 20 iterations of every scenario preserved expected order, labels and existing DOM identities, with no page errors. Prepend/remove counts exclude creation/removal themselves. Timings are mixed: candidate reversal/prepend medians increased, and timing tails are noisy. This demonstrates fewer DOM moves for particular reorder patterns, not universally faster updates.

Bloomfall's separate comparison harness ran the same `audit-garden` seed to completion against published 0.5.0 and the candidate CSP ESM bundle. Both completed 24 moves, score 3,480 and 184 controller frames. Board child-list additions and removals each fell from **1,087 to 393 (63.8%)**, including both moves and actual tile replacements. Both preserved **1,430 / 1,430** surviving-node identity comparisons and ended with 64 tiles. The game's dependency and lockfile remain on published 0.5.0.

The two game runs measured input-to-next-rAF medians of 85.0 / 30.9 ms and p95s of 179.3 / 76.8 ms. These are sequential development-mode samples, not a controlled timing study: an earlier published-runtime run already measured a 29.1 ms median. Do not attribute the entire timing difference to this change. Twelve cleanup/GC cycles in each run retained zero retired roots and zero pending frames, with stable 3,810 DOM nodes and 16 listeners. Heap levels differed between the dependency-optimized baseline and direct-source candidate (~3.86–4.03 MB / ~5.34–5.49 MB); this comparison cannot establish a memory reduction or prove leak-freedom. Raw game evidence is kept in Bloomfall's `docs/evidence/keyed-{baseline,candidate}.json`.

Validation completed against this candidate:

- `npm run check`: unit/integration tests, type checks, documentation validation, all bundle builds, packed-package smoke and CSP checks passed. The final unit suite has **313 tests across 32 files**, after removing two duplicate test cases.
- Core browser regressions: **123 passed / 6 skipped**, including 12 new keyed-list cases across Chromium, Firefox and WebKit. Skips are the existing Windows WebKit audio capability cases.
- Bloomfall browser suite with the candidate runtime: **46 passed / 2 skipped**. The two skips are CDP-only touch cases on non-Chromium browsers.

This internal optimization is included in the 0.5.1 release. The measurements above compare the original 0.5.0 baseline with the pre-release candidate; they are retained as historical evidence. No new API is introduced.
