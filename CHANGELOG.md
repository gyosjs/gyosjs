# Changelog

All notable changes to GyosJS are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.5] - 2026-11-13

### Fixed

- Respect Proxy invariants for nested frozen/locked data: return exact locked property values and preserve keys/descriptors that cannot legally be hidden. Replacing a mutable containing field remains reactive; sealed writable fields still update.
- Use one template pipeline for `g-static` roots and descendants. Render initial conditions, lists, switches and bindings once, preserve nested-scope ownership, and settle only the initial await request with cleanup protection. Static branches do not install template interaction handlers; an outer reactive structural directive can still remove/recreate them.
- Detach unobserved computed values from upstream subscriptions, including chains whose last consumer stops. Later reads validate the cached dependencies and subscriptions can resume; synchronous computed reads and effect/batch scheduling remain unchanged.
- Deep watches preserve cyclic/shared references and compare Map/Set snapshots instead of treating collections as empty objects. Sparse array lengths are preserved. Native collection mutations are still not reactive: replace the collection to notify consumers. Collection comparison includes iteration order.
- Honor cleanup during initial template/effect/watch execution. Do not resurrect the scope, run later queued bindings, attach a late disposer, or create its portal after cleanup. Scope observers registered through an old disposed context do not start; an explicit remount creates a new lifetime.

## [0.5.4] - 2026-11-12

### Fixed

- Keep array length/index readers current after implicit growth or truncation, and notify readers when a scope field switches to another store. Accept null-prototype data and fields named `hasOwnProperty`; deep watches distinguish Date values and changed undefined-valued keys.
- Preserve debounced watcher context and cancel pending callbacks on disposal. Release effects even when stopped during execution or from their previous cleanup. Contain throwing scope lifecycle hooks, support self-cleanup in `onMount`, and consume global once listeners before reentrant callbacks.
- Give the latest `useFetch`/`useAsync` execution ownership of data, errors and loading. Their new `onUnmount` hooks invalidate pending results; `onMount` reactivates the composable. Requests themselves are not aborted. Compose lifecycle hooks explicitly when combining multiple composables.
- Dispose structural comment effects, replaced `g-html`/`g-text` children and owner-linked portals. Keep unrelated siblings when unkeyed lists rerender; mount branch-root child scopes once; keep await aliases connected to parent state and discard late await results after cleanup.
- Render static scope roots once, confine refs to their declared scope, preserve custom CSS property case, and apply prevent/stop event modifiers before debouncing callbacks.
- Evaluate quoted expressions normally. Accept literal percent signs in scope definitions. Align CSP call evaluation order, optional-call argument skipping and postfix numeric coercion with JavaScript behavior.
- Register dynamically rendered validation controls and unregister removed controls. Ignore stale async validation results, revalidate values edited during a pending validation, and reject invalid integer/calendar values while enforcing numeric bounds on zero.
- Resolve router fragments as decoded element IDs, including numeric IDs, punctuation and Unicode, instead of treating fragments as CSS selectors.
- Reconstruct reactive partial targets from response HTML on history navigation instead of replaying a DOM clone whose bindings were already consumed. Static partial history keeps its fragment cache. Reactive targets may require a fresh GET when no response snapshot exists; arbitrary client state is not serialized.
- Preserve parsed directive attributes such as `@click` and `*if` during DOM morphs on browsers whose `setAttribute` rejects those names, preventing history restoration from falling back to a full page load.

### Documentation

- Correct load-more page increments, router bubbling and validated form submission descriptions; repair dynamic class and rejected-promise examples. Add executable documentation regressions.

### Compatibility

- Object/factory scope sharing and reactive scheduling remain unchanged. When composing async helpers with other lifecycle hooks, forward their onMount/onUnmount hooks explicitly.

## [0.5.3] - 2026-11-12

### Fixed

- Resolve the mounted reactive instance when registering scope `$watch` and `$effect`. Factory scopes can register observers in `onMount` through either `this` or the captured factory context; observers are cleaned up with their own mount.

### Documentation

- Clarify object reuse versus fresh factory state, explicit state sharing, array watch paths, and signal/effect scheduling in the scope and reactivity guides.

## [0.5.2] - 2026-11-12

### Fixed

