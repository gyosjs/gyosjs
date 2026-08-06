# Reactivity & Signals in GyosJS

We've already learned about [What is G-Scope?](./what-is-gscope.md) – one of the three core concepts of GyosJS. In this section, we'll delve into **reactivity** and **signals** – how GyosJS monitors and updates the DOM when data changes.

Then comes the final core part: **Template Syntax** – template syntax in GyosJS, including binding, directives, and expressions.

After reading this section, you'll have a better understanding of:
* How Reactivity works in GyosJS
* What Signals are and how they monitor data
* Effects – when they run and update the DOM
* Computed values ​​in GyosJS
* Reactive objects and arrays

Now, what are we waiting for? Let's get started! Let's gooo!

---

### Reactivity & Signals

GyosJS is built around **reactivity** – the ability to automatically update the interface when data changes.

However, GyosJS **does not use Virtual DOM**, nor does it **diff trees**, but relies on a simpler model: **Signals + Effects**.

The goal of GyosJS is:

> Reactivity that is just enough, easy to understand, easy to debug, and suitable for MPA.

---

#### What is Reactivity in GyosJS?

In GyosJS, **reactivity** means:

* When data changes
* The parts of the HTML that *depend on that data*
* will **automatically update**, without manual coding

For example:

```html
<div g-scope="{ count: 0 }">
    <p>Count: {count}</p>
    <button @click="count++">Increment</button>
</div>
```

When `count` changes:

* `{count}` in the DOM updates immediately
* no need to call `render()`
* no need for setState
* no complex lifecycle needed

---

#### What is a Signal?

In GyosJS, **each reactive field inside `g-scope` is essentially a signal**.

Simply put:
* Signal = a variable that can:
    * **track who is using it**
    * **notify when it changes**

For example:

```js
{
    count: 0
}
```

`count` here:

* is not a normal JS variable
* but a **reactive signal**
* GyosJS will track:
  * which node is using `{count}`
  * which expression depends on `count`

Signal is the foundation of reactivity in GyosJS, helping GyosJS know when to update the DOM.

---

#### Expressions automatically track signals

GyosJS **automatically detects dependencies**, so you don't need to declare them manually.

```html
<p>Double: {count * 2}</p>
<p>Is even: {count % 2 === 0}</p>
```

In which:

* `{count * 2}` depends on `count`
* `{count % 2 === 0}` also depends on `count`
* both expressions can be seen as computed values that automatically track `count`

When `count` changes:

* both expressions are re-run
* DOM updates exactly where needed

This way, the code is much shorter and easier to understand compared to manually declaring dependencies, computed values, or watchers.

---

#### Effect – when does it run?

Each expression, directive, or binding in the DOM
is considered **an effect** by GyosJS.

Effect will:

* run the first time when the scope is mounted
* re-run **only when the signals it depends on change**

For example:

```html
<input g-model="name" />
<p>Hello {name}</p>
```

In which:
* `{name}` is an effect that depends on the signal `name`
* `g-model="name"` is also an effect that depends on `name`
* When `name` changes → both update

The signal + effect model is simple but very powerful.

> This example illustrates a low-level API, not the common usage in templates

```javascript
const count = Gyos.signal(0);
const double = Gyos.effect(() => {
    console.log('Double is', count() * 2);
});
count(1); // Console: Double is 2
count(2); // Console: Double is 4

double(); // Dispose effect to stop tracking
```

In which:
* `count` is a signal that can be read/written
* `double` is an effect that depends on `count`
* each time `count` changes → `double` re-runs (logs the new value)

> Effect will re-run **only when the signals it depends on change**. This helps optimize performance and avoid unnecessary re-renders.

---

#### Computed value in GyosJS

GyosJS allows using **functions or getters** as computed values.

For example:

```html
<div g-scope="{
    count: 0,
    double() {
        return this.count * 2;
    }
}">
    <p>Count: {count}</p>
    <p>Double: {double}</p>
</div>
```

