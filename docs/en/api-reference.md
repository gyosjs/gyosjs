# API Reference

This page is the practical reference for building with GyosJS. It is written for application developers, not for contributors reading the internals first.

If you are new to the project, read these pages before treating this as a complete reference:

- [Introduction](./introduction.md)
- [Getting Started](./getting-started.md)
- [What Is G-Scope](./what-is-gscope.md)
- [Template Syntax](./template-syntax.md)

Once you already understand the mental model, use this page to look up syntax, APIs, and the places where GyosJS makes opinionated tradeoffs.

---

## Quick Mental Model

GyosJS has two layers:

1. an HTML-first reactive layer
2. an MPA boost navigation layer

The reactive layer is centered on:

- `g-scope`
- text interpolation with `{expression}`
- structural directives like `*if` and `*for`
- attribute bindings like `:class`
- event handlers like `@click`
- `g-model` for form binding

The MPA layer is centered on:

- `g-boost`
- `g-outlet`
- `g-target`
- `g-swap`
- `g-snapshot`
- `g-persist`

## Complete Lookup Index

Use the browser's find command on this page when you already know the API name.

| Group | Available syntax and APIs |
| --- | --- |
| Scope | `g-scope`, `g-scope-persist`, `gd-*`, `gm-*`, `Gyos.scope`, `mount`, `mountAll`, `mountTree`, `cleanup`, `mountedScopes` |
| Scope context | `$refs`, `$watch`, `$effect`, `$emit`, `$on`, `$provide`, `$inject`, `onMount`, `onUpdate`, `onUnmount` |
| Text and attributes | `{expression}`, pipes with `\|`, `:class`, `:style`, safe generic `:attribute` bindings, ARIA/data attributes, and form metadata |
| Structural | `*if`, `*elseif`, `*else`, `*for`, `g-key`, `*switch`, `*case`, `*default`, `*await`, `*pending`, `*then`, `*catch` |
| Directives | `g-show`, `g-text`, `g-html`, `g-ref`, `g-static`, `g-ignore`, `g-transition`, `g-portal`, `g-hydrate`, `g-reveal`, `g-provide`, `g-cloak`, `g-focus`, `g-tooltip`, `g-on`, `g-markdown`, `g-form`, `g-validate`, `g-errors`, `g-submit` |
| Events and forms | `@event`, `$event`, event modifiers, `g-ignore-outside-click`, `g-model`, `.trim`, `.number`, `.debounce` |
| Reactivity | `signal`, `computed`, `effect`, `batch`, `isSignal`, `isComputed`, `unref`, `untrack`, `markRaw`, `shallow` |
| Extension | `directive`, `applyDirective`, `pipe`, `validator`, `getValidator`, `getValidatorNames`, `validate` |
| Shared state and events | `store`, store helpers, `provide`, `inject`, `getGlobalContainer`, `on`, `emit`, `off`, `once` |
| Composables | `useFetch`, `useCounter`, `useToggle`, `useLocalStorage`, `useInterval`, `useTimeout`, `useDebounce`, `useThrottle`, `useMouse`, `useWindowSize`, `useMediaQuery`, `useAsync` |
| Transition and portal | `registerTransition`, `getTransitionConfig`, `applyTransitionStyles`, `portalCreate`, `portalDestroy` |
| Utilities | `ready`, `nextTick`, `debounce`, `throttle`, `setCspNonce`, `version` |
| MPA Boost | `startRouter`, navigation hooks, `g-boost`, `g-no-boost`, `g-outlet`, `g-target`, `g-swap`, `g-preload`, `g-snapshot`, `g-persist`, history, spinner, custom-action, and script attributes |

Strict CSP deployments use a separate package entry and a restricted expression language. See [Content Security Policy](./content-security-policy.md) for installation, supported syntax, nonce handling, and security boundaries.

---

## Scope APIs

### `Gyos.scope(name, definition)`

Register a named scope definition.

```js
Gyos.scope('CounterApp', {
  count: 0,
  increment() {
    this.count++;
  }
});
```

Then use it in HTML:

```html
<div g-scope="CounterApp">
  <p>Count: {count}</p>
  <button @click="increment">Increase</button>
</div>
```

Use `Gyos.scope()` when:

- the scope is reused
- the logic is too large for inline HTML
- you want methods, getters, or lifecycle code in JavaScript

A named object definition is reused by the registry. Mounting the same name on multiple elements does not create independent state instances; use separate registrations or inline scopes when each element needs isolated state.

Use a factory when the same named scope can mount more than once and each mount needs fresh local state. This is the recommended form for page components that appear on multiple MPA routes:

```js
Gyos.scope('ProductForm', () => ({
  step: 1,
  name: '',
  next() {
    this.step++;
  }
}));
```

The factory runs once per mount. `gd-*` values from that element are applied to the returned object before it becomes reactive, so server-rendered values can initialize each route independently.

### `Gyos.scope(element, definition)`

You can also register a scope directly on a specific element.

```js
const el = document.getElementById('mounted-once');
Gyos.scope(el, {
  message: 'Mounted directly on one element'
});

Gyos.mount(el);
```

`Gyos.scope(element, definition)` registers the definition; mount the element explicitly when using the manual build or when adding it after DOM ready.

### `Gyos.mount(element)`

Mount one element that already has `g-scope`.

### `Gyos.mountAll()`

Mount every scope in the current document.

This is the usual entrypoint for manual setups:

```js
import Gyos from 'gyosjs';

Gyos.ready(() => {
  Gyos.mountAll();
});
```

### `Gyos.mountTree(element)`

Initialize one newly inserted subtree. GyosJS mounts a scope carried by the supplied root, mounts nested named or auto scopes, and processes ordinary markup against its nearest existing parent scope.

This includes text interpolation, bindings, directives, events, models, and structural syntax. It is useful after application-owned DOM insertion; MPA Boost calls the equivalent subtree lifecycle automatically for committed swaps.

```js
const row = document.querySelector('#row-template').content.firstElementChild.cloneNode(true);
document.querySelector('#rows').append(row);
Gyos.mountTree(row);
```

