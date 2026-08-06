# Template Syntax

Hi everyone! Below are some common template syntax examples that you can use in your documents.

This is also the final part of the GyosJS core; after mastering the previous sections, you'll find using template syntax very easy and intuitive.

The goals of this section:
* Understand all the syntax of GyosJS.
* How GyosJS binds data.
* How to use and declare directives.
* How to use expressions in GyosJS.

Okay, now let's get started! Today is a great day to learn something new!

---

### Data Binding Syntax

In GyosJS, you can bind data to HTML and attributes as follows:

```html
<div g-scope="{ 
    message: 'Hello, GyosJS!',
    imageUrl: 'path/to/image.jpg', 
    otherClass: 'highlight',
    isActive: true,
    fontSize: '20px'
}">
    <p :style="'color: red'">{ message }</p>
    <p :style="{ fontSize, color: 'blue' }">This text has dynamic font size.</p>
    <img :src="imageUrl" alt="Image"
        :class="{'active': isActive, otherClass}"/>
    <button :disabled="!isActive">Click Me</button>
</div>
```

**In which:**
* `{ message }` displays the value of the variable `message`.
* `:src="imageUrl"` binds the value of the variable `imageUrl` to the `src` attribute.
* `:class="{'active': isActive, otherClass}"` 
    * adds the class `active` if `isActive` is true.
    * also adds the class `highlight`.
* `:disabled="!isActive"` disables the button if `isActive` is false.
* `:style` can accept a string or an object to apply dynamic styles.

Allowed bindings include:
* `:class` - Dynamic class binding.
* `:style` - Dynamic style binding.
* `:src`, `:href`, `:alt`, `:title`, `:value` - Binding other HTML attributes.
* `:disabled`, `:checked`, `:selected`, `:checked` - Binding boolean attributes.

Accordingly, you can use similar syntax to bind data to HTML attributes when needed. 

> Note: attribute binding must be a string `'...'`, an object `{ ... }`, or an expression that returns the corresponding value.

---

### Directives Syntax

GyosJS directives are divided into 2 main types: Structural Directives and Attribute Directives.

> **Structural Directives**: Change the DOM structure (add, remove, loop).

#### For Directive

`*for` loops through an array to create multiple child elements based on the array data.

**Example:**
```html
<ul g-scope="{ items: ['Item 1', 'Item 2', 'Item 3'] }">
    <li *for="item,i in items" g-key="item">{ item } - Index { i }</li>
</ul>
```

**In which:**
* `item` is the current element in the array.
* `i` is the index of the current element.
* `items` is the array being iterated over.
* `g-key="item"` helps GyosJS track elements when the DOM changes.
* use `$index` to access the current index if the index variable is not declared.

> Tip: you should always use `g-key` when using `*for` to optimize rendering performance.

---

#### If-else Directives

`*if`, `*elseif`, `*else` conditionally display elements based on logical expressions.

**Example:**
```html
<div g-scope="{ isLoggedIn: true, username: 'JohnDoe' }">
    <p *if="isLoggedIn">Welcome back, { username }!</p>
    <p *elseif="!isLoggedIn">Please log in to continue.</p>
    <p *else>Loading...</p>
    <button *if="isLoggedIn" @click="isLoggedIn = false">Logout</button>
    <button *if="!isLoggedIn" @click="isLoggedIn = true">Login</button>
</div>
```

**In which:**
* `*if="isLoggedIn"` displays the element if `isLoggedIn` is true.
* `*elseif="!isLoggedIn"` displays the element if `isLoggedIn` is false.
* `*else` displays the element if all the above conditions are false.
* the elements `*if`, `*elseif`, `*else` can only appear together within a single structural block.

With the `*if` block, you can easily control the display of content based on conditions in your data.

---

####  Switch-Case directives

`*switch`, `*case`, `*default` switch-case structure to display elements based on values.

**Example:**
```html
<div g-scope="{ 
    state: {
        loading: 'loading',
        success: 'success',
        error: 'error',
        unknown: 'unknown'
    },
    status, transition: 'slide-up',
    onMount() { 
        this.status = this.state.loading;
        setTimeout(() => { this.status = this.state.success; }, 500); 
        setTimeout(() => { this.status = this.state.error; }, 1000);
        setTimeout(() => { this.status = this.state.unknown; }, 1500);
    } 
}">
    <div *switch="status">

        <p *case="state.loading">Loading...</p>

        <p *case="state.success" g-transition="transition">
            Data loaded successfully!</p>
        
        <p *case="state.error" g-transition="transition">
            An error occurred while loading data.</p>
        
        <p *default g-transition="transition">Unknown status.</p>
    </div>
</div>
```

