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

### `Gyos.scope(element, definition)`

You can also register a scope directly on a specific element.

```js
const el = document.getElementById('mounted-once');
Gyos.scope(el, {
  message: 'Mounted directly on one element'
});
```

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

Mount scopes only inside one subtree.

Useful after custom DOM insertion or partial updates outside the router.

### `Gyos.cleanup(target?)`

Dispose tracked effects for a subtree.

This is an advanced escape hatch and is less common than normal mounting and unmounting.

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

### Live example

<div gd-count="0" gm-increment="count++" class="card card-body">
  <p>Count: <strong>{count}</strong></p>
  <button class="btn btn-primary" @click="increment">Increase</button>
</div>

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

### Example

<div g-scope="{ name: 'GyosJS', count: 2, get double() { return this.count * 2; } }" class="card card-body">
  <p>Hello {name}</p>
  <p>Count: {count}</p>
  <p>Double: {double}</p>
</div>

---

## Attribute Bindings

GyosJS supports `:attribute` syntax for reactive DOM attributes.

### Common bindings

- `:class`
- `:style`
- `:disabled`
- `:readonly`
- `:checked`
- `:value`
- `:src`
- `:href`

Bound URLs reject active schemes and unsafe `data:` values. URL bindings on active-content elements such as `script`, `iframe`, `embed`, `object`, `base`, and `link` are removed; configure trusted resources outside reactive bindings.

### `:class`

String form:

```html
<div :class="'active'"></div>
```

Object form:

```html
<div :class="{ active: isActive, hidden: !visible }"></div>
```

### `:style`

String form:

```html
<div :style="'color:red; font-weight:bold'"></div>
```

Object form:

```html
<div :style="{ color: textColor, fontSize: size + 'px' }"></div>
```

### Boolean attribute bindings

```html
<button :disabled="isSaving">Save</button>
<input :readonly="locked">
<input type="checkbox" :checked="accepted">
```

### Example

<div g-scope="{ active: true, danger: false, size: 18 }" class="card card-body">
  <p :class="{ 'text-success': active, 'text-danger': danger }" :style="{ fontSize: size + 'px' }">
    Styled by GyosJS bindings
  </p>
  <button class="btn btn-info" @click="active = !active; danger = !danger">Toggle</button>
</div>

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

Apply transitions to structural changes.

```html
<div *if="open" g-transition="fade">Hello</div>
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

### `g-provide`

Provide values from markup to child scopes.

```html
<div g-provide='{"theme":"dark"}'>
  ...
</div>
```

The attribute accepts a JSON object only. For dynamic or executable providers, use `Gyos.provide()` or the scope `$provide()` method instead of generating JavaScript inside HTML attributes.

### `g-form`, `g-validate`, `g-errors`

GyosJS also includes form validation directives.

#### `g-form`

Attach validation state to a form object inside scope.

```html
<form g-form="signupForm">
  ...
