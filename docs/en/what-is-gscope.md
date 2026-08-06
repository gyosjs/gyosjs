# G-Scope in GyosJS

Below are the core concepts in GyosJS that you need to master to use GyosJS effectively.

* **G-Scope** – data scope and logic in GyosJS
* **Reactivity & Signals** – how GyosJS tracks and updates the DOM when data changes
* **Template Syntax** – template syntax in GyosJS, including bindings, directives, and expressions

In this section, we will learn about G-Scope – data scope and logic in GyosJS. Let's dive in!

---

### Overview of G-Scope

`g-scope` is the **most core concept** in GyosJS.<br>
If you only understand one thing in GyosJS correctly, it should be `g-scope`.

It's where you **declare state**, **logic**, and **reactive context** for a piece of the DOM.

---

`g-scope` is used to **create an independent data scope** for a piece of HTML.

Inside this scope, you can:

* declare state
* bind data to the DOM
* handle events
* write logic (methods, computed)
* use other GyosJS directives

```html
<div g-scope="{ count: 0 }" class="card">
  <div class="card-header">Simple Counter</div>
  <div class="card-body">
    <p>Count: {count}</p>
    <button class="btn btn-primary" @click="count++">Increase</button>
  </div>
</div>
```

The simplest example:

```html
<div g-scope="{ count: 0 }">
  <p>Count: {count}</p>
  <button @click="count++">Increase</button>
</div>
```

Here:

* `{ count: 0 }` is the initial state
* `{count}` is rendered to the DOM
* When `count` changes, the DOM automatically updates

No build steps needed. No complex classes, components, or lifecycle required.

---

#### How does Scope work? 

Each `g-scope`:

* has its own **state**
* does not affect other scopes
* is only reactive to the DOM inside it

```html
<div class="card">
  <div class="card-header">Independent Scopes</div>
  <div class="card-body">
    <div g-scope="{ count: 0 }">
      <button class="btn btn-primary" @click="count++">Scope A: {count}</button>
    </div>
    <hr>
    <div g-scope="{ count: 0 }">
      <button class="btn btn-primary" @click="count++">Scope B: {count}</button>
    </div>
  </div>
</div>
```

Example:

```html
<div g-scope="{ count: 0 }">
  <button @click="count++">Scope A: {count}</button>
</div>

<div g-scope="{ count: 0 }">
  <button @click="count++">Scope B: {count}</button>
</div>
```

These two scopes are **completely independent**, despite sharing the same variable name `count`.

---

#### Declaring scope using inline objects

The simplest way is to declare the object directly:

```html
<div g-scope="{
  name: 'GyosJS',
  version: '0.1.0'
}">
  <p>{name} - {version}</p>
</div>
```

This method is suitable for:

* quick and simple demos
* small and simple logic
* simple layouts with direct logic in HTML
* **the best** when combined with MPA boost, no need to use complex `<script>` tags.

> Tip: Inline scopes can be URL-encoded to use in HTML attributes. 

For example:

```html
g-scope="%7B%20name%3A%20%27GyosJS%27%2C%20version%3A%20%270.1.0%27%20%7D"
```

is equivalent to the scope above. This is useful to avoid HTML errors caused by quotes, brackets, or other special characters.

---

#### Declare the scope using `Gyos.scope()` 

For more complex logic, you should declare the scope in a script to separate HTML and JS:

```html
<div g-scope="TodoApp">...</div>

<script>
  Gyos.scope('TodoApp', {
    todos: [],
    newTodo: '',
    addTodo() {
      if (!this.newTodo) return;
      this.todos.push({
        text: this.newTodo,
        done: false
      });
      this.newTodo = '';
    }
  });
</script>
```

This approach helps to:

* write clearer code
* maintain code more easily
* reuse code more effectively
* avoid too much inline JS in HTML

---

#### Declare the scope using `gm-` and `gd-`

Besides the above declaration methods, you can also use directives:

* `gm-name:arg1:arg2="LOGIC"` to declare a method `name` with parameters `arg1`, `arg2`, ...
* `gd-name="VALUE"` to declare a data field `name` with the value `VALUE`.

