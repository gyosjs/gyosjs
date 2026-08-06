# Examples with GyosJS

To help you get familiar with GyosJS, we'll go through some basic examples. Each example will focus on a specific aspect of the framework, from simple state management to building more complex applications.

**Now let's start with the first example!**

---

### Building a simple counter

This first example helps you get acquainted with how GyosJS handles **state**, **binding**, and basic **reactivity**.

We'll build a simple counter that can:

* increment / decrement the value
* reset to 0
* automatically display dependent values (`double`, `is even`)

```html
<div gd-count="0" class="card">
    <div class="card-header">Simple Counter Example</div>
    <div class="card-body">
        <p>Count: {count}</p>
        <p>Double: {count * 2}</p>
        <p>Is Even: {count % 2 === 0}</p>

        <button class="btn btn-primary" @click="count--">-1</button>
        <button class="btn btn-info" @click="count = 0">Reset</button>
        <button class="btn btn-primary" @click="count++">+1</button>
    </div>
</div>
```

See the example below:

```html
<div gd-count="0">
    <h1>Count: {count}</h1>
    <p>Double: {count * 2}</p>
    <p>Is Even: {count % 2 === 0}</p>

    <button @click="count--">-1</button>
    <button @click="count = 0">Reset</button>
    <button @click="count++">+1</button>
</div>
```

Explanation by parts:

1. Initialize state

```html
<div gd-count="0">
```

This line creates a **scope** with the variable `count`, initially set to `0`.

GyosJS automatically:

* tracks changes to `count`
* updates the DOM when `count` changes

No `useState`, no lifecycle, no complex setup needed.

---

2. Bind data to the DOM

```html
<h1>Count: {count}</h1>
<p>Double: {count * 2}</p>
<p>Is Even: {count % 2 === 0}</p>
```

Expressions inside `{}` are **plain JavaScript**.

When `count` changes:

* all expressions depending on `count` will re-render
* GyosJS only updates the necessary DOM parts

---

3. Handle events

```html
<button @click="count--">-1</button>
<button @click="count = 0">Reset</button>
<button @click="count++">+1</button>
```

* `@click` is shorthand for an event listener
* the code runs in the context of the current scope
* you can manipulate state directly

No need to bind `this`, no function wrapper required.

---

**Things to remember**

* GyosJS doesn’t force a special JavaScript pattern
* You manipulate state like normal JavaScript
* Reactivity happens **naturally**, not something you manually manage

This example is the foundation for all subsequent demos. <br>
Now that you understand the basics of how GyosJS works, we’ll go deeper into other features.

---

### Creating a To-Do List

This example illustrates how GyosJS handles:

* state (the list of tasks)
* data binding with `g-model`
* form event handling
* dynamic list rendering with `*for`
* automatic UI updates when state changes

The to-do list is a classic example to understand GyosJS in practice because it combines multiple core features at once.

---

```html
<div g-scope="TodoApp" class="card" g-no-boost>
    <div class="card-header">To-Do List Example</div>
    <div class="card-body">
        <form @submit.prevent="addTodo">
            <input class="input" g-model="newTodo" placeholder="Add todo" />
        </form>

        <ul class="mt-4 !mb-0">
            <li *for="todo in todos" g-key="todo.id" g-transition="fade" class="flex-x-center justify-between gap-2">
                <label>
                    <input class="checkbox" type="checkbox" g-model="todo.done" />
                    <span :class="{ 'line-through': todo.done, 'text-slate-500': todo.done }">
                        {todo.text | capitalize}
                    </span>
                </label>
                <button @click="removeTodo(todo.id)" class="btn btn-white outline small"> ❌ </button>
            </li>
        </ul>
    </div>

    <script>
        Gyos.scope('TodoApp', {
            todos: [],

            addTodo() {
                if (!this.newTodo) return;

                this.todos.push({
                    id: +new Date(),
                    text: this.newTodo,
                    done: false
                });

                this.newTodo = '';
            },

            removeTodo(id) {
                this.todos = this.todos.filter(todo => todo.id !== id);
            }
        });
    </script>
</div>
```

Complete code for the To-Do List app:

