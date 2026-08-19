# Content Security Policy

GyosJS provides a separate CSP build for applications that enforce a strict Content Security Policy without `unsafe-eval` or `unsafe-inline`. The normal build remains unchanged and continues to accept full JavaScript expressions.

The CSP build is opt-in. Use it only when the application's policy requires it and the restricted expression syntax fits the templates.

## CDN Setup

Load the static runtime CSS and the CSP auto-init bundle. Give the script the same nonce allowed by the response header.

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/gyosjs@0.3.1/dist/gyos.css">
<script
  nonce="{{ csp_nonce }}"
  src="https://cdn.jsdelivr.net/npm/gyosjs@0.3.1/dist/gyos.csp.auto.min.js"
></script>
```

A suitable policy can start with:

```http
Content-Security-Policy: default-src 'self'; script-src 'nonce-{RANDOM}' 'strict-dynamic'; style-src 'self' https://cdn.jsdelivr.net; object-src 'none'; base-uri 'none'
```

Generate a new unpredictable nonce for every HTTP response. Do not copy the literal placeholder or reuse a permanent nonce.

The CDN auto build captures its own script nonce before mounting. It exposes `window.Gyos`, starts MPA Boost when `g-boost` is present, and mounts scopes on DOM ready. It does not inject a `<style>` element, so `gyos.css` is required for built-in transitions, `g-cloak`, and the target spinner.

## npm Setup

For automatic startup, expose the response nonce through a meta element when boosted responses can contain scripts:

```html
<meta name="csp-nonce" content="{{ csp_nonce }}">
```

```js
import 'gyosjs/styles.css';
import 'gyosjs/csp/auto';
```

For explicit startup and nonce configuration:

```js
import Gyos from 'gyosjs/csp';
import 'gyosjs/styles.css';

Gyos.setCspNonce(() => {
  return document.querySelector('meta[name="csp-nonce"]')?.getAttribute('content');
});

Gyos.ready(() => {
  Gyos.startRouter();
  Gyos.mountAll();
});
```

Do not import the standard and CSP entries into the same browser bundle. Both expose the same public API but install different expression runtimes.

## What Changes in CSP Mode

The reactive model, directives, forms, signals, and MPA Boost behavior remain the same. Only expressions written in HTML are evaluated differently.

Standard mode compiles trusted template expressions as JavaScript. CSP mode parses them into an AST and evaluates a controlled subset without `Function()` or `eval()`.

This works in CSP mode:

```html
<div g-scope="{ count: 0, open: false, user: null }">
  <button @click="count++; open = !open">Update</button>
  <p g-show="open">Count: {count}</p>
  <p>{user?.profile.name ?? 'Guest'}</p>
</div>
```

Supported expression features include:

- strings, numbers, booleans, `null`, arrays, and data-only object literals
- identifiers and nested or computed property reads
- optional chaining and nullish coalescing
- function and method calls exposed by the current scope
- arithmetic, comparison, equality, logical, ternary, `in`, and `instanceof` operators
- assignment, compound assignment, `++`, and `--` in event expressions
- multiple expression statements separated by semicolons in event handlers
- `$event` in event handlers
- simple `gm-*` arguments, expression statements, and `return`

The following are intentionally unsupported in HTML expressions:

- arrow functions and function or class declarations
- `new`, `await`, `yield`, imports, and dynamic imports
- template literals, regular-expression literals, BigInt, and spread syntax
- destructuring, variable declarations, loops, `if`, `switch`, `try`, and blocks
- object methods, getters, and setters inside inline `g-scope`
- `delete`
- implicit browser globals such as `window`, `document`, and `Math`
- access to `constructor`, `prototype`, or `__proto__`

Unsupported syntax reports a console error prefixed with `[GyosJS CSP]` and does not execute.

### Transition names are literals

`g-transition` does not evaluate an unwrapped value. Built-in and registered names therefore work without quotes and without CSP identifier errors:

```html
<div g-show="open" g-transition="fade">Fades</div>
<div *if="menuOpen" g-transition="slide-down">Slides</div>
```

Use braces only when the transition name is dynamic:

```html
<div g-scope="{ effect: 'scale', open: true }">
  <div g-show="open" g-transition="{effect}">Uses the current effect</div>