Then, GyosJS will automatically create a scope and add these fields/methods to that scope.

**Example:**

```html
<div class="counter" gd-count="0" gm-increment="count++">
  <p>Count: {count}</p>
  <button @click="increment">Increase</button>
</div>
```

In which:

* `div.counter` will have an automatically created scope
* `gd-count="0"` creates a field `count` with the initial value `0`
* `gm-increment="count++"` creates a method `increment()` to increase `count`
* When the button is clicked, `increment()` is called to increase `count`

This approach is suitable for very compact logic, without the need to create complex scopes. When the backend renders HTML, you can assign values to specific properties without encoding the entire scope object. 

For example, if only `count` needs to be initialized from the server, instead of using `g-scope="{ count: {{ $count }} }"`, you can simply use `gd-count="{{ $count }}"`.

---

Note when using `gd-`:
* to declare a number value: `gd-count="42"` (no quotes)
* to declare a boolean value: `gd-visible="true"` or `gd-visible="false"`
* to declare a string value: `gd-name="GyosJS"` (also no quotes)
* `gd-name=""` will create `name` with an empty string value `''`

Note when using `gm-`:
* `gm-increment="count++"` creates a void method `increment()` with no parameters
* `gm-set-name:newName="name = newName"` creates a method `setName(newName)` & parameter `newName`
* `gm-get-name="return name"` creates a method `getName()` that returns the value of `name`
* no need to use `this` because GyosJS automatically binds the correct context for you.
* you can URL-encode logic like `gm-hello="alert%28%27Hello%20GyosJS%27%29%0A"`

> Note: Method/field names will be automatically converted from kebab-case to camelCase.

---

#### Automatic model binding with `g-model`

`g-model` is the fastest way to bind data two-way (two-way data binding) to input elements.

**Example:**

```html
<div g-scope="{ name: '' }">
  <input g-model="name" placeholder="Enter your name" />
  <p>Hello, {name}!</p>
</div>
```

**In which:**
* `g-model="name"` binds the input value to the `name` field in the scope
* When the user types into the input, `name` is automatically updated
* When `name` changes, the DOM automatically updates

> GyosJS allows automatic declaration of fields when using `g-model` <br>If the field does not already exist in the scope.

**Example:**

```html
<div g-scope>
  <input g-model="gyosjs" value="Hello world" />
  <p>{gyosjs}</p>
  <input g-model="email" placeholder="Enter your email" />
  <p>Your email is: {email}</p>
</div>
```

**In which:**
* `g-scope` does not have an initial object
* `g-model="gyosjs"` automatically creates the field `gyosjs` with the initial value `"Hello world"`
* `g-model="email"` automatically creates the field `email` with the initial value `''`

This approach is very convenient for simple forms, without the need to declare all fields in the scope beforehand.

Note: `g-model` will automatically find the nearest parent scope to bind the data.

---

#### Accessing state and methods within the scope 

Inside the scope, you can:

**1. Bind data**

```html
<p>{message}</p>
```

Allows displaying the value of `message`. When `message` changes, the DOM automatically updates.

**2. Call method**

```html
<button @click="submit()">Submit</button>
```

Call method `submit()` when clicked. <br>
You can omit the parentheses if the method has no parameters: `@click="submit"`.

**3. Use JavaScript expressions**

```html
<p>{count * 2}</p>
<p>{count % 2 === 0 ? 'Even' : 'Odd'}</p>
```

All expressions are evaluated **within the context of the current scope**.

**4. Filter data**

```html
<p>{message | uppercase}</p>
```

Applies the `uppercase` filter to `message` before displaying.

You can chain multiple filters: `{value | trim | lowercase}`.

Details about pipes filters will be covered in the [Template Syntax](template-syntax.md) section.

---

#### Computed value in `g-scope`

Properties in the Scope are automatically reactive. Therefore, you can use functions or getters as computed values. When a function or getter is accessed in the template, GyosJS will automatically track the signals it depends on.

---

