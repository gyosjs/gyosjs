# Reference app performance follow-up — 2026-11-15

This pass measures existing applications before proposing another API or project. It produced two app improvements and a small **unreleased core candidate**. Public runtime/package versions have not changed.

## Workloads and provenance

- Sumboard: published GyosJS 0.5.5, real production HTML/CSS/JS, 500 supported rows plus 1,000/2,000-row benchmark-only overrides. Edit, reverse sort, filter to 10%, restore; history/persistence stay enabled. Five samples after warmup, sequential Windows Chrome runs, no throttling. [Method, timings and raw evidence](https://github.com/hohphu8/sumboard/blob/main/docs/PERFORMANCE.md).
- Bloomfall: pinned GyosJS **0.5.1**. Rivergate: pinned **0.5.5**. Bundle comparisons hold each app's version fixed; do not interpret the difference between apps as a runtime-version comparison.
- Builds use Vite 6.4.6 and Node 22.18.0. Browser measurements use Chrome 157.0.8103.78 on Windows 10.0.26300 / Intel Core i5-10210U, Playwright 1.55.1. Times are local observations, not cross-device guarantees.

## Sumboard: distinct costs

Sharing validated, unchanged frozen rows across document snapshots reduces the distinct retained row objects from **40,500 to 580** for 500 rows and 80 one-row edits. The arrays still hold 40,500 row references; validation still allocates temporary rows. This is an exact identity count, not a heap-byte or leak claim. Validation runs before equality/reuse, so malformed or mutable external input cannot bypass normalization.

That app change did **not** reduce UI writes. The current keyed row context tracks `{ list, index }`: a new filtered/list reference invalidates the row effects even if the item object is unchanged. Keeping row identity is useful for retained history, but is not by itself fine-grained row rendering in this implementation.

The core binding candidate removes redundant writes after evaluation. It compares actual DOM properties/attributes rather than caching the last expression value, so an external edit still reconciles. URL/name checks still execute; it does not skip effects or weaken their dependency tracking.

| One edit | Current 0.5.5 | Candidate |
| --- | ---: | ---: |
| 500 rows: input value writes / attribute mutations | 2,001 / 6,500 | 1 / 1 |
| 1,000 rows (stress) | 4,001 / 13,000 | 1 / 1 |
| 2,000 rows (stress) | 8,001 / 26,000 | 1 / 1 |

The remaining value write is Sumboard's own edit normalization. Sort legitimately updates index-based labels; restoring filtered-out rows creates controls again. No attempt is made to suppress these required writes.

With the shared model, the 500-row edit's median dispatch-to-next-task time changed from 159.3 to 121.5 ms; script time from 124.6 to 82.9 ms. Sort was 448.0 to 313.2 ms, with a substantial layout component. Domain filtering/sorting/summarizing was generally about 0–2 ms in those instrumented samples, and edit validation/save were single-digit milliseconds. The bottleneck is primarily on the UI side of this workload, not simply arithmetic.

The same 500-row restore still took a median 585.7 ms with the candidate; 2,000-row restore took 2,264.4 ms. Keep the product limit at 500. Timings include instrumentation and scheduling; sample order was not randomized. The deterministic write counts are stronger evidence than any claimed universal percentage speedup. See the app report for all samples and overlapping timing definitions.

## Bundle costs: use existing exports first

Controlled experiments build four variants of each app: default object vs selected named exports, standard vs CSP. [Raw artifact/module evidence](./evidence/performance-2026-11-15/app-bundles.json). Sizes below are decimal kB for the main application JS, **not GyosJS alone**, with Node gzip:

| App / pinned runtime | CSP default | CSP selected | Standard default | Standard selected |
| --- | ---: | ---: | ---: | ---: |
| Bloomfall / 0.5.1 | 245.88 / 77.74 | 203.48 / 64.70 | 121.77 / 40.75 | 79.46 / 27.69 |
| Rivergate / 0.5.5 | 252.82 / 79.82 | 208.80 / 66.26 | 128.84 / 42.90 | 84.88 / 29.26 |

Each cell is raw / gzip. Rivergate's separate bot Worker remains **3.59 / 1.77 kB** in every variant. Per-module rendered lengths in the JSON are before final minification; they cannot be added as compressed-size attribution. No loading-time or parser-startup benchmark was performed.

The default `Gyos` object exposes the full API. Static namespace/named imports let the consumer bundler remove more unused exports. Both apps now use the existing namespace surface:

```js
import * as Gyos from 'gyosjs/csp';
```

This preserves `Gyos.scope(...)` syntax. It is **not identical to the default object**: `version` is not a named export. Rivergate's development probe reads version from `gyosjs/package.json` instead. Dynamic namespace access or passing the whole namespace to another component can prevent the same savings; verify the actual application build.

Actual production source builds after this change ([artifact evidence](./evidence/performance-2026-11-15/namespace-imports.json)):

| Main app JS | Before raw / gzip | After raw / gzip |
| --- | ---: | ---: |
| Bloomfall | 245.88 / 77.74 kB | 203.37 / 64.64 kB |
| Rivergate | 252.82 / 79.82 kB | 208.71 / 66.22 kB |

About **17% less gzip JS** in these builds, without changing their runtime pins, template language or CSP policies. The selected-export experiment constructs a small object from explicit imports; actual source uses the namespace, so their exact byte counts differ slightly.

The standard variants are comparison builds only. CSP includes an Acorn parser and expression interpreter to avoid dynamic function compilation. The standard runtime has different policy requirements; switching simply to obtain a smaller bundle would change the integration contract. The size gap alone does not establish that Acorn should be removed or a new entry should be added.

## Reproduce and decisions

Validation for this change: **407 core unit/integration tests**, package/type/CSP checks, and **6 binding browser regressions** across standard/CSP and Chromium/Firefox/WebKit passed. App checks passed: Sumboard 11 domain tests plus 43 production browser cases (5 existing skips); Bloomfall 5 engine tests, 46 development browser cases (2 existing skips) and one production smoke; Rivergate 18 rules/Worker tests plus 42 production browser cases (6 existing skips). Rivergate's development version probe and EN/VI installation guidance were also checked. Skipped production-only lifecycle probes are not counted as coverage from those runs.

From this core repository, with its dependencies installed and each app's pinned dependencies installed:

```sh
node scripts/measure-app-bundles.mjs ../bloomfall ../rivergate
```

The script writes comparison assets under each app's ignored `.local/bundle-*` folders and a JSON report under this repo's ignored `.release-tmp/`. It does not edit source/lockfiles or replace shipped `dist/`. The four variants always use the dependency installed in that app. The [Vite production build guide](https://vite.dev/guide/build) describes the bundling workflow; the measured retention here comes from the emitted artifacts.

Decisions:

1. Ship app-level immutable history sharing and CSP namespace imports with their existing regression suites. Neither requires a new npm runtime release.
2. Keep the core write guard under **Unreleased**, with unit and standard/CSP browser regressions for unchanged writes, external DOM repair, safety checks and focus/selection. Release it through the normal version/publish process; do not silently deploy an alias as 0.5.5.
3. Defer a new smaller entry, per-row reactive API or virtualization feature. Existing exports already provide a measured saving. A larger editor needs an explicit pagination/virtualization design with keyboard and accessibility validation.
4. Measure cold startup/parse costs separately before optimizing the CSP parser, and isolate finer keyed-row dependency tracking before changing that semantic boundary. Current measurements do not justify skipping effects based only on object identity.