</div>
```

## Put Complex Logic in Named Scopes

The restrictions apply to expressions parsed from markup. JavaScript modules allowed by the application's CSP can still register normal named scopes with methods, getters, browser APIs, and any application logic.

```js
import Gyos from 'gyosjs/csp';

Gyos.scope('PriceEditor', () => ({
  quantity: 1,
  unitPrice: 25,
  get total() {
    return this.quantity * this.unitPrice;
  },
  formatTotal() {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(this.total);
  }
}));
```

```html
<section g-scope="PriceEditor">
  <input type="number" g-model.number="quantity">
  <output>{formatTotal()}</output>
</section>
```

This is the recommended CSP pattern: keep markup expressions small and move branching, callbacks, browser globals, and reusable work into named scope methods.

## MPA Boost and Nonces

Fetched HTML is not governed by its original response CSP after Gyos inserts nodes into the current document. For that reason, GyosJS never trusts a nonce copied from a fetched page.

The nonce trusted by the active document does not change during a Boost navigation. A fetched response may contain a newly generated nonce, but that nonce belongs to a different response policy and is not valid under the policy already enforcing the live page.

Before parsing and committing a boosted response, Gyos snapshots the active nonce and uses it consistently:

- Incoming inline styles are normalized before parsing so a fresh response nonce cannot produce a transient CSP violation.
- Recreated scripts, inline styles, and stylesheet links receive the active document nonce instead of the fetched nonce.
- The live `<meta name="csp-nonce">` keeps the active nonce for the lifetime of that document.
- Head style and stylesheet identities ignore nonce differences, preventing duplicate nodes when only the response nonce changed.
- External scripts can still run according to the active page policy.
- Inline scripts and styles are skipped in CSP mode when no active nonce is configured.
- A skipped `g-script-once` script is not cached as executed, so it can run after nonce configuration is corrected.

The CSP CDN auto build captures its own nonce. With npm or a custom bundle name, call `Gyos.setCspNonce(value)` or provide a callback that returns the current response nonce.

```js
Gyos.setCspNonce(() => window.appSecurity.cspNonce);
```

The callback is resolved before each head update. During Boost navigation, Gyos preserves the active metadata value rather than replacing it with the fetched response nonce. A normal full-page load starts a new document and captures that response's new nonce as usual.

## Security Boundaries

The CSP interpreter is a compatibility mechanism, not a sandbox. Template expressions are application code and must never be assembled from user-controlled strings. Scope methods are trusted JavaScript and can do anything allowed to the application bundle.

`Gyos.setCspNonce()` only controls scripts, inline styles, and stylesheet links that Gyos creates or recreates. Gyos does not observe and rewrite nodes injected independently by third-party libraries. If an editor or widget creates its own `<style>` element, pass the active nonce through that library's CSP API; for example, configure the nonce injection option exposed by Tiptap rather than expecting Gyos to patch the element afterward.

`g-html` remains a raw HTML sink. Only pass trusted or correctly sanitized HTML. GyosJS 0.3 does not implement Trusted Types integration, so an application that enforces `require-trusted-types-for 'script'` must handle that policy separately.

Bound URLs, boosted responses, Markdown, and server output still require normal application security controls. CSP reduces the impact of some injection failures; it does not replace output encoding, sanitization, origin checks, CSRF protection, or server authorization.

## Choosing a Build

Use the standard build when full JavaScript expression syntax and the smallest runtime are more important than strict `script-src` compatibility.

Use the CSP build when the application must omit `unsafe-eval`, can load `gyos.css`, and can keep complex logic in named JavaScript scopes.

If an existing template depends heavily on callbacks, inline branching, template literals, or browser globals, migrate those expressions into named methods before switching builds. You can adopt CSP mode per application, but not mix both runtimes in one page.