### `Gyos.cleanup(target?)`

Dispose tracked effects for a target subtree. Omitting `target` defaults to `document.body`.

```js
Gyos.cleanup(document.querySelector('#old-panel'));
Gyos.cleanup();
```

Cleanup runs tracked effect disposers, event and form listener cleanup, custom-directive cleanup, scope `onUnmount()`, and mounted-scope deregistration. It does not remove the target or discover arbitrary application timers and subscriptions; stop those in `onUnmount()` or a registered disposer.

### `Gyos.mountedScopes()`

Return the live `Map<HTMLElement, Scope>` of mounted root scopes. This is mainly useful for debugging.

---

## `g-scope`

`g-scope` is the entrypoint for local reactive state.

### Inline object syntax

```html
<div g-scope="{ count: 0, name: 'GyosJS' }">
  <p>{name}: {count}</p>
</div>
```

### Named scope syntax

```html
<div g-scope="CounterApp">
  ...
</div>
```

### Empty scope

You can use an empty `g-scope` and let `g-model`, `gd-*`, and `gm-*` populate it:

```html
<div g-scope>
  <input g-model="email" placeholder="Email">
  <p>{email}</p>
</div>
```

### Auto-scope attributes: `gd-*` and `gm-*`

GyosJS can build a scope automatically from attributes.

```html
<div gd-count="0" gm-increment="count++">
  <p>{count}</p>
  <button @click="increment">Increase</button>
</div>
```

Rules:

- `gd-name="value"` defines data
- `gm-method="code"` defines a method
- kebab-case names are converted to camelCase
- `gm-method:arg1:arg2="..."` creates a method with arguments

HTML normalizes attribute names to lowercase, so write multi-word method arguments in kebab-case. `gd-*` parses exact booleans, numbers, JSON objects, and JSON arrays; every other value remains a plain string.

### Scope lifecycle and context

A mounted scope can define `onMount()`, `onUpdate()`, and `onUnmount()`. Every scope also receives `$refs`, `$watch`, `$effect`, `$emit`, `$on`, `$provide`, and `$inject`.

```js
Gyos.scope('SearchBox', {
  query: '',

  onMount() {
    this.stopWatching = this.$watch('query', (value, previous) => {
      console.log({ value, previous });
    }, { debounce: 250 });
  },

  onUnmount() {
    this.stopWatching?.();
  }
});
```

`$watch` accepts `{ immediate, debounce, deep }` and returns a disposer. `$effect(fn)` also returns a disposer; a cleanup returned by its callback runs before the next execution and on disposal. `$on` returns an unsubscribe function.

### `g-scope-persist`

Keep a scope instance in the in-memory scope cache when its DOM is removed and later mounted again:

```html
<section g-scope="SearchFilters" g-scope-persist="catalog-filters">
  <input g-model="query">
</section>
```

This preserves scope state, while router `g-persist` preserves the actual DOM node. Use it only when restoring the old scope instance is intentional.

### Example

```html
<div gd-count="0" gm-increment="count++" class="card card-body">
  <p>Count: <strong>{count}</strong></p>
  <button class="btn btn-primary" @click="increment">Increase</button>
</div>
```

---

## Text Interpolation

Use `{...}` to render expressions in text nodes.

```html
<p>Hello {name}</p>
<p>Total: {price * quantity}</p>
<p>Status: {isActive ? 'Active' : 'Paused'}</p>
```

Expressions are evaluated in the current scope context.

### Important notes

- Expressions are plain JavaScript-style expressions.
- Functions in scope can be called directly.
- Getter-style computed values can be referenced without parentheses.
- Pipes use the `|` syntax and are resolved by GyosJS.
- GyosJS leaves text inside `script`, `style`, `noscript`, `textarea`, `title`, and other browser raw-text or fallback containers unchanged. CSS braces, JSON-LD, and script blocks are not template expressions.
- MPA Boost removes `noscript` elements from fetched documents and snapshots before a swap. `DOMParser` parses their children as markup because scripting is disabled in the temporary document; inserting that markup could otherwise activate fallback styles or controls that remain inert during a native JavaScript-enabled page load.

### Example

```html
<div g-scope="{ name: 'GyosJS', count: 2, get double() { return this.count * 2; } }" class="card card-body">
  <p>Hello {name}</p>
  <p>Count: {count}</p>
  <p>Double: {double}</p>
</div>
```

---

## Attribute Bindings

GyosJS supports `:attribute` syntax for reactive DOM attributes. Bindings are not limited to a fixed HTML list, so ARIA, data, form metadata, and application-specific attributes can all follow reactive state.

### Common bindings

- `:class`
- `:style`
- `:disabled`
- `:readonly`
- `:checked`
- `:selected`
- `:value`
- `:src`
- `:href`
- `:alt`
- `:title`
- `:aria-expanded`, `:aria-current`, and other `:aria-*` attributes
- `:data-state` and other `:data-*` attributes
- `:name`, `:required`, `:min`, `:max`, `:pattern`, and other form metadata
- custom attributes such as `:project-status`

Framework-owned names (`g-*`, `gd-*`, `gm-*`, `@event`, `:binding`, and structural `*if`-style names), inline event handlers such as `onclick`, `srcdoc`, and `xmlns` cannot be created through a binding.

Bound URLs reject active schemes and unsafe `data:` values. URL bindings on active-content elements such as `script`, `iframe`, `embed`, `object`, `base`, and `link` are removed; configure trusted resources outside reactive bindings.

### Value and removal semantics

| Result | DOM behavior |
| --- | --- |
| `null` or `undefined` | Remove the target attribute. |
| `false` on an ordinary attribute | Remove the target attribute. |
| `false` on `aria-*` or `data-*` | Keep the attribute with the string value `"false"`. |
| Truthy/falsy value on a native boolean attribute | Toggle attribute presence and synchronize its reflected DOM property. |
| Other value | Convert to a string and set the attribute. |