**In which:**
* when the scope is mounted, `status` is initialized to `state.loading`.
* `*switch="status"` determines the `status` variable to compare.
* `*case="state.loading"` displays the element if `status` equals `state.loading`.
* `*default` displays the element if no case matches.
* `setTimeout` is used to simulate state changes over time.

Unlike `If-else`, the `Switch-Case` structure helps you manage multiple conditions based on the value of a single variable in a clearer and more concise way.

---

#### Await-then-catch Directives

`*await`, `*pending`, `*then`, `*catch` handle displaying elements based on the state of a Promise.

**Example:**
```html
<div g-scope="AsyncScope">
  <button @click="loadPosts">Load Posts</button>
  <button @click="simulateError">Simulate Error</button>

  <div *await="postsPromise">
    <div *pending class="loading" g-transition="scale">
      <div class="spinner"></div>
      <div>Fetching posts...</div>
    </div>

    <div *then="posts">
      <div *if="posts && posts.length > 0">
        <div *for="post in posts" g-key="post.id" class="post-card" g-transition="slide-down">
          <div class="post-title">{post.title}</div>
          <div class="post-body">{post.body}</div>
          <strong *if="post.title === 'qui est esse'">PREMIUM</strong>
          <strong *else>NORMAL</strong>
        </div>
      </div>
      <div *else class="success">
        No posts available
      </div>
    </div>

    <div *catch="err" class="error" g-transition="scale">
      <div class="error-title">Error occurred</div>
      <div>{err.message}</div>
      <div style="margin-top: 10px; font-size: 0.9rem;">Try clicking "Load Posts" again</div>
    </div>
  </div>
</div>

<script>
  Gyos.scope('AsyncScope', {
    postsPromise: null,

    // Fetch posts with artificial delay
    loadPosts() {
      this.postsPromise = new Promise((resolve) => {
        setTimeout(() => {
          fetch('https://jsonplaceholder.typicode.com/posts')
            .then(res => res.json())
            .then(data => resolve(data.slice(0, 3))); // Only 3 posts
        }, 1500); // 1.5s delay
      });
    },

    // Simulate error
    simulateError() {
      this.postsPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Network timeout - please try again'));
        }, 1000);
      });
    },
  });
</script>
```

**CSS styles for the above example:**
```css
button {
    padding: 8px 16px;
    background: #3f5b94;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8725rem;
    transition: all 0.3s;
    font-weight: bold;
}

button:hover {
    background: #5568d3;
    transform: translateY(-2px);
}

button:active {
    transform: translateY(0);
}

button:disabled {
    background: #ccc;
    cursor: not-allowed;
    transform: none;
}

.loading {
    text-align: center;
    padding: 40px;
    color: #0b1854;
    font-size: 1.2rem;
}

.spinner {
    display: inline-block;
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #0b1854;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 10px;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.error {
    background: #fee;
    border: 2px solid #fcc;
    color: #c33;
    padding: 20px;
    border-radius: 8px;
    margin: 20px 0;
}

.error-title {
    font-weight: bold;
    margin-bottom: 10px;
    font-size: 1.1rem;
}

.post-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 15px;
}

.post-title {
    font-weight: bold;
    color: #333;
    margin-bottom: 10px;
    font-size: 1.1rem;
}

.post-body {
    color: #666;
    line-height: 1.6;
}

.success {
    background: #d4edda;
    border: 2px solid #c3e6cb;
    color: #155724;
    padding: 15px;
    border-radius: 8px;
    margin: 20px 0;
}
```

**In which:**
* scope `AsyncScope` contains a variable `postsPromise` to store the Promise.
* `*await="postsPromise"` tracks the state of the Promise.
* `*pending` displays the element when the Promise is pending.
* `*then="posts"` displays the element when the Promise is resolved with the data `posts`.
* `*catch="err"` displays the element when the Promise is rejected with the error `err`.
* because `setTimeout` is needed to simulate network delay, `new Promise` must be used instead of direct `fetch`.

With the `Await-Then-Catch` structure, you can easily manage different states of a Promise and display appropriate content based on its state.

