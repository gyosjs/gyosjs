# Distribution and Installation

This page explains how GyosJS is packaged for real use: CDN, npm, and the difference between the core runtime and the browser auto-init build.

## Recommended Paths

### CDN for HTML-first MPA projects

Use:

```html
<script src="https://cdn.jsdelivr.net/npm/gyosjs@0.2.3/dist/gyos.auto.min.js"></script>
```

Choose this when:

- the project is mostly server-rendered
- you do not want a bundler requirement
- you want `window.Gyos`
- you want scopes and router behavior to auto-start

### npm for bundlers

Install:

```bash
npm install gyosjs
```

Core runtime:

```js
import Gyos from 'gyosjs';
```

Auto runtime:

```js
import 'gyosjs/auto';
```

Both npm entrypoints are browser-only. Import them from browser bundles or client-only modules; direct Node.js or SSR evaluation currently accesses `window` during router initialization.

## Core vs Auto Build

### `gyosjs`

The core package is for explicit control.

Use it when you want to:

- register scopes manually
- call `Gyos.mountAll()` yourself
- decide when the router starts
- keep startup behavior under application control

### `gyosjs/auto`

The auto entrypoint is for convenience.

It:

- attaches `Gyos` to `window`
- applies transition styles
- starts the router when `g-boost` is present
- mounts scopes on DOM ready

This is the entrypoint most similar to the CDN build.

Any `g-boost` element starts the router, but only `body[g-boost]` enables inherited site-wide interception. Otherwise, put `g-boost` directly on each link or form that should be boosted.

## CDN Notes

For production, prefer version-pinned URLs instead of floating `latest`.

Example:

```html
<script src="https://cdn.jsdelivr.net/npm/gyosjs@0.2.3/dist/gyos.auto.min.js"></script>
```

When you upgrade GyosJS, change the version deliberately.

## npm Package Surface

The package currently exposes:

- `gyosjs`
- `gyosjs/auto`

The CDN-oriented UMD bundles still exist in `dist`, but the documented npm contract is the ESM import surface above.

## Which One Should You Pick

- Pick CDN if you want the smallest adoption cost for an existing server-rendered project.
- Pick npm core if you want explicit startup control.
- Pick npm auto if you want bundler installation with CDN-like startup behavior.