```html
<button
  :aria-expanded="open"
  :data-state="open ? 'open' : 'closed'"
  :custom-state="open ? 'visible' : null"
>Menu</button>

<input :name="fieldName" :required="required" :min="minimum">
```

### `:class`

String form:

```html
<div class="card" :class="selected ? 'active featured' : 'idle'"></div>
```

String bindings are merged with the element's static classes. When the expression changes, Gyos removes stale classes previously returned by this binding but keeps classes such as `card` that came from the static `class` attribute.

Object form:

```html
<div :class="{ active: isActive, hidden: !visible }"></div>
```

Object keys are toggled directly. A false value removes that class, including a same-named class present in the initial markup.

Adding or deleting keys on a reactive class object in place also updates the element.
An object key may contain multiple whitespace-separated classes, which are toggled together.

### `:style`

String form:

```html
<div :style="'color:red; font-weight:bold'"></div>
```

Object form:

```html
<div :style="{ color: textColor, fontSize: size + 'px' }"></div>
```

Static inline declarations coexist with both forms. When a dynamic property disappears, Gyos removes it or restores the original static value. Object keys added or deleted in place are reactive.

### Boolean attribute bindings

```html
<button :disabled="isSaving">Save</button>
<input :readonly="locked">
<input type="checkbox" :checked="accepted">
```

### Example

```html
<div g-scope="{ active: true, danger: false, size: 18 }" class="card card-body">
  <p :class="{ 'text-success': active, 'text-danger': danger }" :style="{ fontSize: size + 'px' }">
    Styled by GyosJS bindings
  </p>
  <button class="btn btn-info" @click="active = !active; danger = !danger">Toggle</button>
</div>
```

---

## Structural Directives

Structural directives change what exists in the DOM.

### `*if`, `*elseif`, `*else`

```html
<div g-scope="{ step: 1 }">
  <p *if="step === 1">Step one</p>
  <p *elseif="step === 2">Step two</p>
  <p *else>Other step</p>
</div>
```

Use this when only one branch should exist at a time.

### `*for`

```html
<ul g-scope="{ items: ['A', 'B', 'C'] }">
  <li *for="item, i in items" g-key="item">
    {i}: {item}
  </li>
</ul>
```

Notes:

- `g-key` is strongly recommended
- if no explicit index variable is declared, use `$index`
- list rendering supports keyed reuse and transitions

### `*switch`, `*case`, `*default`

```html
<div g-scope="{ status: 'loading' }">
  <div *switch="status">
    <p *case="'loading'">Loading...</p>
    <p *case="'success'">Done</p>
    <p *default>Unknown</p>
  </div>
</div>
```

### `*await`, `*pending`, `*then`, `*catch`

Use this for Promise-based UI states.

```html
<div g-scope="AsyncBox">
  <button @click="load">Load</button>

  <div *await="promise">
    <p *pending>Loading...</p>
    <div *then="result">
      Loaded: {result.title}
    </div>
    <p *catch="err">Error: {err.message}</p>
  </div>
</div>
```

---

## Built-In Attribute Directives

### `g-show`

Show or hide an element by toggling `display`.

```html
<p g-show="visible">This element is toggled</p>
```

Add `g-transition` to animate changes after the initial mount:

```html
<aside g-show="open" g-transition.200="fade">Menu</aside>
```

Unlike `*if`, `g-show` keeps the element in the DOM. A leave transition finishes before `display: none` is applied, rapid toggles cancel stale transition work, and the element's original inline display value is restored when shown. Do not combine `g-show` with an application class that permanently sets `display: none`; use `g-cloak` to prevent an initial flash instead.

### `g-text`

Set `textContent`.

```html
<div g-text="message"></div>
```

### `g-html`

Set `innerHTML`.

```html
<div g-html="htmlString"></div>
```

Be careful when the content comes from users or untrusted sources.

### `g-ref`

Create DOM references on `$refs`.

```html
<input g-ref="emailInput">
<button @click="$refs.emailInput.focus()">Focus</button>
```

### `g-static`

Render once and skip future reactivity updates for that branch.

```html
<h1 g-static>{title}</h1>
```

### `g-ignore`

Tell GyosJS to leave an element and its entire subtree untouched.

```html
<div g-scope="EditorPage">
  <p>Reactive status: {status}</p>

  <div g-ignore id="third-party-editor">
    <span>{this stays literal}</span>
  </div>
</div>
```

Inside the `g-ignore` boundary, GyosJS does not process:

- text interpolation
- `*if`, `*for`, `*switch`, or `*await`
- bindings, directives, events, or `g-model`
- `g-ref` collection
- nested `g-scope`, `gd-*`, or `gm-*` scopes

The `g-ignore` attribute remains in the DOM. Later calls to `mountAll()` and `mountTree()` continue to skip the branch.

Use it for DOM owned by another system, such as a code editor, chart, map, payment widget, or server-rendered fragment whose braces and attributes must remain literal.

`g-ignore` is different from `g-static`:

- `g-static` lets GyosJS render the branch once, then freezes it
- `g-ignore` prevents the first render as well; GyosJS never interprets the branch

Treat `g-ignore` as a mount-time boundary. Adding it after a branch has mounted does not dispose effects that already exist, and removing it does not mount the branch automatically.

`g-ignore` controls component and template initialization. It does not disable MPA Boost navigation; place `g-no-boost` on links, forms, or an ancestor when that behavior must also stay native.

### `g-transition`

Apply transitions to structural changes and `g-show` visibility changes.

```html
<div *if="open" g-transition="fade">Hello</div>
<div g-show="open" g-transition="scale">Still exists while hidden</div>
```

Add a duration modifier in milliseconds when one instance needs different timing:

```html
<div *if="open" g-transition.150="fade">Fast fade</div>
```

### `g-portal`

Move a node to another part of the DOM.

```html
<div g-portal="#modal-root" *if="open">
  ...
</div>
```

### `g-hydrate`

Delay scope mounting until a hydration condition is met.

Supported strategies:

- `idle`
- `visible`
- `interaction`
- `media(...)`