---

> **Attribute Directives**: Change the appearance or behavior of an element.

#### G-Scope Directive

`g-scope` is very familiar, declaring a data scope for the DOM.

* defines data, methods, and lifecycle hooks for the element and its child elements.
* creates a separate scope, helping to manage the state and logic of the element effectively.

```html
<div g-scope="{ count: 0 }">
    <p>Count: { count }</p>
    <button @click="count++">Increment</button>
</div>
```

Example above creates a scope with a variable `count`, displays the value, and provides a button to increment that value.

---
#### Binding Model

`g-model` two-way binds with input, textarea, select.<br>
* binds the value of form elements with data in the scope.
* automatically updates the data when the user changes the value in the form and vice versa.

**Example:**
```html
<div g-scope>
    <input type="text" g-model="username" placeholder="Enter your name" />
    <textarea g-model="message" placeholder="Enter your message"></textarea>
    <p>Hello, { username }!</p>
    <pre>Your message: { message }</pre>
</div>
```

**In which:**
* `username` and `message` are automatically created in the scope.
* `g-model="username"` binds the value of the input to the variable `username`.
* `g-model="message"` binds the value of the textarea to the variable `message`.
* when entering data into the input or textarea, the variables `username` and `message` are automatically updated.

---
#### Ref Directive

`g-ref` references an element in JavaScript.
* allows you to directly access DOM elements from within the scope.

**Example:**
```html
<div g-scope="{ focusInput() { this.$refs.myInput.focus(); } }">
    <input type="text" g-ref="myInput" placeholder="Focus me!" />
    <button @click="focusInput">Focus Input</button>
    <!-- or -->
    <button @click="$refs.myInput.focus()">Focus Input</button>
</div>
```

**In which:**
* `g-ref="myInput"` sets a reference for the input with the name `myInput`.
* `this.$refs.myInput` in the `focusInput` method accesses the input element.
* when the button is clicked, the `focusInput` method calls the `focus()` function on the input element, making it focused.

---

#### Other Common Directives

`g-show` displays or hides an element based on a condition.
* if the expression in `g-show` returns true, the element will be displayed.
* if false, the element will be hidden (by setting `display: none`).

**Example:**
```html
<div g-scope="{ isVisible: true }">
    <button @click="isVisible = !isVisible">
        Toggle Visibility
    </button>
    <p g-show="isVisible">This paragraph is conditionally visible.</p>
</div>
```

**In which:**
* `g-show="isVisible"` displays the element if `isVisible` is true, otherwise hides it.
* the button toggles the value of `isVisible`, making the paragraph appear or disappear when clicked.

---

`g-html` inserts raw HTML into an element.

**Example:**
```html
<div g-scope="{ rawHtml: '<strong>This is bold text</strong>' }">
    <div g-html="rawHtml"></div>
</div>
```

**In which:**
* `g-html="rawHtml"` inserts HTML content from the `rawHtml` variable into the div element.

---

`g-text` inserts text content into an element.

**Example:**
```html
<div g-scope="{ plainText: '<em>This will not be italic</em>' }">
    <div g-text="plainText"></div>
</div>
```

**In which:**
* `g-text="plainText"` inserts text content from the `plainText` variable into the div element without processing HTML.
* the displayed result will be: `<em>This will not be italic</em>` as plain text.

---

`g-static` marks an element as static, not requiring re-render.
* only renders once when the scope is initialized.
* improves performance by avoiding unnecessary re-renders for elements that do not change.

**Example:**
```html
<div g-scope="{ 
    title: 'This is a static heading',
    changeableText: 'This paragraph can change.'
}">
    <h1 g-static>{ title }</h1>
    <p>{ changeableText }</p>
    <input type="text" g-model="changeableText" />
    <input type="text" g-model="title" />
</div>
```

**In which:**
* `g-static` and `{ title }` in the `<h1>` tag are only rendered once.
* when changing `title` via the input, the `<h1>` tag will not update.
* the `<p>` element and the second input can still change and update normally.

> In some cases, using `g-static` helps optimize performance by minimizing unnecessary re-renders of elements.

---

`g-ignore` creates a hard boundary that GyosJS does not parse or mount.

```html
<div g-scope="Dashboard">
    <p>Last update: { lastUpdated }</p>

    <div g-ignore id="chart-root">
        <!-- This subtree belongs to the chart library. -->
        <span>{braces remain literal}</span>
    </div>
</div>
```

