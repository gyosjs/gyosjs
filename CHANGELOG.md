# Changelog

All notable changes to GyosJS are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/gyosjs/gyosjs/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/gyosjs/gyosjs/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/gyosjs/gyosjs/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/gyosjs/gyosjs/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/gyosjs/gyosjs/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/gyosjs/gyosjs/releases/tag/v0.1.0