```html
<div g-scope="Sidebar" g-hydrate="visible">
  ...
</div>
```

- `idle` uses `requestIdleCallback` with a timer fallback.
- `visible` waits for `IntersectionObserver` to report visibility.
- `interaction` waits for the first user interaction.
- `media(query)` waits for the media query to match.

### `g-reveal`

Expose viewport visibility for presentation effects without delaying content mounting. The default behavior is one-shot: when the element first intersects the viewport, Gyos adds `data-gyos-revealed` and the compatibility class `is-revealed`, then stops observing it.

```html
<section g-reveal>...</section>
<article g-reveal>...</article>
```

Gyos does not ship reveal animation CSS. Keep the content visible when JavaScript is unavailable by hiding it only after Gyos adds the root readiness class:

```css
html.gyos-reveal-ready [g-reveal] {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 600ms ease, transform 600ms ease;
}

html.gyos-reveal-ready [g-reveal][data-gyos-revealed] {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  html.gyos-reveal-ready [g-reveal] {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

Use `:parent` when the element's own clipping or transform makes its parent the more reliable intersection target. Use `:repeat` only when the effect should reset after leaving the viewport:

```html
<div class="image-frame">
  <img g-reveal:parent class="clip-reveal" src="project.jpg" alt="Finished project">
</div>

<aside g-reveal:repeat>Visible only while intersecting</aside>
```

Pass mount-time options when the defaults need adjustment:

```html
<section g-reveal="{
  threshold: 0.2,
  rootMargin: '0px 0px -12% 0px',
  className: 'is-visible',
  once: true,
  target: 'self'
}">...</section>
```

| Option | Default | Meaning |
| --- | --- | --- |
| `threshold` | `0.1` | Intersection threshold number or number array, clamped to `0..1`. |
| `rootMargin` | `0px` | Margin passed to `IntersectionObserver`. Use a negative bottom margin only when content has enough space below it to cross the reduced viewport boundary. |
| `className` | `is-revealed` | One or more classes added while revealed. The data attribute is always available. |
| `once` | `true` | Stop observing after the first reveal. `g-reveal:repeat` sets this to `false`. |
| `target` | `self` | Observe the element or its direct `parent`. `g-reveal:parent` selects the parent. |

Elements with the same observer options share one `IntersectionObserver`. Gyos unobserves pending elements during structural removal and MPA swaps. Reduced-motion users and browsers without `IntersectionObserver` receive revealed content immediately. A one-shot element restored from a snapshot stays revealed.

`g-reveal` and `g-hydrate="visible"` solve different problems: reveal changes presentation state for content that is already mounted and accessible; visible hydration postpones mounting the scope and its behavior.

### `g-provide`

Provide values from markup to child scopes.

```html
<div g-provide='{"theme":"dark"}'>
  ...
</div>
```

The attribute accepts a JSON object only. For dynamic or executable providers, use `Gyos.provide()` or the scope `$provide()` method instead of generating JavaScript inside HTML attributes.

### `g-cloak`

Remove `g-cloak` after mounting. Pair it with CSS to hide unprocessed template content:

```html
<style>[g-cloak] { display: none !important; }</style>
<div g-scope="Account" g-cloak>{user.name}</div>
```

### `g-focus`

Focus an element when the directive mounts:

```html
<input g-focus placeholder="Focused after mount">
```

### `g-tooltip`

Reactively write an expression to the native `title` attribute:

```html
<button g-tooltip="helpText">Help</button>
```

### `g-on:event`

Listen to the current scope's event channel. The expression must resolve to a handler function or an available scope method:

```html
<div g-on:cart-updated="refreshSummary"></div>
```

### `g-markdown`

Render the supported Markdown subset from a reactive string:

```html
<article g-markdown="articleBody"></article>
```

The built-in converter escapes raw HTML and blocks active URL schemes. Applications still own any richer content policy required for untrusted text.

### `g-form`, `g-validate`, `g-errors`

GyosJS also includes form validation directives.

#### `g-form`

Attach validation state to a form object inside scope.

```html
<form g-form="signupForm">
  ...
</form>
```

`g-form="signupForm"` adds the following object to the current scope. The first six members are callable signals: call them in template expressions, or read their `.value` property from JavaScript.

| Member | Return value | Meaning |
| --- | --- | --- |
| `signupForm.errors()` | `Record<string, string \| null>` | Current error message for each validated field. `null` means that field currently passes validation. |
| `signupForm.touched()` | `Record<string, boolean>` | Whether each validated field has blurred or was included in `validateAll()`. |
| `signupForm.$invalid()` | `boolean` | `true` when at least one field has a non-null error. |
| `signupForm.$valid()` | `boolean` | The inverse of `$invalid()`. |
| `signupForm.$dirty()` | `boolean` | `true` after at least one field is touched. This tracks interaction, not whether a value differs from its initial value. |
| `signupForm.$pristine()` | `boolean` | `true` while no field has been touched. |
| `signupForm.validateAll()` | `Promise<boolean>` | Touch and validate every registered field, then resolve to `true` only when the form is valid. |

New fields start with `null` errors, so a required empty field is initially considered valid. Validation runs after a 300 ms input debounce, on blur, when `validateAll()` is called, or when the form is submitted.

#### `g-validate`

Attach field validation rules.

```html
<input g-model="email" g-validate="required|email">
```

#### `g-errors`

Render validation errors for one field or the whole form.

```html
<span g-errors="email"></span>
<div g-errors></div>
```

#### `g-submit`

Run a scope method after `g-form` validates successfully.

```html
<form g-form="signupForm" g-submit="saveAccount">
  ...
