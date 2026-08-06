# Release Process

This file is for maintainers preparing the public GyosJS repository and npm release.

## 1. Prepare The Public Repository

Keep this private development repository and its history private. Export only the reviewed source into a new empty directory:

```bash
npm run export:public -- ../gyosjs-public
```

For the canonical public clone, use guarded sync instead of editing the same change twice:

```bash
npm run sync:public:check -- ../gyosjs-public
npm run sync:public -- ../gyosjs-public
```

Sync requires a clean Git root whose `origin` points to `gyosjs/gyosjs`. It preserves `.git` and ignored local caches, replaces tracked public files from the same allowlist, and mirrors additions, edits, renames, and deletions. Always review the resulting public diff before committing it.

The export script uses an explicit allowlist and refuses to write into a non-empty directory. It includes source, tests, examples, user documentation, release tooling, and GitHub CI. It excludes the private `.git` history, `ignore`, `node_modules`, generated `dist`, caches, reports, editor files, and private research artifacts.

Before the first public commit:

- inspect the exported tree manually
- search for credentials, private URLs, absolute filesystem paths, personal notes, and generated files
- confirm the repository URL, homepage, issue URL, security contact, author name, and license
- complete the separate documentation sign-off

Then initialize the new repository and create one clean first commit. Do not copy this repository's `.git` directory.

## 2. Verify From A Clean Clone

Use Node.js 20 in CI. Node.js 18 remains the minimum supported development runtime.

```bash
npm ci
npx playwright install chromium
npm run release:check
```

`release:check` verifies TypeScript, unit/integration tests, production bundles, the npm tarball in an isolated consumer project, and browser E2E behavior.

## 3. Check Version And Package Metadata

- keep `package.json` and `Gyos.version` in `src/index.ts` synchronized
- move relevant entries from `Unreleased` into the release section in `CHANGELOG.md`
- compare the public template contract with `gyosjs/gyosjs-vscode/src/language/contract.ts`; update the extension, grammar, tests, and links when directives, modifiers, validators, transitions, bindings, or router attributes change
- verify `npm view gyosjs version` before choosing a version
- inspect `npm pack --dry-run`
- confirm that `unpkg` and `jsdelivr` point to `dist/gyos.auto.min.js`
- confirm npm exports for `gyosjs` and `gyosjs/auto`

## 4. Create The Release

After CI passes on the public repository:

```bash
git tag v0.1.0
git push origin main --tags
npm publish --access public
```

Create the GitHub Release from the same tag and use the matching changelog section as its notes. Do not publish npm before the public tag and commit are visible.

## 5. Verify The Published Artifacts

Check the exact published version instead of an unpinned latest URL:

```bash
npm view gyosjs@0.1.0
npm install gyosjs@0.1.0
```

Verify both CDN endpoints:

```text
https://cdn.jsdelivr.net/npm/gyosjs@0.1.0/dist/gyos.auto.min.js
https://unpkg.com/gyosjs@0.1.0/dist/gyos.auto.min.js
```

If any artifact is wrong, do not overwrite the version. Fix it and publish a new patch version.

## 6. Coordinate The VS Code Extension

The runtime is the source of truth. A GyosJS release may ship before an extension release when the template contract is unchanged. When the contract changes:

1. Open a matching change in `https://github.com/gyosjs/gyosjs-vscode`.
2. Verify HTML, PHP, and Blade fixtures against the released runtime behavior.
3. Run the extension unit, desktop Extension Host, and web Extension Host suites.
4. Publish a new extension version only after the canonical runtime documentation is available at the linked GitHub paths.

Do not add diagnostics for custom extension points solely because a name is absent from the built-in catalog.
