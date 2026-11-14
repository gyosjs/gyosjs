# Reference application follow-up

Reviewed 2026-11-14 against the four standalone projects and the GyosJS 0.5.5 contract. Historical app notes describe the runtime at the time of their measurements; an old note saying a candidate is unreleased does not supersede the release changelog.

| Evidence | Classification and current status | Follow-up |
| --- | --- | --- |
| Bloomfall: retained keyed nodes moved unnecessarily during swaps/rotations | Core improvement shipped in 0.5.1, including focused-control preservation | Keep identity and actual DOM moves separate from timing claims; no new optimization without a measured workload |
| Rivergate: callable signals lost identity/metadata inside reactive scopes; direct model writes broke | Core fix shipped in 0.5.2 | Keep the direct signal/model regression; no accessor workaround needed on current versions |
| Scope factories: mount-time `$watch`/`$effect` ownership | Core fix shipped in 0.5.3, then further lifecycle hardening in 0.5.4/0.5.5 | Ownership examples and cleanup regressions are part of the public contract |
| Sumboard: validated drafts, snapshot history, computed totals and browser resources | Application structure; no new API required | Covered by the editor-history recipe |
| Mosswatch: continuous Canvas simulation beside reactive controls | Application structure; no isolated core defect | Covered by the external-engines recipe; distinguish frame, bridge-check, signal-write and DOM-update rates |
| Rivergate + Sumboard: generic HTML formatting can split a quoted string inside interpolation | Repeated authoring/tooling problem, not evidence that invalid JavaScript should become valid | Next focused investigation: pin a formatter/version/config, reproduce formatting valid HTML into a broken expression, then decide between documented authoring guidance and extension support |
| Rivergate Worker results and Sumboard file imports can finish after state changes | Application async ownership, not automatic signal semantics | A later Worker recipe can teach cancellation plus request/generation checks; current engine recipe points to the real client |
| Bloomfall CSP bundle size and large-document projection costs | Measured tradeoffs, not established need for another entry/API | Profile production imports and actual workloads before proposing smaller entries, per-row state or virtualization |

## Proposed next investigation: template formatting

The issue was independently recorded in [Rivergate](https://github.com/hohphu8/rivergate/blob/main/docs/DOGFOOD.md) and [Sumboard](https://github.com/hohphu8/sumboard/blob/main/docs/DOGFOOD.md). The apps use short bindings and put long display text in JavaScript functions/computed values. Do not silently repair malformed strings in the runtime.

Before changing the VS Code extension:

1. Preserve a minimal valid source and exact formatter output, with formatter version, parser and configuration.
2. Run both in standard and CSP builds to identify the first broken boundary. Distinguish HTML parsing (`<` in text) from JavaScript string syntax and from Gyos expression evaluation.
3. Inspect the extension's existing language regions, diagnostics and formatter integration. A diagnostic or documentation fix may be sufficient; a complete formatter is a larger commitment.
4. If a fix is justified, test strings, braces, multiline expressions, normal HTML attributes, script/style regions and cursor/selection behavior. Do not change public runtime syntax merely to accommodate one formatter.

This is a recorded next step, not a shipped tooling feature or a newly confirmed runtime bug. The showcase and engine recipe change documentation and executable documentation tests only; they require no npm version bump.

## Evidence sources

- [Bloomfall findings](https://github.com/hohphu8/bloomfall/blob/main/docs/GYOSJS-DOGFOOD.md), including historical benchmark environments and limits.
- [Rivergate findings](https://github.com/hohphu8/rivergate/blob/main/docs/DOGFOOD.md), including the isolated 0.5.1/0.5.2 signal reproduction.
- [Sumboard findings](https://github.com/hohphu8/sumboard/blob/main/docs/DOGFOOD.md) and [validation](https://github.com/hohphu8/sumboard/blob/main/docs/VALIDATION.md).
- [Mosswatch findings](https://github.com/hohphu8/mosswatch/blob/main/docs/DOGFOOD.md) and [validation](https://github.com/hohphu8/mosswatch/blob/main/docs/VALIDATION.md).
- [Release changelog](../CHANGELOG.md) for the shipping status of framework changes.