</form>
```

The method receives the scope as `this`. Invalid forms do not call it. Without `g-submit`, a valid form is replayed through the normal submit event pipeline. This preserves the clicked submit button and lets MPA Boost intercept the validated request when `g-boost` is active. Without Boost, the browser continues with native form navigation.

Invalid submissions are stopped before downstream `@submit` handlers run. A validated submission runs those handlers once during replay. Add `g-no-boost` only when that form should intentionally use native navigation, not as a validation workaround.

### Form example

```html
<form g-scope="{ email: '', password: '' }" g-form="signupForm" class="card card-body">
  <label>Email</label>
  <input class="input" g-model="email" g-validate="required|email" placeholder="you@example.com">
  <small g-errors="email" style="color:#c33"></small>

  <label>Password</label>
  <input class="input" type="password" g-model="password" g-validate="required|minLength(8)|password">
  <small g-errors="password" style="color:#c33"></small>

  <button class="btn btn-primary" :disabled="signupForm.$invalid()">Submit</button>
</form>
```

Call `validateAll()` when validation must happen outside the submit flow:

```js
async checkForm() {
  const valid = await this.signupForm.validateAll();
  if (!valid) {
    console.log(this.signupForm.errors());
  }
}
```

---

## Custom Directives

Register custom directives with `Gyos.directive(name, definition)`.

```js
Gyos.directive('color', {
  mounted(el, binding) {
    el.style.color = binding.value;
  },
  updated(el, binding) {
    el.style.color = binding.value;
  },
  unmounted(el) {
    el.style.color = '';
  }
});
```

Use it:

```html
<p g-color="'tomato'">Colored text</p>
```

Shorthand function form is also supported:

```js
Gyos.directive('border', (el, binding) => {
  el.style.border = `1px solid ${binding.value}`;
});
```

### `Gyos.applyDirective(element, name, value, args?)`

Apply a registered directive from JavaScript and receive its cleanup function:

```js
const cleanup = Gyos.applyDirective(element, 'tooltip', 'More details');
cleanup();
```

### Directive binding object

Directive hooks receive this binding contract:

| Property | Value |
| --- | --- |
| `value` | The current evaluated directive expression. |
| `oldValue` | The previous evaluated value in `updated`; `undefined` during the initial `mounted` call. |
| `arg` | `string[] \| undefined` containing colon arguments. |

For `g-fetch:users:replace="apiUrl"`, `binding.arg` is `['users', 'replace']`. `Gyos.applyDirective()` calls `mounted` once and its returned cleanup calls `unmounted`; it does not create reactive `updated` calls.

A bare directive such as `g-focus` receives `undefined` as its value. A directive whose declared scope field is initially `undefined` still mounts and can receive a later `updated` call.

---

## Events

Event syntax uses:

```txt
@event.modifier.modifier="handler"
```

### Basic examples

```html
<button @click="count++">Increase</button>
<form @submit.prevent="save">Save</form>
<input @input="search">
```

### Handler forms

Method name:

```html
<button @click="increment">Increase</button>
```

Method call:

```html
<button @click="increment(5)">Increase by 5</button>
```

Expression:

```html
<button @click="count = 0">Reset</button>
```

### Supported modifiers

- `prevent`
- `stop`
- `once`
- `capture`
- `passive`
- `debounce`
- debounce delay after the modifier, such as `.debounce.300`
- `outside`
- `global`
- keyboard modifiers such as `enter`, `esc`, `space`, `up`, `down`, `left`, `right`, `delete`, `tab`

### Examples

```html
<button @click.prevent="submit">Submit</button>
<input @input.debounce.400="runSearch">
<div @click.outside="open = false"></div>
<div @keydown.escape.global="open = false"></div>
```

Add `g-ignore-outside-click` to a trigger or related control when its click must not count as outside. The marker skips only that click; it does not disable later outside handling, and it also covers descendants of the marked element.

### Event example

```html
<div gd-open="false" class="card card-body" style="position:relative">
  <button class="btn btn-primary" @click="open = !open" g-ignore-outside-click>Toggle Menu</button>
  <div *if="open" tabindex="0" style="position:absolute;top:55px;left:0;background:#fff;color:#111;padding:12px;border:1px solid #ccc;border-radius:8px"
       @click.outside="open = false"
       @keydown.escape.global="open = false">
    Click outside or press Escape
  </div>
</div>
```

---

## `g-model`

`g-model` creates two-way binding for form controls.

### Basic syntax

```html
<input g-model="name">
<textarea g-model="message"></textarea>
<select g-model="category"></select>
```

### Nested paths

Nested properties are supported:

```html
<input g-model="user.name">
<input g-model="items[0].title">
```

### Modifiers

- `.debounce`
- `.debounce.300`
- `.number`
- `.trim`

Examples:

```html
<input g-model.debounce.300="query">
<input g-model.number="age">
<input g-model.trim="username">
```

### Checkbox handling

Checkboxes write boolean values:

```html
<input type="checkbox" g-model="accepted">
```

### Radio handling

Radio controls keep their HTML `value`. The model receives the selected radio value, and programmatic model changes update which option is checked.

```html
<label><input type="radio" name="plan" value="starter" g-model="plan"> Starter</label>
<label><input type="radio" name="plan" value="pro" g-model="plan"> Pro</label>
```

Use `.number` when radio values should enter scope as numbers:

```html
<input type="radio" name="seats" value="10" g-model.number="seats">
```

### Important notes

- `g-model` listens on the `input` event
- the bound field can be auto-created if it does not already exist
- radio `value` attributes are never replaced by the model
- pipes are not used in `g-model` expressions

---

## Pipes

Pipes transform values inside template expressions.

```html
<p>{name | uppercase}</p>
<p>{price | currency('$')}</p>
```

Register them with:

```js
Gyos.pipe('uppercase', value => String(value).toUpperCase());
Gyos.pipe('currency', (value, symbol = '$') => `${symbol}${value}`);
```

Use pipes when:

- the same display transform appears in many templates
- you want formatting logic to stay readable and declarative

### Built-in pipes

| Pipe | Purpose |
| --- | --- |
| `currency`, `date`, `number`, `percent` | Format numeric or date values. |
| `uppercase`, `lowercase`, `capitalize`, `slug`, `truncate`, `reverse` | Transform display strings. |
| `fallback` | Supply a fallback for a falsy value. |
| `json` | Serialize with optional indentation. |
| `pluralize` | Choose a singular or plural label and include the count. |
| `join`, `limit` | Join array values or take the first items. |

---

## Reactivity APIs

### `Gyos.signal(initialValue, options?)`

Signals are the low-level reactive primitive.

```js
const count = Gyos.signal(0);

