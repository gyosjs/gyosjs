# Reference application follow-up

Reviewed 2026-11-14 against the four standalone projects and the GyosJS 0.5.5 contract. Historical app notes describe the runtime at the time of their measurements; an old note saying a candidate is unreleased does not supersede the release changelog.

| Evidence | Classification and current status | Follow-up |
| --- | --- | --- |
| Bloomfall: retained keyed nodes moved unnecessarily during swaps/rotations | Core improvement shipped in 0.5.1, including focused-control preservation | Keep identity and actual DOM moves separate from timing claims; no new optimization without a measured workload |
| Rivergate: callable signals lost identity/metadata inside reactive scopes; direct model writes broke | Core fix shipped in 0.5.2 | Keep the direct signal/model regression; no accessor workaround needed on current versions |
| Scope factories: mount-time `$watch`/`$effect` ownership | Core fix shipped in 0.5.3, then further lifecycle hardening in 0.5.4/0.5.5 | Ownership examples and cleanup regressions are part of the public contract |
| Sumboard: validated drafts, snapshot history, computed totals and browser resources | Application structure; no new API required | Covered by the editor-history recipe |
| Mosswatch: continuous Canvas simulation beside reactive controls | Application structure; no isolated core defect | Covered by the external-engines recipe; distinguish frame, bridge-check, signal-write and DOM-update rates |
| Rivergate + Sumboard: generic HTML formatting can split a quoted string inside interpolation | Reproduced with Prettier 3.9.6, HTML parser, width 80; all three whitespace modes break the sample | Template Syntax now covers safe authoring choices; extension development adds a conservative warning, without changing runtime syntax |
| Rivergate Worker results and Sumboard file imports can finish after state changes | Application async ownership, not automatic signal semantics | A later Worker recipe can teach cancellation plus request/generation checks; current engine recipe points to the real client |
| Bloomfall CSP bundle size and large-document projection costs | Measured tradeoffs, not established need for another entry/API | Profile production imports and actual workloads before proposing smaller entries, per-row state or virtualization |

## Completed investigation: template formatting

The issue was independently recorded in [Rivergate](https://github.com/hohphu8/rivergate/blob/main/docs/DOGFOOD.md) and [Sumboard](https://github.com/hohphu8/sumboard/blob/main/docs/DOGFOOD.md). The apps use short bindings and put long display text in JavaScript functions/computed values. Do not silently repair malformed strings in the runtime.

The focused investigation established:

1. Prettier 3.9.6 with parser `html`, width 80 and `css`/`strict`/`ignore` whitespace modes inserts a newline inside the same quoted sentence. Input, exact output and configuration are saved in the extension's fixtures.
2. Standard and CSP 0.5.5 builds render the damaged expression empty in Chromium, Firefox and WebKit. Moving the label into a scope getter, using `g-text`, or protecting the element with `prettier-ignore` preserves the tested output.
3. The extension development source adds `multiline-interpolation-string`, highlighting a closed single/double-quoted string containing an unescaped CR/LF under a scope owner. It does not install a formatter, change editor settings or rewrite text.
4. Tests cover source ranges, valid multiline expressions, escaped quotes/line continuations, ignored/raw-text regions, PHP/Blade and diagnostic removal after repair. Ambiguous expressions are deliberately skipped; this is not full expression validation.

See the extension's [reproduction and limits](https://github.com/gyosjs/gyosjs-vscode/blob/main/docs/FORMATTING.md) and [Template Syntax](./en/template-syntax.md). Check extension release notes for registry availability: development source is not a published Marketplace release. No runtime change or npm version bump is required. A full formatter is not justified by this one issue.

## Evidence sources

- [Bloomfall findings](https://github.com/hohphu8/bloomfall/blob/main/docs/GYOSJS-DOGFOOD.md), including historical benchmark environments and limits.
- [Rivergate findings](https://github.com/hohphu8/rivergate/blob/main/docs/DOGFOOD.md), including the isolated 0.5.1/0.5.2 signal reproduction.
- [Sumboard findings](https://github.com/hohphu8/sumboard/blob/main/docs/DOGFOOD.md) and [validation](https://github.com/hohphu8/sumboard/blob/main/docs/VALIDATION.md).
- [Mosswatch findings](https://github.com/hohphu8/mosswatch/blob/main/docs/DOGFOOD.md) and [validation](https://github.com/hohphu8/mosswatch/blob/main/docs/VALIDATION.md).
- [Release changelog](../CHANGELOG.md) for the shipping status of framework changes.