Therefore, computed values can be written in two ways:

**Function form**:

```js
{
  numbers: [1, 2, 3],
  total() {
    return this.numbers.reduce((a, b) => a + b, 0);
  }
}
```

**In which:**
* `total` is a function
* when `total` is accessed, GyosJS tracks `this.numbers`
* when `numbers` changes, `total` is recalculated

Alternatively, you can use a **getter:**

```js
{
  numbers: [1, 2, 3],
  get total() {
    return this.numbers.reduce((a, b) => a + b, 0);
  }
}
```

**In which:**
* `total` is a getter
* when `total` is accessed, GyosJS also tracks `this.numbers`
* when `numbers` changes, `total` is recalculated

Both ways can be used in the template the same way:

```html
<p>Total: {total}</p>
```

GyosJS allows calling `{total}` without parentheses because it automatically recognizes `total` as a computed value.

---

#### Organizing code with multiple scopes

When the application grows larger, you can organize the code into smaller scopes.

**Example:**

```html
<div g-scope="App">
  <header g-scope="Header">...</header>
  <main g-scope="MainContent">...</main>
  <footer g-scope="Footer">...</footer>
</div>
```

Each child scope:
* has its own state and logic
* does not affect the parent scope or other scopes
* helps clearly separate responsibilities
* accesses values and emits events between scopes via props or custom events

This helps:
* make the code more readable
* easier to maintain
* more reusable

GyosJS encourages using multiple small scopes instead of one large scope with too much logic.

---

#### Context in scope

Each scope has some **special context** to interact with the GyosJS runtime:

1. `$refs` – references to DOM nodes inside the scope

```html
<div g-scope="{ count: 0 }">
  <input g-ref="inputEl" g-model="count" />
  <button @click="$refs.inputEl.focus()">Focus Input</button>
</div>
```

**In which:**
* `$refs.inputEl` references the input element
* when clicking the button, the input will be focused

With `$refs`, you can easily manipulate DOM elements inside the scope directly without needing to use `document.querySelector` or other complex methods.

---

2. `$emit` – emit custom events from the scope

3. `$on` – listen to custom events within the scope

```html
<div g-scope="EOScope" class="ee-listen">
  <button @click="$emit(eventName, count)">Emit Event</button>
</div>

<script>
  const eventName = 'customEvent';

  Gyos.scope('EOScope', {
    eventName,
    get count() {
        return Math.floor(Math.random() * 100);
    },
    eventListenFn(value) {
      console.log('Received customEvent with value:', value);
    },
    onMount() {
      this.$on(this.eventName, this.eventListenFn);
    }
  });

  // listen to custom events from DOM outside the scope
  const scopeEl = document.querySelector('.ee-listen');
  scopeEl.addEventListener(eventName, (e) => {
    console.log('DOM received customEvent with the value:', e.detail);
    // Log: DOM received customEvent with the value: [random number]
  });
</script>
```

**In which:**
* `$emit('customEvent', count)` emits the `customEvent` with the parameter `count`
* Simultaneously, `$emit` also triggers the DOM event `customEvent` on the root element of the scope.
* `$on('customEvent', callback)` listens to the `customEvent` and calls `callback` when the event occurs
* when clicking the button, the `customEvent` is emitted & `eventListenFn` called with the value of `count`

> Note: `$on` is usually called in the lifecycle method `onMount()` to ensure the scope is fully initialized before listening to events.

In the example above, `$emit` and `$on` only work within the scope of `EOScope`. <br>
If you want to communicate between different scopes, you need to use:
* `Gyos.emit(eventName, ...args)` – emit global events
* `Gyos.on(eventName, callback)` – listen to global events
* `Gyos.once(eventName, callback)` – listen to global events once and then remove the listener

> Note: `Gyos.on` cannot listen to events emitted by `$emit` within a scope. They only listen to global events emitted via `Gyos.emit()`. The opposite is also true for `$on` / `$emit`.

**When to use `$emit` and `$on` (within the same scope)?**