console.log(count());     // read
count(1);                 // write
console.log(count.value); // read through property
count.value = 2;          // write through property
```

| Member | Return value | Behavior |
| --- | --- | --- |
| `signal()` | `T` | Read and track the signal when called inside an effect or computed value. |
| `signal(nextValue)` | `T` | Write and return `nextValue`. Subscribers run only when the configured equality check reports a change. |
| `signal.value` | `T` | Tracking getter and writable setter. |
| `signal.peek` | `T` | Read without collecting a reactive dependency. |
| `signal.update(fn)` | `void` | Replace the value with `fn(currentValue)`. |
| `signal.subscribe(fn)` | `() => void` | Subscribe to writes and return an unsubscribe function. |

The optional second argument is either a debug label string or `{ debugLabel, equals }`. `equals(previous, next)` controls whether a write notifies subscribers.

### `Gyos.computed(fn)`

Create a derived reactive value.

```js
const count = Gyos.signal(2);
const doubled = Gyos.computed(() => count.value * 2);
```

A computed value is read-only. Read it with `doubled()` or `doubled.value`, use `doubled.peek` for a non-tracking read, and use `doubled.subscribe(fn)` to receive changes. `subscribe()` returns an unsubscribe function.

### `Gyos.effect(fn)`

Run a side effect that tracks the signals it reads.

```js
const dispose = Gyos.effect(() => {
  console.log('Count:', count.value);
});
```

Returns a disposer that stops the effect. The callback may also return a per-run cleanup function; GyosJS runs it before the next execution and when the effect is disposed.

```js
const stop = Gyos.effect(() => {
  const controller = new AbortController();
  fetch(`/search?q=${query.value}`, { signal: controller.signal });

  return () => controller.abort();
});

stop();
```

### `Gyos.batch(fn)`

Batch multiple signal writes:

```js
Gyos.batch(() => {
  firstName('Ada');
  lastName('Lovelace');
});
```

### `Gyos.isSignal(value)` and `Gyos.isComputed(value)`

Type checks for advanced logic.

### `Gyos.unref(value)`

Read plain values and signals with one helper.

### `Gyos.untrack(fn)`

Read signals without collecting dependencies for the current effect.

### `Gyos.markRaw(object)`

Exclude an object from deep proxy conversion. The containing property remains reactive when the whole object is replaced. Use this for browser objects, class instances, or third-party objects whose identity and behavior must be preserved.

### `Gyos.shallow(object)`

Make only the object's direct properties reactive. Nested objects remain raw.

---

## DI APIs

### `Gyos.provide(key, value)`

Provide a global value.

### `Gyos.inject(key, defaultValue?)`

Read a globally provided value. `Gyos.inject()` does not read element-scoped `g-provide` values.

You can also use scope-local forms:

- `this.$provide(key, value)`
- `this.$inject(key)`

Those scope helpers, and the directive context `inject()` helper, resolve values from the element injector chain.

### `Gyos.getGlobalContainer()`

Return the global dependency container for integration or debugging. Application code should normally prefer `provide` and `inject`.

---

## Store APIs

### `Gyos.store(name, definition?)`

Create or read a global reactive store.

```js
const userStore = Gyos.store('user', {
  currentUser: null,
  login(user) {
    this.currentUser = user;
  },
  logout() {
    this.currentUser = null;
  }
});
```

Later:

```js
const sameStore = Gyos.store('user');
```

Reading an unknown store throws. Define it first or guard the lookup with `Gyos.hasStore(name)`. Passing a definition for an existing name replaces that registry entry.

| Helper | Return value | Behavior |
| --- | --- | --- |
| `Gyos.hasStore(name)` | `boolean` | Check whether the name is registered. |
| `Gyos.removeStore(name)` | `void` | Remove the registered store. |
| `Gyos.getStoreNames()` | `string[]` | Return all registered store names. |

Use stores when multiple scopes need the same application-level state.

---

## Event Bus APIs

### `Gyos.on(event, handler)`

Subscribe to a global event and return an unsubscribe function.

### `Gyos.emit(event, ...args)`

Emit a global event. Returns `void`.

### `Gyos.off(event, handler?)`

Remove one handler, or all handlers for the event when `handler` is omitted. Returns `void`.

### `Gyos.once(event, handler)`

Subscribe for one emission only and return an unsubscribe function.

### Debug helpers

- `Gyos.getEventListeners()` returns `Record<string, number>` with the listener count for every event.
- `Gyos.clearAllEvents()` removes every global event listener and returns `void`.

Use the global event bus for cross-scope communication. Use `$emit` and `$on` when the interaction should stay inside one scope tree.

---

## Validation APIs

### `Gyos.validator(name, fn)`

Register a custom validator.

```js
Gyos.validator('even', value => {
  return value % 2 === 0 || 'Must be even';
});
```

### `Gyos.validate(value, rules, context?)`

Validate a value against pipe-style rule strings.

```js
const error = await Gyos.validate('test@example.com', 'required|email');
```

The promise resolves to `null` when valid or to the first error message. All built-in validators except `required` allow empty values, so combine a format rule with `required` when the field is mandatory.

### Built-in validators

| Rule | Valid when |
| --- | --- |
| `required` | The value is not `null`, an empty string, or an empty array. |
| `email` | The value has a basic `name@domain.tld` shape. |
| `minLength(length)` / `maxLength(length)` | String or array length is within the limit. |
| `min(value)` / `max(value)` | Parsed numeric value is within the limit. |
| `number` | The value can be parsed as a finite number. |
| `integer` | The parsed numeric value is an integer. |
| `numeric` | The value contains ASCII digits only. |
| `alpha` | The value contains ASCII letters only. |
| `alphanumeric` | The value contains ASCII letters and digits only. |
| `pattern(regex)` | The value matches the supplied regular-expression source. |
| `same(fieldName)` / `different(fieldName)` | The value equals or differs from another field in validation context. |
| `url` | The browser `URL` constructor accepts the value. |
| `phone` | Vietnamese phone format: `0` followed by nine digits. |
| `date` | A parseable date written as `YYYY-MM-DD`. |
| `before(date)` / `after(date)` | The parsed date is strictly before or after the target date. |
| `password` | At least eight characters with an uppercase letter, lowercase letter, and number. |
| `in(a,b,c)` / `notIn(a,b,c)` | The string value is included in or excluded from the supplied list. |
| `between(min,max)` | The parsed numeric value is inside the inclusive range. |

### Validation context

Some validators use form context, such as `same(password)`.

```js
await Gyos.validate(confirmPassword, 'same(password)', {
  form: { password: 'secret123' }
});
```

---

## Composables

GyosJS includes small reusable composables:

| Composable | Return contract |
| --- | --- |
| `Gyos.useFetch(url)` | `data: Signal<T \| null>`, `loading: Signal<boolean>`, `error: Signal<Error \| null>`, plus async `refetch()` and `onMount()`. `url` may be a string or a function returning a URL, `Response`, or promise of either. |
| `Gyos.useCounter(initialValue)` | Writable `count`, read-only `double`, and `increment(step?)`, `decrement(step?)`, `reset()`. |
| `Gyos.useToggle(initialValue)` | One boolean signal exposed as both `state` and `value`, plus `toggle()`, `setTrue()`, `setFalse()`. |
| `Gyos.useLocalStorage(key, defaultValue)` | Writable `state` that persists after writes, `remove()` to delete the storage key, and `onUnmount()` to stop persistence. |
| `Gyos.useInterval(callback, delay)` | `start()`, `stop()`, `restart()`, `onMount()`, `onUnmount()`. A `null` delay disables the interval. |
| `Gyos.useTimeout(callback, delay)` | `start()`, `clear()`, `onMount()`, `onUnmount()`. |
| `Gyos.useDebounce(initialValue, delay)` | Writable `value`, read-only delayed `debounced`, and `onUnmount()`. It debounces a reactive value, not a function call. |
| `Gyos.useThrottle(initialValue, delay)` | Writable `value`, read-only leading-edge `throttled`, and `onUnmount()`. It throttles a reactive value, not a function call. |
| `Gyos.useMouse()` | `x` and `y` signals plus window-listener lifecycle hooks. |
| `Gyos.useWindowSize()` | `width` and `height` signals plus window-listener lifecycle hooks. |
| `Gyos.useMediaQuery(queries)` | `matches`, an object of boolean signals keyed like `queries`, plus lifecycle hooks. |
| `Gyos.useAsync(asyncFn, immediate?)` | `data`, `loading`, `error` signals, async `execute()`, and `onMount()`. `immediate` defaults to `true`. |

These are useful when one piece of logic appears across multiple scopes, but they are not required for ordinary GyosJS usage.

```js
const search = Gyos.useDebounce('', 300);