```html
<div g-scope="TodoApp">
    <form @submit.prevent="addTodo">
        <input g-model="newTodo" placeholder="Add todo" />
    </form>

    <ul>
        <li *for="todo in todos" g-key="todo.id" g-transition="fade">
            <label>
                <input type="checkbox" g-model="todo.done" />
                <span :class="{ 'line-through': todo.done }">
                    {todo.text | capitalize}
                </span>
            </label>
        </li>
    </ul>

    <script>
        Gyos.scope('TodoApp', {
            todos: [],

            addTodo() {
                if (!this.newTodo) return;

                this.todos.push({
                    id: +new Date(),
                    text: this.newTodo,
                    done: false
                });

                this.newTodo = '';
            }
        });
    </script>
</div>
```

Quick explanation

1. Element scope `g-scope="TodoApp"`

* Declare a scope named `TodoApp`
* The logic and state of this scope are defined via `Gyos.scope()`
* Scopes isolate data and avoid conflicts with other parts of the page

---

2. Bind the input with `<input g-model="newTodo" />`

* `g-model` directly links the input to the variable `newTodo` (if it doesn’t exist, GyosJS will create it)
* When the user types, `newTodo` is automatically updated
* When `newTodo` changes in code, the input updates accordingly

---

3. Handle form submission `<form @submit.prevent="addTodo">`

* `@submit` listens for the form’s submit event
* `.prevent` prevents page reload (like `event.preventDefault()`)
* On submit, the `addTodo()` function is called within the scope

---

4. Render the list with `*for`

```html
<li *for="todo in todos" g-key="todo.id" g-transition="fade">
```

* `*for` renders a list from the `todos` array
* Each array item corresponds to an `<li>`
* `g-key` helps GyosJS track elements accurately when adding/removing/updating
* `g-transition="fade"` adds smooth transition effects when elements appear or disappear

---

5. Bind the checkbox and dynamic class

```html
<input type="checkbox" g-model="todo.done" />
<span :class="{ 'line-through': todo.done }">
```

* The checkbox is bound to `todo.done`
* When the checkbox is ticked: `todo.done` changes and the `line-through` class is automatically added/removed
* The UI updates without manual DOM code

---

6. Logic inside `Gyos.scope`

```js
Gyos.scope('TodoApp', {
    todos: [],

    addTodo() {
        if (!this.newTodo) return;

        this.todos.push({
            id: +new Date(),
            text: this.newTodo,
            done: false
        });

        this.newTodo = '';
    }
});
```

* `todos`: the array containing the list of tasks
* `addTodo()`: checks for empty input, adds a new todo to the array, resets the input

When `todos` changes, GyosJS automatically updates the corresponding DOM.

---

That’s it! You’ve successfully built a simple To-Do List app with GyosJS. Next, we’ll explore more advanced features in the following examples.

---

### Making modals with GyosJS

In this example, we’ll build a **simple modal** using GyosJS, combined with:

* `*if` to show/hide the modal
* `g-portal` to render the modal outside the current DOM
* `@click.outside` to close the modal when clicking outside
* `g-transition` to add smooth effects

This pattern is very common in real-world web apps.

---

**Main idea**

Instead of rendering the modal exactly where it’s declared in HTML, we will:

* Declare the modal **inside the scope**
* But **teleport (portal)** its content to another DOM node (e.g., `#modal-root`)
* This keeps the modal independent from parent layout, always on top, and easy to control z-index

---

```html
<div class="card">
    <div class="card-header">Modal with Portal Example</div>
    <div class="card-body" g-scope="{ showModal: false,closeModal() {this.showModal = false;} }">
        <p>Click button to open modal</p>
        <button class="btn btn-outline" @click="showModal = true">Open Modal</button>
        <div *if="showModal" class="modal-overlay" g-portal="#modal-root">
            <div class="card card-body" g-transition.150="scale" @click.outside="closeModal">
                <p>Teleported Modal</p>
                <p>This content is rendered in <code>#modal-root</code>, not inside the current section.</p>
                <button class="btn btn-outline" @click="closeModal">Close</button>
            </div>
        </div>
</div>
</div>
<style>
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}
</style>
<div id="modal-root"></div>
```

**HTML & Scope**

```html
<div g-scope="{
    showModal: false,
    closeModal() {
        this.showModal = false;
    }
}">
    <p>Click button to open modal</p>

    <button @click="showModal = true">
        Open Modal
    </button>

    <!-- Modal content -->
    <div
        *if="showModal"
        class="modal-overlay"
        g-portal="#modal-root"
    >
        <div
            class="modal-content"
            g-transition.150="scale"
            @click.outside="closeModal"
        >
            <h3>Teleported Modal</h3>
            <p>
                This content is rendered in <code>#modal-root</code>,
                not inside the current section.
            </p>

            <button @click="closeModal">
                Close
            </button>
        </div>
    </div>
</div>

<!-- Portal target -->
<div id="modal-root"></div>
```