In which:

* `double` automatically depends on `count`
* when `count` changes → `double` is recalculated

You can also write it as a getter:

```js
get double() {
    return this.count * 2;
}
```

When using computed values:
* avoid storing redundant data
* help keep logic clear and maintainable
* automatically track dependencies

Another example:

```javascript
const firstName = Gyos.signal('Alice');
const lastName = Gyos.signal('Smith');
const fullName = Gyos.computed(() => {
    console.log('Calculating fullName');
    return `${firstName()} ${lastName()}`;
});

console.log(fullName()); 
// Log: "Calculating fullName"
// Log: "Alice Smith"

firstName('Bob'); // Update firstName
// Log: "Calculating fullName"

console.log(fullName());
// Log: "Bob Smith" not "Calculating fullName" again

// batch update
Gyos.batch(() => {
    firstName('Charlie');
    lastName('Brown');
});
console.log(fullName()); // "Charlie Brown"
```

In which:
* `firstName` and `lastName` are signals that can be read/written
* `fullName` is a computed value that depends on both
* when `firstName` or `lastName` changes → `fullName` automatically updates
* in a batch update, `fullName` is only recalculated once after all signals have been updated
* without using batch, `fullName` would be recalculated twice when `firstName` and `lastName` change separately (the log "Calculating fullName" appears twice)

> Computed values are very useful for separating calculation logic from raw data, helping keep code clean and maintainable.

---

#### Reactive object & array

Objects and arrays in GyosJS are also reactive. Nested deep inside are also signals.

<div g-scope="{user: { name: 'Alice', age: 20 }}" class="card">
    <div class="card-header">Demo Reactive Object</div>
    <div class="card-body">
        <p>Your name: {(user.name || 'no name') | capitalize} - Age: {user.age}</p>
        <input class="input" g-model="user.name" placeholder="Enter name" />
    </div>
</div>

When `user.name` changes → the signal tracking it triggers the effect to update the DOM.

Example code:

```html
<div g-scope="{
    user: { name: 'Alice', age: 20 }
}">
    <p>Your name: {(user.name || 'no name') | capitalize}
        - Age: {user.age}</p>
    <input g-model="user.name" placeholder="Enter name" />
</div>
```

**In which**:
* `user` is a reactive object
* `user.name` and `user.age` are signals inside the object
* `user.name` is tracked by `g-model` and the expression in `<p>`
* when `user.name` changes via input → the DOM automatically updates

---

With arrays, it's similar; array-modifying methods like `push`, `splice`, `pop` are also tracked.

<div class="card">
<div class="card-header">Demo Reactive Array</div>
<div class="card-body">
<div g-scope="{items: ['Apple', 'Banana'],
    addOrange() {
        if (this.items.includes('Orange')) {
            alert('Orange already exists');
            return;
        }
        this.items.push('Orange');
    }}">
<ul>
    <li g-key="item" *for="item in items">{item}</li>
</ul>
<p *if="items.length === 0">No items available.</p>
<button class="btn btn-primary" @click="addOrange">Add Orange</button>
<button class="btn btn-info" @click="items = ['Apple', 'Banana']">Reset Items</button>
<button class="btn btn-danger" @click="items = []">Clear Items</button>
</div>
</div>
</div>

**Example code:**

```html
<div g-scope="{
    items: ['Apple', 'Banana'],
    addOrange() {
        if (this.items.includes('Orange')) {
            alert('Orange already exists');
            return;
        }
        this.items.push('Orange');
    }
}">
    <ul>
        <li g-key="item" *for="item in items">{item}</li>
    </ul>
    <p *if="items.length === 0">No items available.</p>

    <button @click="addOrange">Add Orange</button>
    <button @click="items = ['Apple', 'Banana']">Reset Items</button>
    <button @click="items = []">Clear Items</button>
</div>
```