</form>
```

The form state exposes:

- `errors`
- `touched`
- `$invalid`
- `$valid`
- `$dirty`
- `$pristine`
- `validateAll()`

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

The method receives the scope as `this`. Invalid forms do not call it. Without `g-submit`, a valid form continues through native `form.submit()`.

### Live form example

<form g-scope="{ email: '', password: '' }" g-form="signupForm" class="card card-body" g-no-boost>
  <label>Email</label>
  <input class="input" g-model="email" g-validate="required|email" placeholder="you@example.com">
  <small g-errors="email" style="color:#c33"></small>

  <label>Password</label>
  <input class="input" type="password" g-model="password" g-validate="required|minLength(8)|password">
  <small g-errors="password" style="color:#c33"></small>

  <button class="btn btn-primary" :disabled="signupForm.$invalid">Submit</button>
</form>

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

### Directive binding object

Directive hooks receive a binding object with:

- `value`
- `oldValue`
- `arg`

Arguments come from `g-directive:arg1:arg2="..."`.

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
- numeric debounce value such as `.300`
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

### Live event example

<div gd-open="false" class="card card-body" style="position:relative">
  <button class="btn btn-primary" @click="open = !open" g-ignore-outside-click>Toggle Menu</button>
  <div *if="open" tabindex="0" style="position:absolute;top:55px;left:0;background:#fff;color:#111;padding:12px;border:1px solid #ccc;border-radius:8px"
       @click.outside="open = false"
       @keydown.escape.global="open = false">
    Click outside or press Escape
  </div>
</div>

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

### Important notes

- `g-model` listens on the `input` event
- the bound field can be auto-created if it does not already exist
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

Useful members:

- callable read/write
- `.value`
- `.peek`
- `.update(fn)`
- `.subscribe(fn)`

### `Gyos.computed(fn)`

Create a derived reactive value.

```js
const count = Gyos.signal(2);
const doubled = Gyos.computed(() => count.value * 2);
```

### `Gyos.effect(fn)`

Run a side effect that tracks the signals it reads.

```js
const dispose = Gyos.effect(() => {
  console.log('Count:', count.value);
});
```

Returns a cleanup function.

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

---

## DI APIs

### `Gyos.provide(key, value)`

Provide a global value.

### `Gyos.inject(key, defaultValue?)`

Read a value from the injector chain.

You can also use scope-local forms:

- `this.$provide(key, value)`
- `this.$inject(key)`

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

Helpers:

- `Gyos.hasStore(name)`
- `Gyos.removeStore(name)`
- `Gyos.getStoreNames()`

Use stores when multiple scopes need the same application-level state.

---

## Event Bus APIs

### `Gyos.on(event, handler)`

Subscribe to a global event.

### `Gyos.emit(event, ...args)`

Emit a global event.

### `Gyos.off(event, handler?)`

Remove one handler or all handlers for the event.

### `Gyos.once(event, handler)`

Subscribe for one emission only.

### Debug helpers

- `Gyos.getEventListeners()`
- `Gyos.clearAllEvents()`

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

### Built-in validators

- `required`
- `email`
- `minLength(length)`
- `maxLength(length)`
- `min(value)`
- `max(value)`
- `number`
- `integer`
- `numeric`
- `alpha`
- `alphanumeric`
- `pattern(regex)`
- `same(fieldName)`
- `different(fieldName)`
- `url`
- `phone`
- `date`
- `before(date)`
- `after(date)`
- `password`
- `in(a,b,c)`
- `notIn(a,b,c)`
- `between(min,max)`

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

- `Gyos.useFetch(url)`
- `Gyos.useCounter(initialValue)`
- `Gyos.useToggle(initialValue)`
- `Gyos.useLocalStorage(key, defaultValue)`
- `Gyos.useInterval(callback, delay)`
- `Gyos.useTimeout(callback, delay)`
- `Gyos.useDebounce(initialValue, delay)`
- `Gyos.useThrottle(initialValue, delay)`
- `Gyos.useMouse()`
- `Gyos.useWindowSize()`
- `Gyos.useMediaQuery(queries)`
- `Gyos.useAsync(asyncFn, immediate?)`

These are useful when one piece of logic appears across multiple scopes, but they are not required for ordinary GyosJS usage.

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
```

### `Gyos.registerTransition(name, config)`

Register a custom transition.

```js
Gyos.registerTransition('pop', {
  enterFrom: 'scale-50 opacity-0',
  enterTo: 'scale-100 opacity-100',
  leaveFrom: 'scale-100 opacity-100',
  leaveTo: 'scale-50 opacity-0',
  duration: 250
});
```

### `Gyos.getTransitionConfig(name)`

Read a transition config.

### `Gyos.applyTransitionStyles()`

Inject base transition styles into the page.

The auto build already calls this for you.

---

## Portal APIs

### `Gyos.portalCreate(sourceEl, targetSelector)`

Move an element to another target in the DOM.

### `Gyos.portalDestroy(sourceEl)`

Restore the element to its original location.

This is the programmatic version of what `g-portal` is solving declaratively.

---

## Utility APIs

### `Gyos.ready(callback)`

Run code on DOM ready.

### `Gyos.nextTick(callback)`

Run code on the next microtask after current updates.

### `Gyos.debounce(fn, delay)`

Create a debounced wrapper.

### `Gyos.throttle(fn, delay)`

Create a throttled wrapper.

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

The package root exports `Signal`, `SignalOptions`, `Computed`, `Scope`, `ComponentContext`, `WatchCallback`, `WatchOptions`, `Directive`, `DirectiveBinding`, `PipeFn`, `ValidatorFn`, `ValidationContext`, `HydrationStrategy`, `TransitionConfig`, and `RouterOptions` as type-only exports.

### Router attributes you will use most

- `g-boost`: enable boosted links/forms on the element, or place it on `<body>` to enable descendants by default
- `g-outlet`: mark a page region that receives navigation HTML
- `g-target`: select a narrower live target, such as `#results` or `#sidebar`
- `g-swap`: choose `inner`, `replace`, `morph`, `append`, or `prepend`; the default is `inner`
- `g-snapshot`: allow response HTML for this target to be restored during history navigation
- `g-persist`: keep the same live DOM island across destructive swaps by matching a stable key
- `g-preload`: fetch a same-origin anchor response on mouseover and consume it on navigation
- `g-current-head`: keep the current title and head during a full-outlet navigation
- `g-change-state`: force a router action that normally stays on the current URL to push or replace history
- `g-current-state`: suppress history changes, including redirected non-`GET` history updates
- `g-noscroll`: skip hash, saved-position, and scroll-to-top handling for that trigger
- `g-router-spin`: show a temporary spinner in the selected target while loading
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