* when you want to **separate logic from the direct application**
* reuse event listening logic in different parts of the scope
* avoid method name conflicts within the scope
* combine with `inject` / `provide` to share data and logic between scopes

---

4. `$watch` – watch changes of a specific signal

```html
<div g-scope="MyScope">
  <p>Count: {count}</p>
  <button @click="count++">Increase</button>
</div>

<script>
  Gyos.scope('MyScope', {
    count: 0,
    onMount() {
      this.$watch('count', (newValue, oldValue) => {
        console.log(`count changed from ${oldValue} to ${newValue}`);
      });
    },
    onUpdate() {
      console.log('Scope updated');
    }
  });
</script>
```

**In which:**
* `$watch('count', callback)` watches changes of `count`
* when `count` changes, `callback` is called with the new and old values of `count`.
* unlike `$watch`, `onUpdate()` is called whenever any signal in the scope changes.
* if you only care about a specific signal, `$watch` is a better choice.

`$watch` is very useful when you need to perform side-effects or complex logic when a specific signal changes, without wanting to write that logic directly in computed or effect.

>Note: `$watch` does not track arrays. If you need to watch changes in an array (such as adding or removing elements), use `$effect` instead of `$watch`.

**See the following case:**

```html
<div g-scope="MScope">
  <p>Items[0].count: {items[0].count}</p>
  <button @click="items[0].count++">Increase count item 0</button>
  <p>Count: {count}</p>
  <button @click="count++">Increase count</button>
  <input type="text" class="input" g-model.debounce="user.name">
</div>

<script>
  Gyos.scope('MScope', {
    count: 0,
    items: [{id: 1, count: 0}],
    user: { name: 'John Doe' },
    effectArray () {
      console.log(`items[0].count is now: ${this.items[0].count}`);
    },
    watchCount (newValue, oldValue) {
      console.log(`count changed from ${oldValue} to ${newValue}`);
    },
    watchUserName (newValue, oldValue) {
      console.log(`user.name changed from ${oldValue} to ${newValue}`);
    },
    onMount() {
      this.$effect(this.effectArray);
      this.$watch('count', this.watchCount);
      this.$watch('user.name', this.watchUserName); // nested property
    },
    onUpdate() {
      console.log('Scope updated'); // always runs when any signal changes
    }
  });
</script>
```

**In which:**
* `$watch('count', ...)` watches `count` normally
* `$watch('user.name', ...)` watches `user.name` normally
* `$effect(() => { ... })` watches `items[0].count` inside effect

When you click to increase `items[0].count`, you cannot use `$watch('items[0].count', ...)` because GyosJS doesn't support watching arrays with `$watch`. Instead, you use `$effect` to watch inside the effect.

---

5. `$effect` – create manual effects for side-effects

Allows you to write custom side-effects that will automatically re-run when the signals inside them change. In the section above, we saw `$effect` being used to watch `items[0].count`.

**Example:**

```html
<div g-scope="MyScope">
  <p>Count: {count}</p>
  <button @click="count++">Increase</button>
</div>

<script>
  Gyos.scope('MyScope', {
    count: 0,
    logCount() {
      console.log(`Count is now: ${this.count}`);
    },
    onMount() {
      this.$effect(this.logCount);
    }
  });
</script>
```

**In which:**
* `$effect(this.logCount)` creates an effect from the `logCount` method
* when `count` changes, `logCount` will automatically re-run and log the new value of `count`

`$effect` is very useful when you need to perform complex side-effects or when you want to watch signals that cannot be watched with `$watch`, such as elements in an array.

**Some other examples with `Gyos.effect`:**

```js
// create signals count, doubleCount
const count = Gyos.signal(0);
const doubleCount = Gyos.signal(0);

// when count changes, doubleCount automatically updates
const dispose = Gyos.effect(() => {
  doubleCount.value = count() * 2;
});

count.value = 5; // change count
console.log(doubleCount()); // logs 10

// when no longer needed, dispose effect to avoid memory leaks
dispose(); // dispose effect

const firstName = Gyos.signal('John');
const lastName = Gyos.signal('Doe');

Gyos.effect(() => {
  console.log(`Name: ${firstName()} ${lastName()}`);
});

// Batch multiple updates → only trigger once:
Gyos.batch(() => {
  firstName('Alice');
  lastName('Johnson');
});
// Logs "Name: Alice Johnson" (only once!)
```