**In which**:
* `items` is a reactive array
* `*for="item in items"` creates an effect tracking `items`
* when `items` changes (add, remove, reassign) → the DOM automatically updates the list

**Demo with deep nested object/array:**

> Note: This example is intended to test the performance, logic, and reactivity of GyosJS with large and deeply nested objects/arrays. Not recommended to code like this in real projects.

```html
<div g-scope="Scope">
  <li>
    {largeArrayObjectNestedDeep[16].nestedKey9.deeper.info}
    <input g-model="largeArrayObjectNestedDeep[16].nestedKey9.deeper.info" />
    {largeObjectNested.key16.nestedKey9}
    <input g-model="largeObjectNested.key16.nestedKey9" />
    {largeArrayNested[16][9]}
    <input g-model="largeArrayNested[16][9]" />
    {largeObject.key9}
    <input g-model="largeObject.key9" />
    {largeArray[9]}
    <input g-model="largeArray[9]" />
  </li>
</div>

<script>
  Gyos.scope('Scope', {
    largeArray: Array.from({ length: 1000 }, (_, i) => 'Item ' + (i + 1)),
    largeArrayNested: Array.from({ length: 100 }, (_, i) => {
      const nested = [];
      for (let j = 0; j < 10; j++) {
        nested.push('Item ' + (i * 10 + j + 1));
      }
      return nested;
    }),
    largeObject: (() => {
      const obj = {};
      for (let i = 0; i < 1000; i++) {
        obj['key' + i] = 'Value ' + (i + 1);
      }
      return obj;
    })(),
    largeObjectNested: (() => {
      const obj = {};
      for (let i = 0; i < 100; i++) {
        const nested = {};
        for (let j = 0; j < 10; j++) {
          nested['nestedKey' + j] = 'Value ' + (i * 10 + j + 1);
        }
        obj['key' + i] = nested;
      }
      return obj;
    })(),
    largeArrayObjectNestedDeep: (() => {
      const arr = [];
      for (let i = 0; i < 100; i++) {
        const obj = {};
        for (let j = 0; j < 10; j++) {
          obj['nestedKey' + j] = {
            value: 'Value ' + (i * 10 + j + 1),
            deeper: {
              info: 'Deeper Info ' + (i * 10 + j + 1)
            }
          };
        }
        arr.push(obj);
      }
      return arr;
    })()
  });
</script>
```

**Demo result:**

<div g-scope="{
    largeArray: Array.from({ length: 1000 }, (_, i) => 'Item ' + (i + 1)),
    largeArrayNested: Array.from({ length: 100 }, (_, i) => {
      const nested = [];
      for (let j = 0; j < 10; j++) {
        nested.push('Item ' + (i * 10 + j + 1));
      }
      return nested;
    }),
    largeObject: (() => {
      const obj = {};
      for (let i = 0; i < 1000; i++) {
        obj['key' + i] = 'Value ' + (i + 1);
      }
      return obj;
    })(),
    largeObjectNested: (() => {
      const obj = {};
      for (let i = 0; i < 100; i++) {
        const nested = {};
        for (let j = 0; j < 10; j++) {
          nested['nestedKey' + j] = 'Value ' + (i * 10 + j + 1);
        }
        obj['key' + i] = nested;
      }
      return obj;
    })(),
    largeArrayObjectNestedDeep: (() => {
      const arr = [];
      for (let i = 0; i < 100; i++) {
        const obj = {};
        for (let j = 0; j < 10; j++) {
          obj['nestedKey' + j] = {
            value: 'Value ' + (i * 10 + j + 1),
            deeper: {
              info: 'Deeper Info ' + (i * 10 + j + 1)
            }
          };
        }
        arr.push(obj);
      }
      return arr;
    })()
  }" class="card card-body">
  <p>
    {largeArrayObjectNestedDeep[16].nestedKey9.deeper.info}
    <input class="input" g-model="largeArrayObjectNestedDeep[16].nestedKey9.deeper.info" /><br>
    {largeObjectNested.key16.nestedKey9}
    <input class="input" g-model="largeObjectNested.key16.nestedKey9" /><br>
    {largeArrayNested[16][9]}
    <input class="input" g-model="largeArrayNested[16][9]" /><br>
    {largeObject.key9}
    <input class="input" g-model="largeObject.key9" /><br>
    {largeArray[9]}
    <input class="input" g-model="largeArray[9]" />
  </p>