search.value('gyos');
console.log(search.debounced()); // still the previous value

setTimeout(() => {
  console.log(search.debounced()); // "gyos"
  search.onUnmount();
}, 350);
```

---

## Transition APIs

### Built-in transition names

- `fade`
- `slide-down`
- `slide-up`
- `slide-left`
- `slide-right`
- `scale`
- `zoom`

Use them declaratively:

```html
<div *if="open" g-transition="fade">Hello</div>
<div g-show="open" g-transition.200="slide-down">Menu</div>
```

Built-in transition helper classes use a `gyos-t-` prefix internally, so they do not redefine common application or Tailwind utilities such as `.opacity-0` and `.scale-100`.

### `Gyos.registerTransition(name, config)`

Register or replace a custom transition. Returns `void`.

```js
Gyos.registerTransition('pop', {
  enterFrom: 'scale-50 opacity-0',
  enterTo: 'scale-100 opacity-100',
  leaveFrom: 'scale-100 opacity-100',
  leaveTo: 'scale-50 opacity-0',
  duration: 250
});
```

### `Gyos.getTransitionConfig(source)`

Read a transition config by registered name or directly from an element. Passing an element also reads a numeric `g-transition.N` duration modifier.

```js
Gyos.getTransitionConfig('fade');
Gyos.getTransitionConfig(document.querySelector('[g-transition]'));
```

### `Gyos.applyTransitionStyles()`

Inject base transition styles into the page. Returns `void`.

The auto build already calls this for you.

---

## Portal APIs

### `Gyos.portalCreate(sourceEl, targetSelector)`

Move an element to another target in the DOM. Returns `void`.

### `Gyos.portalDestroy(sourceEl)`

Restore the element to its original location. Returns `void`.

This is the programmatic version of what `g-portal` is solving declaratively.

---

## Utility APIs

### `Gyos.ready(callback)`

Run code on DOM ready. Returns `void`.

### `Gyos.nextTick(callback)`

Schedule the callback in a microtask after current synchronous updates. Returns `void`.

### `Gyos.debounce(fn, delay)`

Return a wrapper that calls `fn` after calls have stopped for `delay` milliseconds. The wrapper returns `void` and does not expose a cancel method.

### `Gyos.throttle(fn, delay)`

Return a leading-edge wrapper that calls `fn` at most once per delay window. Calls inside the window are dropped; the wrapper returns `void`.

### `Gyos.setCspNonce(source)`

Configure the nonce used when the CSP build recreates scripts received through MPA Boost. The argument is a string, a callback returning a string, or `undefined` to clear the configured nonce. Returns `void`.

```js
Gyos.setCspNonce(document.querySelector('meta[name="csp-nonce"]')?.content);

// Resolve it when each script is created instead.
Gyos.setCspNonce(() => window.appSecurity.cspNonce);
```

The CDN CSP auto bundle captures the nonce from its own `<script>` element. Custom npm bundles should configure it explicitly when boosted responses can contain scripts. This API does not enable CSP mode by itself; import `gyosjs/csp` or `gyosjs/csp/auto`. See [Content Security Policy](./content-security-policy.md).

### `Gyos.version`

The current package version as a string.

---

## Router APIs

### `Gyos.startRouter(options?)`

Start the MPA boost router.

```js
Gyos.startRouter();

