# GyosJS

<img src="./examples/p5-2-no-bg.png" alt="GyosJS logo" width="100" height="100" />

Reactive HTML for server-rendered websites, with fine-grained signals, attribute-driven templates, and MPA boost navigation.

GyosJS is built for developers who like server-rendered HTML, traditional MPA architecture, and small amounts of JavaScript that stay close to the DOM. If AlpineJS feels familiar but you also want boosted MPA navigation similar to Turbo or Hotwire, GyosJS is designed for that middle ground.

## Why GyosJS

- Keep your backend-rendered HTML and existing routes.
- Add reactivity directly in markup with `g-scope`, `g-model`, `*if`, `*for`, and events.
- Upgrade link and form navigation with `g-boost` instead of rewriting the app as a SPA.
- Keep specific UI islands alive across navigations with `g-persist`.
- Use it with a CDN or install it from npm.

## When It Fits

GyosJS is a good fit when you are building:

- Laravel, PHP, Rails, MVC, and other server-rendered apps
- admin tools and internal dashboards
- marketing sites with small interactive sections
- MPA products that want smoother navigation without client-side routing everywhere
- projects that do not need React/Vue-level component systems

GyosJS is not trying to replace a full SPA framework. If your app is primarily client-rendered and depends on complex client routing or large client-side state graphs, a SPA framework is usually the better tool.

## Quick Start

### CDN: no build step

Use the browser auto-init build when you want HTML-first usage with minimal setup.

```html
<script src="https://cdn.jsdelivr.net/npm/gyosjs@0.1.0/dist/gyos.auto.min.js"></script>
```

That build attaches `window.Gyos`, starts the router when `g-boost` exists, injects transition styles, and mounts scopes when the page is ready.

### npm: bundler or app build

```bash
npm install gyosjs
```

Use the core runtime when you want explicit control:

```js
import Gyos from 'gyosjs';

Gyos.scope('Counter', {
  count: 0,
  increment() {
    this.count++;
  }
});

Gyos.ready(() => {
  Gyos.mountAll();
});
```

Or use the auto entrypoint:

```js
import 'gyosjs/auto';
```

## Minimal Example

```html
<div g-scope="{ name: 'GyosJS' }">
  <p>Hello, {name}</p>
  <input g-model="name">
</div>
```

This is the core GyosJS experience: state lives next to HTML, the DOM updates automatically, and you do not need a component compiler or virtual DOM to get there.

## MPA Boost Example

```html
<body g-boost>
  <main id="app" g-outlet g-snapshot>
    <nav>
      <a href="/posts.html">Posts</a>
      <a href="/about.html">About</a>
    </nav>
  </main>
</body>
```

With `g-boost`, same-origin links and forms can be intercepted and swapped into the current outlet. Add `g-persist` to keep a player, timer, or other live island mounted across page transitions.

## Documentation

- [Introduction](./docs/en/introduction.md)
- [Getting Started](./docs/en/getting-started.md)
- [What Is G-Scope](./docs/en/what-is-gscope.md)
- [Reactivity and Signals](./docs/en/reactivity-signals.md)
- [Template Syntax](./docs/en/template-syntax.md)
- [Examples](./docs/en/examples.md)
- [Tutorial Guide](./docs/en/tutorial-guide.md)
- [API Reference](./docs/en/api-reference.md)
- [MPA Boost Deep Dive](./docs/en/mpa-boost-deep-dive.md)
- [Layouts, Scripts, and Lifecycle](./docs/en/layouts-scripts-lifecycle.md)
- [Best Practices](./docs/en/best-practices.md)
- [Distribution and Installation](./docs/en/distribution-and-installation.md)
- [Migration Guide](./docs/en/migrate-from-javascript.md)

## Examples In This Repo

- [`examples/router`](./examples/router) covers router behaviors such as `g-target`, `g-router-link`, `g-persist`, `g-swap`, and snapshots.
- [`examples/mpa-demo`](./examples/mpa-demo) shows the smaller MPA boost flow.
- [`examples`](./examples) includes reactive demos, forms, async rendering, and stress-test style development examples.

## Development

```bash
npm install
npm run build
npm run test
npm run typecheck
```

## Open Source Files

- [License](./LICENSE.md)
- [Security Policy](./SECURITY.md)
- [Contributing](./CONTRIBUTING.md)