---

**Basic CSS for the modal**

```css
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-content {
    background: #fff;
    color: #333;
    border-radius: 9px;
    padding: 12px 28px;
    max-width: 500px;
    border: 1px solid #e0e0e0;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
```

---

**Detailed explanation**

1. Property `showModal`

A reactive variable controlling the modal’s visibility.

- When `showModal = true`, the modal is rendered.

- When `false`, the modal is removed from the DOM.

---

2. Directive `*if="showModal"`

The `*if` directive renders or removes the entire modal from the DOM.

This is important because it:

* avoids unnecessary event listeners
* prevents logic issues when the modal is not visible but still present

---

3. Attribute `g-portal="#modal-root"`

`g-portal` allows rendering the modal content to another position in the DOM.

In this example, the modal is rendered into:

```html
<div id="modal-root"></div>
```

This helps the modal to:

* not depend on parent layout
* easily become a fullscreen overlay
* work reliably with MPA boost

---

4. Outside click event: `@click.outside`

This directive automatically detects clicks outside the element: `@click.outside="closeModal"`

Clicking outside `.modal-content` will close the modal (calls `closeModal`).

---

4. Transition effects: `g-transition.150="scale"`

Adds a transition effect when the modal appears.

* `scale`: zoom in/out effect
* `150`: transition duration (ms)

GyosJS will:

* delay showing/removing DOM
* wait for the transition to finish before continuing

---

**When to use this pattern?**

The modal + portal pattern fits well for:

* confirmation modals
* popup forms
* notification dialogs
* fullscreen overlays

And is especially suitable when:

* the website uses **MPA boost**
* there are multiple different layouts
* you don’t want the modal affected by current DOM structure

With GyosJS, you can build modals using just HTML + directives; they are smooth and easy to control.

---

### Direct search in a list

In this demo, we’ll build a **direct search** feature in a list using GyosJS reactivity.
When the user types in the input, the list **automatically filters** based on the entered value — no form submit, no page reload.

This is a very common real-world case:

* search users
* search products
* filter small data tables
    and GyosJS handles it neatly.

---

**Main idea**

* The data list (`students`) is stored in the `g-scope`
* The input uses `g-model` to bind the search value
* A `filteredStudent` function **filters the list by the input value**
* The template automatically re-renders when data changes

---

```html
<div class="card " g-scope="SearchApp">
<div class="card-header">Direct Search Example</div>
<div class="card-body">
<input class="input" type="text" g-model.debounce="search" placeholder="Search by name or age"/>

<ul class="mt-4 !mb-0">
    <li *for="student in filteredStudent" g-key="student.name" g-transition="fade">
        Name: <b>{ student.name }</b>, Age: <b>{ student.age }</b>
    </li>
</ul>
</div>
</div>
<script>
Gyos.scope('SearchApp', {
    students: [
        { name: 'Alice', age: 20 },
        { name: 'Bob', age: 22 },
        { name: 'Charlie', age: 23 }
    ],
    filteredStudent() {
        return this.students.filter(student =>  
            student.name.toLowerCase().includes(this.search.toLowerCase()) 
            || student.age.toString() === this.search
        );
    }
});
</script>
```

**Example code**

```html
<div g-scope="{
    students: [
        { name: 'Alice', age: 20 },
        { name: 'Bob', age: 22 },
        { name: 'Charlie', age: 23 }
    ],
    filteredStudent() {
        return this.students.filter(student =>  
            student.name.toLowerCase().includes(this.search.toLowerCase()) 
            || student.age.toString() === this.search
        );
    }
}">
    <input
        type="text"
        g-model.debounce="search"
        placeholder="Search by name or age"
    />

    <ul>
        <li
            *for="student in filteredStudent"
            g-key="student.name"
            g-transition="fade"
        >
            Name: { student.name }, Age: { student.age }
        </li>
    </ul>
</div>
```

---

**Quick explanation**

1. Use the `g-model.debounce` directive

```html
<input g-model.debounce="search" />
```

* `search` is a reactive variable
* `.debounce` helps **reduce re-render frequency**
* Avoids rapid filter + transition when users type continuously

