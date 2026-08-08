# Release Process

This file is the operational checklist for publishing the canonical public repository and npm package. Stability and triage policy live in `MAINTAINING.md`.

## 1. Prepare The Private Source

Choose the next version according to the maintenance policy: backward-compatible fixes stay in the current patch line; new or intentionally breaking contracts require a minor release while GyosJS is `0.x`.

- synchronize `package.json` and `Gyos.version` in `src/index.ts`
- move release notes out of `Unreleased` in `CHANGELOG.md`
- add the dated release heading and comparison links
- update pinned CDN examples in the README, core docs, and website docs
- compare template contract changes with `gyosjs/gyosjs-vscode/src/language/contract.ts`
- update the reference demo intentionally after the package is public

Verify the metadata and complete local suite:

```bash
npm run version:check -- <version>
npx playwright install chromium firefox webkit
npm run release:check
npm run docs:mirror:check -- <gyosjs-website-root>
```

Node.js 18.19 is the minimum supported maintenance runtime. Public CI uses Node.js 22 as its primary runtime and runs a separate non-browser check on Node.js 18.20.

## 2. Sync The Public Repository

The private development repository remains the runtime source of truth. Use guarded sync instead of editing the runtime change twice:

```bash
npm run sync:public:check -- ../gyosjs-public
npm run sync:public -- ../gyosjs-public
```

Sync requires a clean Git root whose `origin` points to `gyosjs/gyosjs`. It preserves `.git` and ignored local caches, replaces tracked public files from an explicit allowlist, and scans exported text for known private absolute paths. Review the complete public diff before committing it.

The export includes runtime source, tests, examples, user docs, maintenance policy, release tooling, and GitHub workflows. It excludes private history, research artifacts, generated bundles, dependencies, caches, and reports.

Push the reviewed public commit and wait for both normal CI jobs:

- Node.js 22 source/package checks and Chromium E2E
- Node.js 18 minimum-runtime source/package checks

## 3. Build A Release Candidate

From the public `gyosjs/gyosjs` repository, run the **Release Candidate** workflow with the exact version from `package.json`. It verifies release metadata, runs all checks on Chromium, Firefox, and WebKit, then uploads `gyosjs-<version>.tgz`.

Download the artifact and inspect it if packaging changed. The tarball produced by this workflow is the artifact that will be published; do not rebuild a different package for npm.

## 4. Tag And Publish Manually

Tag the exact public commit that produced the successful candidate:

```bash
git tag v<version>
git push origin main --tags
```

Create the GitHub Release from the same tag and use the matching changelog section as its notes. Then publish the downloaded verified artifact:

```bash
npm publish gyosjs-<version>.tgz --access public
```

Do not publish npm before the public commit and tag are visible. Never overwrite or reuse a broken version; fix it and release a new patch.

## 5. Verify The Published Ecosystem

Run the live contract check after npm finishes propagating:

```bash
npm view gyosjs@<version>
npm run live:check
```

It verifies the documentation site, Inventory Desk, npm registry, and exact-version bundles on both CDNs:

```text
https://cdn.jsdelivr.net/npm/gyosjs@<version>/dist/gyos.auto.min.js
https://unpkg.com/gyosjs@<version>/dist/gyos.auto.min.js
```

Install the exact package in a clean consumer when the package shape changed. Update and redeploy the reference demo only after these checks pass.

## 6. Coordinate Documentation And Extension

Core `docs/en` defines the public behavior contract. Port affected content to website EN and VI while preserving the website's executable-demo format, then run the mirror inventory check and live documentation smoke.

A runtime release does not require an extension release when the template contract is unchanged. When it changes:

1. update the extension contract, grammar, hovers, completion, diagnostics, fixtures, and documentation links
2. run extension unit, desktop Extension Host, web Extension Host, minimum-VS-Code, and package checks
3. publish the extension only after canonical runtime docs are public

Do not diagnose registered custom extension points merely because a name is absent from the built-in catalog.