**In which:**
* `Gyos.effect(() => { ... })` creates a manual effect
* when any signal inside the effect changes, the effect will re-run
* `dispose()` disposes the effect when no longer needed to avoid memory leaks
* `Gyos.batch(() => { ... })` allows batching multiple signal changes to only trigger the effect once
* you can get / set signals by calling them as functions: `count()` to get, `count(5)` to set

---

`$inject` / `$provide` – share data between scopes

6. `$provide` allows you to provide values from the current scope to child scopes. <br>
7. `$inject` allows you to inject values provided by parent scopes or global scope.

Allows you to share data or logic between parent and child scopes without manually passing props. 

**Example:**

```html
<div g-scope="Scope" g-provide='{"theme": "g-dark-in-scope"}'>
  <p>Scope theme: {themeInScope}</p>
  <p>Global theme in scope: {globalTheme}</p>

  <!-- Nested scope -->
  <div g-scope="{ theme: Gyos.inject('themeGlobal') }">
    <p>Global theme: {theme}</p>
    <p>Parent theme: {$inject('theme')}</p>
  </div>
</div>

<script>
  Gyos.provide('themeGlobal', 'g-dark-in-global');

  Gyos.scope('Scope', {
    themeInScope: 'g-light',
    globalTheme: Gyos.inject('themeGlobal'),
    onMount() {
      this.themeInScope = this.$inject('theme');
    }
  });
</script>
```

**In which:**
* `g-provide='{"theme": "g-dark-in-scope"}'` provides the value `theme` to child scopes
* `Gyos.provide('themeGlobal', 'g-dark-in-global')` provides the global value `themeGlobal`
* `this.$inject('...')` resolves the element injector chain, while `Gyos.inject('...')` reads only globally provided values

`$inject` / `$provide` are very useful when you need to share data or logic between scopes without manually passing props, especially in large applications with many nested scopes.

---

**Summary of Contexts:**

* `$refs` to reference DOM elements
* `$emit` / `$on` to emit and listen to custom events within the scope
* `$watch` to watch changes of specific signals
* `$effect` to create manual effects for side-effects
* `$inject` / `$provide` to share data between scopes

Using these contexts helps you leverage the full power of `g-scope` in GyosJS, creating interactive, maintainable, and scalable web applications.

---

#### Design Philosophy of `g-scope`

`g-scope` is designed to be:

* simple
* close to native HTML
* not enforcing a component architecture
* suitable for MPAs and server-rendered pages

Supporting flexible scope declaration methods (inline object, `Gyos.scope()`, directives) makes it easy for you to choose the appropriate approach for each specific case.

> GyosJS does not aim to replace SPA frameworks. `g-scope` does one thing: **when state changes, the DOM updates accordingly**.

---

#### Summary

* `g-scope` is the foundation of GyosJS
* each scope is an independent reactive context
* scopes help make code clear, manageable, and less buggy
* declare inline objects for small logic
* declare `Gyos.scope()` for larger logic
* declare `gm-` / `gd-` for very concise logic
* contexts like `$refs`, `$emit`, `$watch`, `$effect`, `$inject` to interact with the GyosJS runtime

At this point, you have a solid understanding of the `g-scope` concept in GyosJS. <br> 
You can fully build interactive, maintainable, and scalable web applications using only `g-scope` and the accompanying contexts.

---

### What's next?

You're almost on your way to mastering GyosJS! Continue learning about **Reactivity & Signals** in GyosJS to understand how GyosJS tracks and updates the DOM when data changes.

**Next:**

* [Reactivity & Signals](./reactivity-signals.md) to understand how GyosJS tracks and updates the DOM when data changes.
* [Template Syntax](./template-syntax.md) to master the template syntax in GyosJS: binding, directives, and expressions.

Happy learning with GyosJS!