- Preserve callable signal and computed identity inside reactive scopes, nested objects and arrays. `g-model` writes to the original signal instead of replacing the scope field, and `.value`, `.peek` and signal methods remain available. Effects switch dependencies when a signal/computed field is replaced; ordinary scope methods keep their bound `this` behavior.
- Unwrap nested boolean signals before setting a checkbox's checked state, so `g-model="form.accepted"` follows the signal value rather than treating the callable itself as truthy.

## [0.5.1] - 2026-11-11

### Changed

- Keyed lists retain the longest already-ordered subsequence of contiguous rows, reducing DOM moves for swaps and rotations. Placement around leaving transition nodes and unrelated siblings retains the existing behavior.

### Fixed

- Restore a surviving focused control and its text selection when keyed placement moves its row, without remounting nested scopes or refocusing a removed row.

## [0.5.0] - 2026-11-11

### Added

- Public `navigate(url, options)` and `refresh(options)` APIs for same-origin GET navigation, with history, target, swap, scroll and cancellation options. Each promise resolves with its own final navigation context after lifecycle hooks finish. Refresh bypasses preloaded responses.
- Debug diagnostics identify `g-reveal` elements without an owning scope, excluding intentionally ignored subtrees.

### Fixed

- Persisted media stays connected while a body outlet is replaced and navigation waits for scripts, including interrupted commits. The parking host moves outside the swap target and returns before scope mounting.

### Documentation

- Explain rendered HTTP errors, idempotent widget mounting, asynchronous page lifetimes, and persistent audio layout choices. Navigation guards remain application-owned; the new APIs do not submit or replay mutations.

## [0.4.1] - 2026-11-11

### Fixed

- Cached computed values refresh on the next read immediately after a dependency write, including inside a batch. Chained and diamond dependencies no longer expose mixed old/new values to effects.
- Computed evaluation stays lazy after the first read. Unchanged derived results suppress downstream work using `Object.is`, including correct NaN and signed-zero handling.
- Computed subscriptions establish dependencies before the first explicit read. Unsubscribing cancels pending signal/computed callbacks, and a pending write followed by a batch no longer runs the same effect twice for the final state.
- Subscription and cleanup callbacks do not accidentally add dependencies to an enclosing effect. Writes from plain subscribers continue to flush in subsequent microtasks.

### Maintenance

- Browser CI pins Ubuntu 24.04 for Playwright 1.55.1. Vite/Vitest and transitive dependency patches remove high/critical development-tool audit findings; constructor mocks support Vitest 4.
- Full tests use Node.js 22; Node.js 18.20 still verifies library builds and package consumption.

### Compatibility

- Initial effects remain synchronous, ordinary effect updates remain microtask-coalesced, and the outermost batch still flushes affected effects synchronously. Computed callbacks must be pure; code must not rely on stale reads or unobserved background recalculation. Existing error isolation is retained. No new public API is introduced.

## [0.4.0] - 2026-09-14

### Added

- Router hooks return unsubscribe and receive typed navigation context. `onBeforeSwap` runs once a response is accepted; `onNavigationEnd` reports success, HTTP/network failure, abort, invalid response and fallback with DOM commit state.
- Boosted forms emit paired `gyos:form-start` / `gyos:form-end` document events and suppress duplicate pending submissions.
- `g-boost-errors="422"` opts into rendering selected HTML error statuses without replaying a mutation, caching an error snapshot or changing history.
- `g-head-persist="key"` retains explicitly owned head nodes, including pending runtime SDK scripts, through boost and history.

### Fixed

- Form requests include the submitter and honor action/method/target overrides without controls named `action` or `method` clobbering DOM properties. Explicit URL encoding is supported; native targets, cross-origin, dialog, image and text/plain flows remain native.
- Shared relative/absolute head resource URLs keep their node and do not re-execute pending scripts. The live document base, incoming response URL, query strings and execution/security attributes remain significant.
- Responses containing `<base href>` fall back to native GET navigation so the browser enforces CSP `base-uri`. Already-sent POSTs are not replayed and keep the current DOM with an `invalid-response` outcome. Prefer root-relative assets for boosted responses.
- Full HTML outlet replacement and snapshot history synchronize `html.lang` and `html.dir` without overwriting client-owned HTML attributes or changing document language on partial/additive updates.
- The router progress bar reconnects after body-outlet swaps and removes stale snapshot clones.

### Migration