</div>

**In which:**
* deep nested objects/arrays are reactive, each field inside is a signal
* when any deep field changes → the DOM automatically updates at the correct place
* no need to re-render the entire object/array
* _this is also a hard test example for GyosJS reactivity performance_

> With the signal-based model, GyosJS can deeply track inside objects and arrays to update the exact necessary place without re-rendering the entire structure.

---

#### Why does GyosJS choose signal-based?

GyosJS chooses the **signal-based reactivity** model because its initial goal when building was to be suitable for **MPA** (Multi-Page Application) and **server-rendered HTML**.

Therefore, GyosJS needs a reactivity system that is:

* No need for Virtual DOM
* No need for diff tree
* No need for complex batching
* Directly updates the necessary DOM nodes

This helps:

* small code
* lightweight runtime
* easy to debug
* very suitable for MPA and server-rendered HTML

> GyosJS focuses on reactivity that is **just enough** for MPA applications, rather than trying to do everything like large SPA frameworks.

---

#### Store reactivity in GyosJS

GyosJS supports creating **global store reactivity** shared across multiple scopes. 

When to use a store?
* When you want to share state between multiple scopes
* When you need a global state storage for the application
* When you want to manage more complex state outside of a scope

**See example of creating store reactivity:**

```html
<div g-scope="{counter: Gyos.store('CounterStore')}">
    <h5>Scope A</h5>
    <p>Count: {counter.count}</p>
    <button @click="counter.decrement()">Decrement</button>
    <button @click="counter.count = 0">Reset</button>
    <button @click="counter.increment()">Increment</button>
</div>
<div g-scope>
    <h5>Scope B</h5>
    <p>Count: {counterStore.count}</p>
    <button @click="counterStore.decrement()">Decrement</button>
    <button @click="counterStore.count = 0">Reset</button>
    <button @click="counterStore.increment()">Increment</button>
</div>

<script g-script-once>
    var counterStore = Gyos.store('CounterStore', {
        count: 0,
        increment() {
            this.count++;
        },
        decrement() {
            this.count--;
        }
    });
</script>
```

**Demo result:**

<div class="card">
<div class="card-header">Demo Store Reactivity</div>
<div class="card-body">
<div g-scope="{counter: Gyos.store('CounterStore')}">
    <div>Scope A</div>
    <ul>
        <p>Count: {counter.count}</p>
        <button class="btn btn-danger" @click="counter.decrement()">Decrement</button>
        <button class="btn btn-info" @click="counter.count = 0">Reset</button>
        <button class="btn btn-primary" @click="counter.increment()">Increment</button>
    </ul>
</div>
<div g-scope>
    <div>Scope B</div>
    <ul>
        <p>Count: {counterStore.count}</p>
        <button class="btn btn-danger" @click="counterStore.decrement()">Decrement</button>
        <button class="btn btn-info" @click="counterStore.count = 0">Reset</button>
        <button class="btn btn-primary" @click="counterStore.increment()">Increment</button>
    </ul>
</div>
</div>
</div>

<script g-script-once>
    var counterStore = Gyos.store('CounterStore', {
        count: 0,
        increment() {
            this.count++;
        },
        decrement() {
            this.count--;
        }
    });
</script>