GyosJS leaves the element and all descendants unchanged:

* interpolation remains literal.
* directives, bindings, events, models, and structural syntax are not processed.
* nested named scopes and `gd-*`/`gm-*` auto-scopes are not mounted.
* ignored `g-ref` elements are not added to `$refs`.
* repeated `mountAll()` and `mountTree()` calls still skip the branch.

Use `g-ignore` when another library owns the DOM, or when server output happens to contain syntax that looks like a GyosJS expression.

Do not confuse it with `g-static`. A `g-static` branch renders once using the current scope. A `g-ignore` branch is never interpreted by GyosJS.

Declare `g-ignore` before mounting. Adding it after mount does not clean up existing effects; use `Gyos.cleanup()` first when taking ownership away from GyosJS. Removing `g-ignore` also does not trigger mounting automatically.

This boundary applies to component and template initialization, not to the global MPA Boost router. Use `g-no-boost` separately when links or forms in that branch must use native browser navigation.

---

`g-portal` moves an element to a different location in the DOM.

**Example:**
```html
<div gd-teleport="true">
    <div g-portal="#modal-root" *if="teleport" style="padding: 10px;">
        <h2>This content is portaled to #modal-root</h2>
        <p>This paragraph is rendered inside the modal root element.</p>
    </div>
    <button @click="teleport = !teleport">Toggle Portal</button>
</div>
<div id="modal-root" 
    style="background: #fff305; color: black; border-radius: 8px;"></div>
```

**In which:**
* `g-portal="#modal-root"` moves the element into the element with id `modal-root`.
* `g-portal` only works when used together with the structural `*if`. 
* this ensures the portal can be reversed to its original position when the condition changes.

---

**Alternatively, you can use the API as follows:**
```html
<div g-scope="{
    onMount() {
        Gyos.portalCreate(this.$refs.modal, '#modal-root');
    },
    onUnmount() {
        Gyos.portalDestroy(this.$refs.modal);
    }
}">
    <div g-ref="modal">
        <h2>This content is portaled to #modal-root</h2>
        <p>This paragraph is rendered inside the modal root element.</p>
    </div>
</div>

<div id="modal-root"></div>
```

**In which:**
* `Gyos.portalCreate(...)` moves the element referenced by `modal` into the element with id `modal-root`.
* `Gyos.portalDestroy(...)` cleans up when the scope is unmounted.

---

`g-transition` adds transition effects when an element appears or disappears.
* applies animation effects when an element is added to or removed from the DOM.
* only works when used together with structural directives like `*if`, `*for`, `*switch`, `*await`.

**Example:**
```html
<div g-scope="{ showBox: false, transitionType: 'fade' }">
    <button @click="showBox = !showBox">Toggle Box</button>
    <div *if="showBox" g-transition="transitionType" 
        style="width: 200px; height: 100px; background: lightblue;">
        This box will fade in and out.</div>
</div>
```

**In which:**
* `g-transition="transitionType"` applies transition effects based on the value of `transitionType`.
* you can dynamically change the transition effect by changing the value of `transitionType`.

---

`g-hydrate` activates hydration for an element.
* a flag for GyosJS to only mount the scope when the hydration condition is met.
* `idle` - mount when the browser is idle.
* `visible` - mount when the element becomes visible in the viewport.
* `interaction` - mount when the user interacts with the element.
* `media(...)` - mount when the media query matches.

