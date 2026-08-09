# Getting Started with GyosJS

Read the [Introduction](./introduction.md) first if you want the short version of what GyosJS is for. This page is the practical start: install it, mount it, and verify the reactive model in the browser.

## Choose Your Installation Style

GyosJS supports two normal starting points.

### Option 1: CDN for server-rendered pages

Use this when you want the quickest path for traditional MPA projects.

```html
<script src="https://cdn.jsdelivr.net/npm/gyosjs@0.2.0/dist/gyos.auto.min.js"></script>
```

The auto build:

- exposes `window.Gyos`
- mounts scopes when the page is ready
- injects transition styles
- starts the router when `g-boost` exists in the document

### Option 2: npm for bundlers

```bash
npm install gyosjs
```

Use the core package when you want explicit control:

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

Use the auto entrypoint when you want the package to behave more like the CDN build:

```js
import 'gyosjs/auto';
```

More packaging detail is in [Distribution and Installation](./distribution-and-installation.md).

## First Reactive Example

```html
<div g-scope="{ name: 'GyosJS' }">
  <p>Hello, {name}</p>
  <input g-model="name">
</div>
```

What happens here:

- `g-scope` creates a local reactive scope
- `{name}` renders the current value
- `g-model="name"` binds the input to that value
- typing in the input updates the DOM immediately

You do not need a build step, virtual DOM, or component compiler to get this behavior.

## First MPA Boost Example

If your project is server-rendered, the next useful step is usually boosted navigation.

```html
<body g-boost>
  <main id="app" g-outlet g-snapshot>
    <nav>
      <a href="/home.html">Home</a>
      <a href="/posts.html">Posts</a>
    </nav>
  </main>
</body>
```

This tells GyosJS to:

- intercept eligible same-origin links and forms
- fetch the next HTML response
- swap the matching outlet into the current page
- save snapshots when the outlet has `g-snapshot`

Read [MPA Boost Deep Dive](./mpa-boost-deep-dive.md) before using router features heavily.

## Where To Go Next

- [What Is G-Scope](./what-is-gscope.md)
- [Reactivity and Signals](./reactivity-signals.md)
- [Template Syntax](./template-syntax.md)
- [Examples](./examples.md)
- [Tutorial Guide](./tutorial-guide.md)