If you need finer control, use: `g-model.debounce.200`

---

2. The `filteredStudent` function

```js
filteredStudent() {
    return this.students.filter(student =>  
        student.name.toLowerCase().includes(this.search.toLowerCase()) 
        || student.age.toString() === this.search
    );
}
```

* This function **re-runs automatically** when `search` or `students` changes
* GyosJS tracks dependencies and updates the view accordingly

> Tip: You can also define `filteredStudent` as a getter `get filteredStudent()`<br>
and when used in `*for` you can omit the `()`

---

3. The `*for` loop + `g-key`

```html
<li *for="student in filteredStudent" g-key="student.name">
```

* `*for` renders the list
* `g-key` helps GyosJS track each element, optimize DOM updates, and support precise animations

---

4. The `g-transition` directive

* Adds effects when elements appear/disappear
* With dynamic lists, **combine with debounce** to avoid overlapping effects

---

This pattern fits well for:

* small to medium lists
* client-side search
* quick filters without API calls
* highly interactive UIs

If the list is large or data comes from the server, you can combine this pattern with:

* fetch API
* longer debounce
* or navigation + MPA boost

---

### Getting acquainted with navigation and MPA boost

One of GyosJS’s primary goals is to **enhance navigation for MPA websites**, making page transitions smoother and faster — without **turning the app into a SPA**.

> GyosJS calls this approach **MPA Boost**.

Instead of letting the browser reload the entire page on every link click, GyosJS will:

* intercept default navigation behavior
* fetch the HTML of the next page
* safely compare and update the `<head>`
* replace the main page content (outlet)
* retain DOM state, scroll, and events if needed
* optionally re-run scripts outside `g-outlet` when needed

All happens with **plain HTML**, no build step, no virtual DOM.

```html
<div class="card flex-xy-center">
<div class="text-center">
<a class="btn btn-outline mb-4" href="/mpa-boost/home.html" target="_blank">Click to try MPA Boost Example</a>
<ul class="!mb-0">
<li>Click links to see SPA-like transitions</li>
<li>Clock app by GyosJS + g-persist to keep state on navigation</li>
</ul>
</div>
</div>
```

> Follow along with the code snippets below to build your own MPA Boost setup.

---

#### Enable MPA Boost

To enable MPA Boost, simply add the `g-boost` directive to the `<body>` tag:

```html
<body g-boost>
```

Links (`<a>`) on the page will be handled by GyosJS automatically.

`<form>` elements are also supported similarly (AJAX submit, outlet updates).

---

#### Define the content area to replace

Next, specify the **main content area** to be replaced during navigation.
Use the `g-outlet` directive:

```html
<div id="app" g-outlet>
    <!-- The content will change when you navigate. -->
</div>
```

GyosJS keeps parts outside `g-outlet` intact (header, sidebar, footer, already-loaded scripts…), and only replaces the content inside the outlet.

* You can control whether scripts outside `g-outlet` re-run or not
* Elements in `<head>` are always compared and updated safely

---