- Move external widget teardown from request-start `onBeforeNavigate` to `onBeforeSwap` or scope cleanup. Existing one-argument before/after callbacks still work.
- Inspect both `outcome` and `committed`; a rendered 422 is still an HTTP error, and an aborted page script may follow an applied DOM swap.
- `g-current-head` also preserves document language/direction. Shared body class/data ownership is unchanged except for existing body-outlet root synchronization.
- SDK nodes retained by `g-head-persist` keep their original attributes. Reload to adopt a changed provider URL/version. The marker does not relax CSP or unload SDK globals.

## [0.3.2] - 2026-08-26

### Fixed

- CSP runtime no longer evaluates nested structural expressions inside dormant `*pending`, `*then`, or `*catch` branches before their `*await` alias scope exists.
- Await aliases now work with nested `*if` and `*for` expressions without requiring placeholder values in the parent scope.

## [0.3.1] - 2026-08-19

### Fixed

- `g-transition="fade"` and other plain transition names are treated as literals in both runtimes; dynamic transition names now use explicit `{expression}` syntax without CSP undefined-identifier noise.
- MPA Boost reconciles fetched style, stylesheet-link, script, and nonce metadata with the active document nonce, deduplicates head assets across per-response nonce changes, and skips unsafe inline styles when no active nonce is available.
- CSP navigation normalizes inline style nonces before detached parsing, preventing transient `style-src-elem` violations when each server response generates a fresh nonce.

## [0.3.0] - 2026-08-18

### Added

- Optional strict-CSP distributions are available through `gyosjs/csp`, `gyosjs/csp/auto`, and the corresponding ESM, UMD, and minified CDN files without `Function()` or `eval()`.
- `gyosjs/styles.css` and `dist/gyos.css` provide built-in transition, cloak, and target-spinner styles without runtime `<style>` injection.
- `Gyos.setCspNonce()` configures the active document nonce used for scripts recreated by MPA Boost.
- CSP unit, browser, package-consumer, and static distribution checks cover the restricted expression runtime and strict response headers.

### Changed

- Expression evaluation now uses an internal runtime adapter so the standard build keeps full JavaScript expression behavior while the CSP build uses a cached AST interpreter.
- MPA Boost replaces fetched script nonces with the active document nonce in CSP mode and skips nonce-less inline scripts when no active nonce is configured.

### Security

- CSP expressions do not resolve implicit browser globals and block access through `constructor`, `prototype`, and `__proto__`. CSP mode remains an application-code compatibility layer, not a sandbox; `g-html` still requires trusted or sanitized HTML.

## [0.2.4] - 2026-08-15

### Fixed

- MPA Boost now lets cancelable link clicks and form submissions reach application handlers before interception, so `preventDefault()`, inline `return false`, and confirmation dialogs can stop navigation.
- Validated `g-form` submission replay preserves application cancellation and clears temporary Router approval, allowing later submissions to proceed normally.

## [0.2.3] - 2026-08-13

### Added

- Built-in `g-reveal` exposes one-shot or repeating viewport state with shared observers, reduced-motion fallback, parent observation, and automatic MPA lifecycle cleanup while leaving animation CSS to the application.

### Fixed

- String and ternary `:class` bindings preserve static classes while removing only stale classes managed by the binding.
- String and object `:style` bindings preserve unrelated static declarations, restore overridden static values, and remove stale dynamic properties.
- Reactive objects now track missing property reads and enumeration shape, keeping later assignments, key additions/deletions, in-place `:class`/`:style`, and `Object.keys/values/entries` consumers current.
- Custom directives mount when their value is omitted or initially `undefined`, allowing later reactive updates instead of silently skipping initialization.
- `g-ignore-outside-click` skips the current click, including clicks on marked descendants, without disabling future `@click.outside` handling.
- Models rendered inside `*for` can write inherited or auto-created primitive properties back to their parent scope; asynchronously rendered radio values, checked state, and classes remain aligned.
- `g-reveal` uses the full viewport by default so elements at the end of a document can intersect; applications can still opt into a negative `rootMargin` when layout spacing permits it.

## [0.2.2] - 2026-08-10

### Fixed

- Validated forms now complete `g-form` validation before MPA Boost handles their submit, preventing full-page redirects and duplicate or pre-validation requests.
- Radio `g-model` bindings preserve option values, synchronize checked state, and auto-bind the selected option; checkbox and radio validation now reads only selected controls.