// Keep boosted navigation but disable the global progress bar.
Gyos.startRouter({ showProgress: false });
```

Current router notes that matter for users:

- it only starts if the document contains `g-boost`
- calling it more than once does not register duplicate listeners
- it works on same-origin links and forms
- it resolves targets from `g-target`, nearest outlet ancestor, or the global outlet
- an `inner` swap on the first global outlet also synchronizes that outlet node's attributes, including `g-scope` and classes
- it supports snapshots, persist islands, partial swaps, and script handling
- failed requests fall back to hard browser navigation without first unmounting the current target
- when navigations overlap, only the latest navigation may update the DOM

### Router hooks

```js
Gyos.onBeforeNavigate((url) => {
    console.log('requesting', url);
});

Gyos.onAfterNavigate((url) => {
    console.log('mounted', url);
});
```

`onBeforeNavigate` runs when GyosJS accepts a navigation, before it fetches or restores a snapshot.

`onAfterNavigate` runs only for the navigation that commits. At that point:

- the swap has completed
- persisted islands have been merged
- incoming scopes have mounted
- scroll handling has run
- the View Transition update callback has completed, when supported

The hook does not wait for the View Transition animation to finish.

Both hook registration functions return `void`; the current public API does not provide hook removal. Register long-lived application hooks once during startup.

### Router target resolution

For each boosted trigger, the live target is selected in this order:

1. the selector in `g-target`
2. the nearest ancestor with `g-outlet`
3. the first global `g-outlet`

After parsing the response, the source fragment is selected in this order:

1. an element with the same `id` as the live target
2. for a live `g-outlet`, the response outlet at the same document position
3. the first response element with `g-outlet`
4. the response body

This lets one trigger consume either a complete HTML response or a focused fragment response.

Give partial targets stable IDs whenever possible. Positional matching supports unnamed nested outlets, but their `[g-outlet]` order must remain consistent between the live and incoming documents.

Boost responses must remain same-origin, return `text/html` or `application/xhtml+xml`, and must not use `Content-Disposition: attachment`. A rejected GET response falls back to native navigation instead of being inserted as executable HTML. A non-GET request is not replayed after it has been sent; GyosJS keeps the current DOM mounted and logs the rejection.

### Public TypeScript types

The package root exports `Signal`, `SignalOptions`, `Computed`, `Scope`, `ScopeFactory`, `ScopeDefinition`, `ComponentContext`, `WatchCallback`, `WatchOptions`, `Directive`, `DirectiveBinding`, `RevealOptions`, `PipeFn`, `ValidatorFn`, `ValidationContext`, `HydrationStrategy`, `TransitionConfig`, `RouterOptions`, and `CspNonceSource` as type-only exports.

### Router attributes you will use most

- `g-boost`: enable boosted links/forms on the element, or place it on `<body>` to enable descendants by default
- `g-outlet`: mark a page region that receives navigation HTML
- `g-target`: select a narrower live target, such as `#results` or `#sidebar`
- `g-swap`: choose `inner`, `replace`, `morph`, `append`, or `prepend`; the default is `inner`
- `g-snapshot`: allow response HTML for this target to be restored during history navigation
- `g-persist`: keep the same live DOM island across destructive swaps by matching a stable key
- `g-preload`: fetch a same-origin anchor response on mouseover and consume it on navigation
- `g-current-head`: keep the current title and head when navigating the first global outlet
- `g-change-state`: force a router action that normally stays on the current URL to push or replace history
- `g-current-state`: suppress history changes, including redirected non-`GET` history updates
- `g-noscroll`: skip hash, saved-position, and scroll-to-top handling for that trigger
- `g-router-spin`: show a temporary spinner in the selected target while loading
- `g-router-remove`: remove the trigger after a successful navigation commit; useful for replacing a load-more control during `append` or `prepend`
- `g-router-link`: use any element as a router trigger and provide its URL
- `g-router-method`: set `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` for `g-router-link`
- `g-router-params`: evaluate an object expression in the current scope and send it as query params or JSON

### Swap lifecycle

`inner`, `replace`, and `morph` are destructive swaps. Once a valid response is ready, GyosJS parks target persist islands, unmounts outgoing target scopes, applies the new HTML, restores matching islands, and mounts the incoming scopes.

`append` and `prepend` are additive swaps. They insert the source fragment's child nodes while keeping existing scopes and effects mounted. Only incoming scopes mount and only incoming scripts are processed.

### History rules

- normal boosted `GET` anchors and `GET` forms change history
- `g-router-link` stays on the current history entry by default
- `g-change-state` opts a router link or partial action into a history update
- a non-redirected non-`GET` response can render validation HTML without changing the URL
- a redirected non-`GET` response updates history to `response.url`
- `g-current-state` suppresses all history changes for that trigger
- browser back/forward restores a matching snapshot when available and never pushes another entry

Same-document hash links stay under native browser control.

### Full outlet versus partial target

A full-outlet navigation may update the title, supported head nodes, and body scripts outside the outlet. A `g-target` navigation to a smaller region does not touch the document head or global body scripts. Scripts inside the incoming target still follow `g-script-once` and `g-script-wrap` rules.

For the full behavioral guide, read:

- [MPA Boost Deep Dive](./mpa-boost-deep-dive.md)
- [Layouts, Scripts, and Lifecycle](./layouts-scripts-lifecycle.md)

---

## Browser Global

When you use the auto build from CDN or `gyosjs/auto`, GyosJS attaches:

```js
window.Gyos
```

That is the normal global entrypoint for no-build usage.

---

## Recommended Follow-Up

- [Tutorial Guide](./tutorial-guide.md)
- [Best Practices](./best-practices.md)
- [MPA Boost Deep Dive](./mpa-boost-deep-dive.md)
- [Distribution and Installation](./distribution-and-installation.md)