**Example:**
```html
<div class="section">
    <h2>Smart Hydration</h2>

    <h3 style="margin-top: 20px;">Idle Hydration</h3>
    <p>Loads when browser is idle</p>
    <div g-scope="IdleDemo" g-hydrate="idle" class="IdleDemo lazy-content waiting">
        Hydrated when idle! Time: {time}
    </div>

    <h3 style="margin-top: 30px;">Visible Hydration</h3>
    <p>Scroll down to see it load...</p>
    <div class="spacer">⬇️ Scroll Down ⬇️</div>

    <div g-scope="VisibleDemo" g-hydrate="visible" class="VisibleDemo lazy-content waiting">
        Hydrated when visible! Loaded at: {loadTime}
    </div>

    <h3 style="margin-top: 30px;">Interaction Hydration</h3>
    <p>Hover or click to hydrate</p>
    <div g-scope="InteractionDemo" g-hydrate="interaction" class="InteractionDemo lazy-content waiting">
        Hydrated on interaction! Message: {message}
    </div>

    <h3 style="margin-top: 30px;">Media Query Hydration</h3>
    <p>Only loads on mobile (max-width: 768px)</p>
    <div g-scope="MediaDemo" g-hydrate="media(max-width: 768px)" class="MediaDemo lazy-content waiting">
        Hydrated on mobile! Device: {device}
    </div>
</div> 

<script>
  // Hydration demos
  Gyos.scope('IdleDemo', {
    time: new Date().toLocaleTimeString(),
    onMount() {
      console.log('IdleDemo hydrated!');
      document.querySelector('.IdleDemo').classList.remove('waiting');
    }
  });
  
  Gyos.scope('VisibleDemo', {
    loadTime: null,
    onMount() {
      console.log('VisibleDemo hydrated when scrolled into view!');
      this.loadTime = new Date().toLocaleTimeString();
      setTimeout(() => {
        document.querySelector('.VisibleDemo').classList.remove('waiting');
      }, 200);
    }
  });
  
  Gyos.scope('InteractionDemo', {
    message: 'I loaded when you interacted!',
    onMount() {
      console.log('InteractionDemo hydrated on interaction!');
      document.querySelector('.InteractionDemo').classList.remove('waiting');
    }
  });
  
  Gyos.scope('MediaDemo', {
    device: null,
    onMount() {
      console.log('MediaDemo hydrated on mobile!');
      this.device = window.innerWidth <= 768 ? 'Mobile' : 'Desktop';
      document.querySelector('.MediaDemo').classList.remove('waiting');
    }
  });
</script>
```

**CSS styles for the above example:**
```css
.section {
    background: white;
    border-radius: 15px;
    padding: 12px 28px;
    margin-bottom: 20px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    border: 1px solid #e0e0e0;
    min-height: 245px;
}

.section h2 {
    color: #667eea;
    margin-bottom: 20px;
}

button {
    padding: 8px 20px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background: #667eea;
    color: white;
    cursor: pointer;
    font-weight: bold;
    transition: all 0.3s;
    margin: 10px auto;
}

button:hover {
    background: #5568d3;
    transform: translateY(-2px);
}

/* Hydration demo */
.lazy-content {
    min-height: 200px;
    padding: 20px;
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    color: white;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    font-weight: bold;
}
.lazy-content.waiting {
    background: #dadada;
    color: #ffffff;
    font-size: 1rem;
    border: 1px solid #ccc;
}

.spacer {
    height: 150vh;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 1.5rem;
    font-weight: bold;
}
```

---

* and some other directives like: `g-provide`, `g-on`, `g-focus`, `g-cloak`, `g-tooltip`, `g-on`...

---

#### Creating Custom Directives

You can also create custom directives in GyosJS to extend functionality according to your needs.

**Example: Creating a `g-color` directive to change text color:**
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

**Directive API:**
* `mounted(el, binding)` - Called when the directive is attached to an element.
* `updated(el, binding)` - Called when the directive's value changes.
* `unmounted(el)` - Called when the directive is unmounted from the scope.

**Using the `g-color` directive:**
```html
<div g-scope>
    <p g-color="'red'">This text is red.</p>
    <p g-color="'blue'">This text is blue.</p>
</div>
```

**In the example:**
* `g-color="'red'"` changes the text color to red.
* `g-color="'blue'"` changes the text color to blue.

---

**Example: Creating a directive with arguments `g-fetch` to fetch data from an API:**
```js
Gyos.directive('fetch', {
    async mounted(el, binding, scope) {
        const url = binding.value;
        try {
            const response = await fetch(url);
            const data = await response.json();
            const prop = binding.arg[0] || undefined;
            if (prop) scope[prop] = data;
        } catch (error) {
            console.error('Fetch error:', error);
        }
    }
});
```

**Using the `g-fetch` directive:**
```html
<div gd-users="[]" gd-api="https://jsonplaceholder.typicode.com/users">
    <div g-fetch:users="api">{ users | json }</div>
</div>
```

**In the example:**
* `gd-api="..."` declares the API URL to fetch data from.
* `gd-users="[]"` declares the `users` variable in the scope with an initial empty array.
* `g-fetch:users="api"` fetches data from the URL in `api` and assigns it to the `users` variable in the scope.