## [0.2.1] - 2026-08-10

### Fixed

- MPA Boost removes `noscript` fallback content from fetched documents and cached snapshots before swapping, preventing `DOMParser` from turning inert fallback styles or markup into active page content.

## [0.2.0] - 2026-08-09

### Added

- Reactive `:attribute` bindings now support ARIA, data, form metadata, and custom attributes with boolean and removal semantics.
- `g-transition` now animates elements controlled by `g-show` while preserving their DOM identity and original display mode.

### Changed

- Built-in transition utility classes use the `gyos-t-` namespace to avoid collisions with application CSS and Tailwind utilities.
- Router swaps initialize newly committed directives, events, bindings, models, and text inside an existing parent scope.

- Maintenance tooling now verifies release metadata, documentation mirrors, live distribution endpoints, and Chromium/Firefox/WebKit browser behavior.
- The minimum Node.js maintenance runtime is now stated precisely as 18.19 instead of the broader Node.js 18 range required by current tooling.

### Fixed

- Template interpolation skips raw-text and fallback containers such as `style`, `script`, `noscript`, and `textarea`.
- Rapid transition toggles cancel stale enter/leave work without removing an element whose latest `g-show` state is visible.

## [0.1.2] - 2026-08-07

### Added

- Named scope factories now create a fresh reactive instance for every mount and apply element `gd-*` values before template binding.
- MPA Boost supports `g-router-remove` to remove a trigger only after its navigation commits, including load-more controls used with additive swaps.

### Fixed

- Repeated MPA visits to server-initialized factory scopes no longer reuse stale form state from a previous route.

## [0.1.1] - 2026-08-07

### Fixed

- MPA Boost now consumes rejected View Transition `ready` and `finished` promises when a newer navigation skips the active transition, preventing handled navigation cancellation from surfacing as unhandled browser errors.

## [0.1.0] - 2026-08-04

### Added

- Fine-grained signals, computed values, effects, batching, stores, dependency injection, events, pipes, composables, and form validation.
- HTML-first scopes, text interpolation, attribute bindings, event directives, models, structural directives, transitions, portals, and lifecycle hooks.
- MPA Boost navigation with outlets, target swaps, snapshots, preload, history and scroll handling, persisted islands, script policies, and View Transitions.
- Core ESM/UMD bundles, browser auto-init bundles, TypeScript declarations, npm exports, and CDN entry metadata.
- Unit, integration, browser E2E, package-consumer, and release verification suites.

### Fixed

- Keyed `*for` insertion order no longer depends on whitespace around the template node.
- `*await` ignores stale Promise results after its expression starts a newer request.
- Form validation recognizes modified `g-model` attributes and cleans up DOM listeners and timers on unmount.
- Documented `:alt`, `:title`, and `:selected` bindings are processed reactively.
- Effects ignore non-function return values instead of attempting to execute them as cleanup callbacks.
- Transition configs can be read by registered name or from duration-modified elements.

### Stability

- This is an experimental `0.x` release. Router, morphing, expression evaluation, and browser edge cases should be evaluated against an application's requirements before production adoption.

[Unreleased]: https://github.com/gyosjs/gyosjs/compare/v0.5.5...HEAD
[0.5.5]: https://github.com/gyosjs/gyosjs/compare/v0.5.4...v0.5.5
[0.5.4]: https://github.com/gyosjs/gyosjs/compare/v0.5.3...v0.5.4
[0.5.3]: https://github.com/gyosjs/gyosjs/compare/v0.5.2...v0.5.3
[0.5.2]: https://github.com/gyosjs/gyosjs/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/gyosjs/gyosjs/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/gyosjs/gyosjs/compare/v0.4.1...v0.5.0
[0.4.1]: https://github.com/gyosjs/gyosjs/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/gyosjs/gyosjs/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/gyosjs/gyosjs/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/gyosjs/gyosjs/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/gyosjs/gyosjs/compare/v0.2.4...v0.3.0
[0.2.4]: https://github.com/gyosjs/gyosjs/compare/v0.2.3...v0.2.4
[0.2.3]: https://github.com/gyosjs/gyosjs/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/gyosjs/gyosjs/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/gyosjs/gyosjs/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/gyosjs/gyosjs/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/gyosjs/gyosjs/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/gyosjs/gyosjs/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/gyosjs/gyosjs/releases/tag/v0.1.0
