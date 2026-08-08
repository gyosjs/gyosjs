# Maintaining GyosJS

This document defines how the GyosJS runtime, public source, documentation, reference demo, and editor extension move together. User-facing guidance remains in `docs/en`; this file is for maintainers.

## Stability And Support

- GyosJS remains experimental while its version is below `1.0.0`.
- Patch releases such as `0.1.x` contain backward-compatible fixes and documentation corrections.
- New contracts or intentional breaking behavior require a minor release such as `0.2.0` and migration notes.
- The latest public release receives normal and security fixes. Older releases are patched only when a backport is both important and low risk.
- The browser test target is the current Playwright Chromium, Firefox, and WebKit engines. View Transitions and other optional browser APIs remain progressive enhancements.
- Node.js 18.19 is the minimum maintenance/build runtime. Node.js 22 is the primary CI runtime. Published entrypoints are browser-only and are not SSR-safe Node.js modules.

## Sources Of Truth

- The private development repository owns runtime changes and review history.
- `gyosjs/gyosjs` is produced with the guarded public sync; do not implement the same runtime change independently in both repositories.
- `docs/en/api-reference.md` is the public behavior contract. The documentation website may adapt markup for executable examples, but it must preserve that contract.
- The runtime contract precedes the VS Code catalog. Update extension completions, hovers, navigation, diagnostics, fixtures, and links only when that contract changes.
- Reference applications exercise real integration boundaries. They must not hide a runtime failure with an application-only workaround.

## Issue Triage

1. Reject security reports from public issues and direct them to `SECURITY.md`.
2. Confirm the affected GyosJS version, browser, installation mode, and smallest reproduction.
3. Classify the issue as runtime, router/MPA, documentation, extension, demo, or application behavior.
4. Reproduce a runtime bug in `examples` or a focused test fixture.
5. Add a failing regression test before or with the fix.
6. Update the API reference and lifecycle/router guides when public behavior changes.

Feature requests must describe the application problem and why existing composition APIs are insufficient. A new directive or global API is not accepted solely as syntax convenience.

## Change Checklist

- Reactive changes cover nested objects, arrays, cleanup, and stale dependency behavior where relevant.
- Router changes cover full and partial navigation, history, cancellation, failure fallback, scripts, persisted islands, and additive swaps where relevant.
- Public contracts update `API-COVERAGE.md`, tests, declarations, and `docs/en`.
- Documentation changes are ported to website EN and VI, then checked with `npm run docs:mirror:check -- <website-root>`.
- Template contract changes are compared with `gyosjs-vscode/src/language/contract.ts` and its fixtures.
- Integration regressions are exercised in the Laravel reference demo before release.

## Release Flow

1. Finish and review changes in the private repository.
2. Run `npm run release:check` with all Playwright browsers installed.
3. Run the website mirror check and the demo/extension suites when their contracts are affected.
4. Run public sync dry-run, then sync to a clean canonical public clone and review its complete diff.
5. Push the public commit and wait for public CI.
6. Run the public `Release Candidate` workflow with the expected version and download its verified tarball.
7. Tag the same public commit, push the tag, and create the GitHub Release from the matching changelog section.
8. Publish the verified tarball manually with `npm publish <tarball> --access public`.
9. Run `npm run live:check`, then update and redeploy the reference demo intentionally.
10. Release the VS Code extension only when its own contract or behavior changed.

Never replace or republish a broken npm version. Fix the problem and issue a new patch.