> Full syntax: `g-[directive]:[arg]="value"` to pass arguments and values to custom directives.

--- 

### Event Handling Syntax

In GyosJS, you can handle DOM events such as click, input, submit, etc. 

The syntax to listen to events is `@[eventName].[modifiers]="handler"` .
* `eventName`: the DOM event name (e.g., click, input, submit).
* `modifiers` (optional): modifiers to change the behavior of the event (e.g., stop, prevent, once).
* `handler`: the name of the method in the scope or a JavaScript expression to handle the event.

> The handler should be a concise expression. Complex logic should be placed in the JavaScript scope.

**Example:**
```html
<div g-scope="{ 
    count: 0,
    logMessage(msg) { alert(msg); }
}">
    <p>Count: { count }</p>
    <button @click="count++">Increment</button>
    <button @click.once="logMessage('Button clicked once!')">
        Click Me Once
    </button>
    <form @submit.prevent="logMessage('Form submitted! ' + input)">
        <input type="text" g-model.debounce.300="input" />
        <button type="submit">Submit</button>
    </form>
</div>
```

**Demo result:**

```html
<div g-scope="{ count: 0,logMessage(msg) { alert(msg); }}" class="card card-body">
<p>Count: { count }</p>
<button class="btn btn-primary" @click="count++">Increment</button>
<button class="btn btn-info" @click.once="logMessage('Button clicked once!')">Click Me Once</button>
<br><br>
<form @submit.prevent="logMessage('Form submitted! ' + input)" g-no-boost class="flex-xy-center">
    <input class="input" type="text" placeholder="Type something..." g-model.debounce.300="input" />
    <button class="btn btn-success" type="submit">Submit</button>
</form>
</div>
```

**In the example:**
* `@click="count++"` increments the `count` variable when the button is clicked.
* `@click.once="logMessage('...')"` calls the `logMessage` method only once when the button is clicked.
* `@submit.prevent="logMessage(...)"` prevents the default form behavior and calls `logMessage` on submit.
* `g-model.debounce.300="input"` updates the `input` variable with a 300ms debounce when the user types.

---

> Note: Not all modifiers apply to every event. Some modifiers only work with specific types of events.

Common modifiers include:
* `stop` - Stops event bubbling.
* `prevent` - Prevents the default behavior of the event.
* `once` - Listens to the event only once.
* `capture` - Listens to the event during the capturing phase.
* `passive` - Optimizes performance for scroll and touch events.
* `debounce.[ms]` - Delays any event handler until calls have stopped for the given milliseconds, for example `@input.debounce.300`.
* `outside` - With `@click.outside`, listens for document clicks outside the bound element.
* `global` - Attaches the listener to the document root instead of requiring the element to receive the event.
* `escape` and `esc` - Listens only when the Escape key is pressed (only for `keydown`, `keyup`).
* `space` - Listens only when the Space key is pressed (only for `keydown`, `keyup`).
* `up` - Listens only when the Up Arrow key is pressed (only for `keydown`, `keyup`).
* `down` - Listens only when the Down Arrow key is pressed (only for `keydown`, `keyup`).
* `left` - Listens only when the Left Arrow key is pressed (only for `keydown`, `keyup`).
* `right` - Listens only when the Right Arrow key is pressed (only for `keydown`, `keyup`).
* `enter`, `delete`, and `tab` - Match Enter, Delete/Backspace, and Tab respectively.

`once` is consumed only after the event passes its key or `outside` filter and the handler runs. A non-matching key does not consume `@keydown.enter.once`. A numeric modifier alone does not debounce: `@input.300` runs immediately, while `@input.debounce.300` is debounced.

Do not combine `passive` with `prevent`. Browsers intentionally ignore `preventDefault()` inside passive listeners; use `passive` only when the handler will not cancel native scrolling or touch behavior.

---

**Example using `outside` and `escape` modifiers:**
```html
<div gd-is-open="false" style="position: relative;">
    <button @click="isOpen = !isOpen" g-ignore-outside-click>Toggle Dropdown</button>
    <div *if="isOpen" tabindex="0"
        style="position: absolute; top: 100%; left: 0; 
            background: #f0f0f0; padding: 10px; 
            border: 1px solid #ccc;"
        @click.outside="isOpen = false"
        @keydown.escape.global="isOpen = false">
        This is a dropdown menu. Click outside or press Escape to close.
    </div>
</div>
```