#### Example Home page structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Home Page</title>
    <script src="https://cdn.gyosjs.dev/gyosjs.auto.min.js"></script>
    <meta name="description" content="Home Page description">
    <link rel="stylesheet" href="styles.css">
    <style id="theme-colors">
        :root { --primary: #0ea5e9; }
    </style>
</head>
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <nav>
            <a href="/home.html" class="active">Home</a>
            <a href="/contact.html">Contact</a>
            <a href="/about-us.html" g-noscroll>About Us</a>
        </nav>

        <main id="main-content">
            <h1>Welcome to GyosJS MPA</h1>
            <p>Click links above for SPA-like navigation!</p>
            <p>This is the home page.</p>
        </main>
    </div>
</body>
</html>
```

---

#### Contact and About pages

Other pages (`contact.html`, `about-us.html`) **keep the same layout structure as home.html** <br>
They only differ in the content within `<main>`.

```html
<!-- contact.html -->
<head>
    <!-- Change description -->
    <meta name="description" content="Contact Page description">
</head>

<main id="main-content">
    <h1>Welcome to GyosJS MPA</h1>
    <p>Click links above for SPA-like navigation!</p>
    <p>
        This is the contact page. Reach us at contact@example.com.
    </p>
</main>
```

---

```html
<!-- about-us.html -->
<head>
    <!-- Change description -->
    <meta name="description" content="About Us Page description">
</head>

<main id="main-content">
    <h1>Welcome to GyosJS MPA</h1>
    <p>Click links above for SPA-like navigation!</p>
    <p>
        This is the about us page. Learn more about our company and team.
    </p>
</main>
```

When clicking a link:

* the description in `<head>` is updated
* the content inside `<main id="main-content">` is replaced
* no full page reload
* DOM state outside the outlet is preserved
* transitions feel fast and smooth like a SPA

---

#### Preserve state when going back with g-snapshot

The `g-snapshot` directive lets GyosJS **save the outlet state**:

```html
<div g-outlet g-snapshot>
```

When you navigate back:

* the DOM is restored
* inputs, scroll, and state persist
* no need to refetch content

This mechanism is super useful for dashboards, admin panels, and documentation sites.

---

#### Control scroll behavior with g-noscroll

By default, when navigating to a new page, GyosJS scrolls to the top.

If you want to **preserve the current scroll position**, add `g-noscroll` to the link:

```html
<a href="/about-us.html" g-noscroll>About Us</a>
```

Suitable for:

* sidebar navigation
* fixed layouts
* pages with long content

---

#### G-Persist for state persistence

To keep state (e.g., form inputs, counters, audio, video..) across navigations, use the `g-persist` directive:

**Follow along with the Clock example below:**
```html
<!-- Add the following code to the end of the main tag in the examples above. -->
<main id="main-content">

    <!-- ... -->

    <div g-scope="ClockApp" g-persist="timer-app">
        <p>Current Time: <span g-ref="timer">[TIMER]</span></p>
    </div>

    <script>
        Gyos.scope('ClockApp', {
            intervalId: null,
            startTimer() {
                const now = new Date();
                this.$refs.timer.innerText = `${
                    String(now.getHours()).padStart(2, '0')
                }:${
                    String(now.getMinutes()).padStart(2, '0')
                }:${
                    String(now.getSeconds()).padStart(2, '0')
                }`;
            },
            onMount() {
                console.log('ClockApp mounted');
                this.intervalId = setInterval(this.startTimer, 1000);
            },
            onUnmount() {
                console.log('ClockApp unmounted');
                clearInterval(this.intervalId);
            },
        });
  </script>
</main>
```

**In this example:**
* the clock displays the current time, updating every second
* using `g-ref="timer"` and `this.$refs.timer` to directly update the timer display
* `g-persist="timer-app"` ensures the clock state persists across navigations
* `onMount` and `onUnmount` lifecycle hooks manage the timer setup and cleanup
* scope `ClockApp` only initializes once, even when navigating between pages

This is small demo of how GyosJS can maintain state seamlessly in an MPA environment.<br>
With `g-persist`, users can navigate without losing their app state.

---

#### MPA Boost is not SPA

Important points:

* GyosJS **does not turn your app into a SPA**
* Each page is still independent HTML
* SEO, meta tags, links, reload all work normally
* JavaScript only “boosts” the experience

If JavaScript is disabled:

* the website still works like a traditional MPA

---

#### When should you use MPA Boost?

MPA Boost works best when:

* pages share a common layout
* header, sidebar, and navigation are stable
* scripts are loaded once and reused
* the website focuses on content, dashboards, admin, docs

For completely different layouts, you can:

* split into separate projects
* or disable boost in certain areas — use `g-no-boost` when switching between two layouts

Even with different layouts, if handled properly, MPA Boost can still deliver a great experience. The [GyosJS docs](https://gyosjs.dev) are a real-world example.

---

#### Summary

GyosJS’s MPA Boost helps you:

* keep the familiar MPA architecture
* get SPA-like smooth transitions
* avoid build steps
* avoid heavy frameworks
* precisely control what gets changed

This is the foundation for GyosJS to work effectively on real-world websites.

To dive deeper into MPA Boost, layouts, scripts, and lifecycle in GyosJS, see 
[MPA Boost Deep Dive](./mpa-boost-deep-dive.md), 
[Layouts, scripts, and lifecycle](./layouts-scripts-lifecycle.md), and [Best practices with GyosJS](./best-practices.md).

---

### What’s next?

Now that you’re familiar with the basics and some practical examples in GyosJS, keep exploring:

* [Detailed tutorial guide](./tutorial-guide.md)
* [Complete API reference](./api-reference.md)
* [Best practices for using GyosJS](./best-practices.md)

Wishing you an awesome journey with GyosJS!