**In which:**
* both scopes share the same `CounterStore`
* `Gyos.store('StoreName', initialState)` creates a global store reactivity
* `counterStore` is a store with state `count` and methods `increment`, `decrement`
* when `count` changes in scope A → scope B automatically updates and vice versa
* `g-script-once` script runs only once, avoiding duplicate `const counterStore` errors when navigating pages

Store reactivity is very useful for managing global state in GyosJS applications. It helps share data between multiple scopes easily and efficiently.

>Note: It is not recommended to use `const counterStore` and use `counterStore` directly, as it may cause unexpected errors. You should use `Gyos.store('StoreName')` to get the store within a scope.

---

#### Things to note

* Reactivity only works **inside `g-scope`**
* Only fields inside the scope are signals
* Always get the store via `Gyos.store('StoreName')` to avoid errors
* Plain JS variables outside the scope are **not reactive**
* Avoid heavy side-effects in computed / getter

If you want to use reactivity outside of `g-scope`, use the signals/effects API of GyosJS.

* `Gyos.signal(value)` to create a signal
* `Gyos.effect(fn)` to create an effect that tracks signals
* `Gyos.computed(fn)` to create a computed value
* `Gyos.batch(fn)` to batch update multiple signals
* `Gyos.signal.subscribe(fn)` to listen for signal changes

**See the following example:**

```javascript
const count = Gyos.signal(0);
const countEff = Gyos.effect(() => {
    console.log('Count is', count());
});

count(1); // Console: Count is 1
count(2); // Console: Count is 2

const items = Gyos.signal(['Apple', 'Banana']);
const dispose = items.subscribe(() => {
    console.log('Items changed:', items());
});

items(['Apple', 'Banana', 'Orange']);
// Console: Items changed: [ 'Apple', 'Banana', 'Orange' ]

items.value.push('Grapes');
// Does not trigger subscribe because the array reference does not change

dispose(); // Stop listening for changes
```

**In which:**
* `count` is a readable/writable signal
* `countEff` is an effect dependent on `count`
* each time `count` changes → `countEff` re-runs (logs the new value)
* `items` is a signal containing an array
* `dispose` is a function to stop listening for changes to `items`
* when assigning a new value to `items` → triggers subscribe (logs the new value)
* when using `items.value.push()` does not trigger because the array reference does not change

With this API, you can use the basic reactivity of GyosJS when the logic is outside of `g-scope`.

> **Advice**: You should use the expressions, bindings, directives.. available in `Scope` for automatic reactivity, maximizing the features and convenience of the framework.

---

#### When should you use GyosJS reactivity?

GyosJS reactivity is suitable when:

* You need light interactivity on MPA pages
* Form, modal, dropdown, list, filter
* Dashboard MPA
* Admin panel
* Web server-rendered but want the feel of a "SPA"

If you need:
* complex global state
* complex animations
* large SPA applications

Then other SPA frameworks are the choice → GyosJS **does not try to replace** SPA frameworks.

---

#### Summary

Great! You have completed the section on **Reactivity & Signals in GyosJS**. <br>
It's been a pleasure accompanying you on your journey to learn GyosJS!

Now you have learned about:
* How Reactivity works in GyosJS
* What a Signal is and how it tracks data
* Effect – when it runs and updates the DOM
* Computed values in GyosJS
* Reactive objects and arrays
* Global store reactivity in GyosJS

Continue exploring the final part in this series: **Template Syntax in GyosJS** to master the template syntax and how to use directives, bindings, and expressions in GyosJS!

---

### What's next?

You're almost done with the GyosJS series!<br>
Continue with the final part: [Template Syntax in GyosJS](./template-syntax.md) to master the template syntax and how to use directives, bindings, and expressions in GyosJS!

Next:
* [Template Syntax](./template-syntax.md) to understand more about template syntax in GyosJS
* [Tutorial Guide](./tutorial-guide.md) to learn how to build a GyosJS application from start to finish

Today is a great day to learn GyosJS! Let's gooo!