**Demo result:**

```html
<div gd-is-open="false" style="position: relative;">
    <button class="btn btn-primary" @click="isOpen = !isOpen" g-ignore-outside-click>Toggle Dropdown</button>
    <div *if="isOpen" tabindex="0"
        style="position: absolute; top: 110%; left: 0;
            background: #f0f0f0; padding: 10px; 
            color:#000; border: 1px solid #ccc;"
        @click.outside="isOpen = false"
        @keydown.escape.global="isOpen = false">
        This is a dropdown menu. Click outside or press Escape to close.
    </div>
</div>
```

**In which:**
* `gd-is-open="false"` declares the variable `isOpen` in the scope.
* `@click.outside="isOpen = false"` closes the dropdown when clicking outside the element.
* `@keydown.escape.global="isOpen = false"` closes the dropdown when pressing the Escape key.
* `g-ignore-outside-click` prevents __duplicate event__ clicks from also being treated as outside-clicks.

By default, keyboard events (`keydown`, `keyup`) only listen when the element is focused. Use the `global` modifier to listen to events across the entire page.

> The `global` modifier is often used when building modals, dropdowns, or overlays that need to respond to shortcuts from anywhere.

---

By using these template syntax features, you can easily build dynamic and interactive web applications with GyosJS.

> Tip: You can combine multiple modifiers together, for example: `@click.stop.prevent="handler"`. This will prevent both event bubbling and the default behavior when the button is clicked.

---

### G-Model Syntax

`g-model` is a two-way data binding syntax for form elements like input, textarea, and select.
* It automatically updates the data in the scope when the user changes the value in the form.
* Conversely, when the data in the scope changes, the value in the form is also updated automatically.

**Example:**
```html
<div g-scope>
    <input type="text" g-model.trim="username" placeholder="Enter username" />
    <p>Hello, { username }!</p>
    <textarea g-model="message" placeholder="Enter your message"></textarea>
    <pre>Your message: { message }</pre>
    <button @click="username = ''; message = ''">Clear all</button>
</div>
```

**Demo result:**

```html
<div g-scope class="card card-body">
    <input class="input" type="text" g-model.trim="username" placeholder="Enter username" />
    <p>Hello, { username }!</p><br>
    <textarea class="input" g-model="message" placeholder="Enter your message"></textarea>
    <p>Your message: { message }</p>
    <button class="btn btn-info" @click="username = ''; message = ''">Clear all</button>

</div>
```

**In which:**
* `g-model="username"` binds the value of the input to the variable `username`.
* `g-model="message"` binds the value of the textarea to the variable `message`.
* when entering data into the input or textarea, the variables `username` and `message` are automatically updated.

Additionally, `g-model` supports modifiers to customize the binding behavior:
* `debounce.[ms]` - Limits the frequency of data updates.
* `trim` - Automatically trims whitespace from the beginning and end of the string.
* `number` - Converts the value to a number.

The numeric delay is recognized only after `debounce`: use `g-model.debounce.300="query"`, not `g-model.300="query"`. `g-model` listens to the `input` event, supports nested paths such as `user.name` and `items[0].title`, and writes booleans for checkboxes.

> Note about IME (Vietnamese, Japanese, Chinese…):

> The `trim` modifier should not be used directly with the `input` event as it may cause incorrect results during composition. Instead, trim on `blur`, `submit`, or after the user has finished input.

---

### Expressions Syntax

Expressions in GyosJS allow you to perform operations, call functions, and use logical operators directly within the template.

**Example:**
```html
<div g-scope="{ 
    a: 5, 
    b: 10,
    multiply(x, y) { return x * y; }
}">
    <p>Sum: { a + b }</p>
    <p>Product: { multiply(a, b) }</p>
    <p>Is a greater than b? { a > b ? 'Yes' : 'No' }</p>
</div>
```

**Demo result:**

```html
<div g-scope="{ a: 5, b: 10, multiply(x, y) { return x * y; } }" class="card card-body">
    <p>Sum: { a + b }</p>
    <p>Product: { multiply(a, b) }</p>
    <p>Is a greater than b? { a > b ? 'Yes' : 'No' }</p>
</div>
```

**In which:**
* `{ a + b }` calculates the sum of `a` and `b`.
* `{ multiply(a, b) }` calls the `multiply` function to calculate the product of `a` and `b`.
* `{ a > b ? 'Yes' : 'No' }` uses a conditional operator to check if `a` is greater than `b`.

---

**Using in combination with pipes:**
```html
<div g-scope="{ 
    text: '  hello gyosjs  ', 
    formatText(str) { return str.trim().toUpperCase(); }
}">
    <p>Original: '{ text }'</p>
    <p>Formatted: '{ text.trim() | uppercase | reverse }'</p>
    <p>Custom Formatted: '{ formatText(text) }'</p>
</div>
```

**Demo result:**
```html
<div g-scope="{ text: '  hello gyosjs  ', formatText(str) { return str.trim().toUpperCase(); } }" class="card card-body">
    <p>Original: '{ text }'</p>
    <p>Formatted: '{ text.trim() | uppercase | reverse}'</p>
    <p>Custom Formatted: '{ formatText(text) }'</p>
</div>
```

**In which:**
* `{ text.trim() | uppercase | reverse }` uses pipes to process the string.
* `{ formatText(text) }` calls a custom function to format the string.

---

**Creating custom pipes:**

Syntax: `Gyos.pipe('pipeName', function(value, ...args) { ... })`
* `value`: the input value of the pipe.
* `...args`: additional arguments passed to the pipe.
* example: `{ value | pipeName(arg1, arg2) }`

**Example: Creating a `trim` pipe to remove whitespace:**
```js
Gyos.pipe('trim', function(value) {
    return typeof value === 'string' ? value.trim() : value;
});
```

```html
<div g-scope="{ rawText: '   Hello GyosJS!   ' }">
    <p>Before Trim: '{ rawText }'</p>
    <p>After Trim: '{ rawText | trim }'</p>
</div>
```

**Example: Creating a `multiply` pipe to multiply two numbers:**
```js
Gyos.pipe('multiply', function(value, factor) {
    return typeof value === 'number' && typeof factor === 'number' 
        ? value * factor 
        : value;
});
```

```html
<div g-scope="{ num: 7 }">
    <p>Original Number: { num }</p>
    <p>Multiplied by 3: { num | multiply(3) }</p>
</div>
```

**In the two examples above:**
* the `trim` pipe removes whitespace from a string.
* the `multiply` pipe multiplies the value by the given factor.

> Creating custom pipes allows you to extend the data processing capabilities directly within the template in a flexible and reusable way.

--- 

### Summary

In this section, we have explored the powerful template syntax of GyosJS, including:
* Structural Directives: `*if`, `*for`, `*switch`, `*await`.
* Attribute Directives: `g-scope`, `g-model`, `g-ref`, `g-show`, `g-html`, `g-text`, `g-static`, `g-ignore`, `g-portal`, `g-transition`, `g-hydrate`.
* Event Handling Syntax: `@[eventName].[modifiers]="handler"`.
* G-Model Syntax: `g-model="[variable]"` with modifiers.
* Expressions Syntax: using expressions, operators, and pipes in templates.

By using these syntaxes, you can easily build dynamic, interactive, and efficient web applications with GyosJS. Keep exploring and leveraging the power of GyosJS in your projects!

---

### What's Next?

This concludes the tutorial on GyosJS's [Template Syntax](./template-syntax.md), as well as the entire core concepts of GyosJS. Are you ready to start building web applications with GyosJS? Let's explore advanced features and practical examples in the following sections of this document!

The core concepts presented include:
* [What is G-Scope?](./what-is-gscope.md) Learn about data scope in GyosJS.
* [Reactivity & Signals](./reactivity-signals.md) Learn about the reaction and signaling system in GyosJS.
* [Template Syntax](./template-syntax.md) Detailed instructions on template syntax in GyosJS. (this section)

Next, you can refer to advanced sections such as:
* [Tutorial Guide](./tutorial-guide.md) Guide to building web applications with GyosJS.
* [API Reference](./api-reference.md) Complete API reference documentation for GyosJS.
* [MPA Boost Deep Dive](./mpa-boost-deep-dive.md) In-depth exploration of GyosJS's main feature - MPA Boost.
* [Layouts, scripts, and lifecycle](./layouts-scripts-lifecycle.md) Learn about layouts, scripts, and lifecycle when activating MPA Boost.
* [Best practices for using GyosJS](./best-practices.md) Best practices for using GyosJS in real-world projects.

**Wishing you success in building amazing web applications with GyosJS!**
