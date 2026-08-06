# Migrate from Plain JavaScript

GyosJS is not only for greenfield projects. It is especially useful when you already have server-rendered pages and a growing amount of manual DOM code.

This guide explains how to migrate from plain JavaScript patterns to GyosJS patterns without pretending that every project should be rewritten from scratch.

The goal is practical:

- compare real plain JavaScript patterns against GyosJS patterns
- show concrete examples
- explain what changes in your mental model
- outline a realistic migration path

## The core shift

In plain JavaScript, many UI features are written like this:

1. query a node
2. attach a listener
3. update text or classes manually
4. rebuild part of the DOM
5. repeat the same logic in several places

In GyosJS, you still write HTML-first UI, but you move most of that repetition into declarative relationships:

- state lives in `g-scope`
- the template reads from state
- directives decide what appears
- `g-model` keeps form inputs in sync
- the DOM updates when the underlying state changes

That sounds abstract until you compare actual code, so let us do that.

## Pattern 1. Manual text and class updates vs reactive state

### Plain JavaScript version

This kind of code is very common in dashboards, settings pages, or filter panels:

```html
<div class="status-card">
    <button id="toggleStatus">Toggle</button>
    <p id="statusText">Offline</p>
</div>

<script>
    const button = document.getElementById('toggleStatus');
    const statusText = document.getElementById('statusText');
    let online = false;

    button.addEventListener('click', function() {
        online = !online;
        statusText.textContent = online ? 'Online' : 'Offline';
        statusText.className = online ? 'ok' : 'muted';
    });
</script>
```

This is fine when the widget is tiny. It becomes noisy when:

- more than one field depends on the same state
- the same rule is copied into multiple listeners
- markup and logic drift apart

### GyosJS version

```html
<div g-scope="{ online: false }" class="status-card">
    <button @click="online = !online">Toggle</button>
    <p :class="online ? 'ok' : 'muted'">{online ? 'Online' : 'Offline'}</p>
</div>
```

You no longer tell the UI how to rewrite the DOM after every click. You describe the relationship once and let the state drive the output.

### Runnable example

```html
<div g-scope="{ online: false }" class="card card-body">
    <h3 style="margin-top:0;">Status card</h3>
    <button class="btn btn-primary" @click="online = !online">
        Toggle status
    </button>
    <p :style="online ? { color: '#166534' } : { color: '#64748b' }">
        {online ? 'Online' : 'Offline'}
    </p>
</div>
```

## Pattern 2. Manual form sync vs `g-model`

### Plain JavaScript version

Many forms start with manual sync code like this:

```html
<form id="signupForm">
    <input id="nameInput" placeholder="Name" />
    <input id="emailInput" placeholder="Email" />
    <p id="summaryText">Waiting for input...</p>
</form>

<script>
    const nameInput = document.getElementById('nameInput');
    const emailInput = document.getElementById('emailInput');
    const summaryText = document.getElementById('summaryText');

    function renderSummary() {
        const name = nameInput.value.trim();
        const email = emailInput.value.trim();

        if (!name || !email) {
            summaryText.textContent = 'Waiting for input...';
            return;
        }

        summaryText.textContent = name + ' <' + email + '>';
    }

    nameInput.addEventListener('input', renderSummary);
    emailInput.addEventListener('input', renderSummary);
</script>
```

The problems here are not dramatic, but they add up:

- one render function per form concern
- manual trimming and validation flow
- extra code every time another field is added

### GyosJS version

```html
<form g-scope class="signup-form">
    <input g-model.trim="name" placeholder="Name" />
    <input g-model.trim="email" placeholder="Email" />
    <p *if="name && email">{name} &lt;{email}&gt;</p>
    <p *else>Waiting for input...</p>
</form>
```

The state and the UI summary stay in one place.

### Runnable example

```html
<form g-scope class="card card-body" g-no-boost style="display:grid;gap:12px;">
    <h3 style="margin:0;">Signup preview</h3>
    <input class="input" g-model.trim="name" placeholder="Name" />
    <input class="input" g-model.trim="email" placeholder="Email" />

    <p *if="name && email" style="margin:0;">
        Preview: <strong>{name}</strong> &lt;{email}&gt;
    </p>
    <p *else style="margin:0;color:#666;">
        Waiting for both fields...
    </p>
</form>
```

## Pattern 3. Manual list rendering vs `*for`

### Plain JavaScript version

Here is a classic manual list renderer:

```html
<div>
    <button id="addTask">Add task</button>
    <ul id="taskList"></ul>
</div>

<script>
    const addTask = document.getElementById('addTask');
    const taskList = document.getElementById('taskList');
    const items = ['Draft proposal', 'Review copy'];

    function render() {
        taskList.innerHTML = '';

        items.forEach(function(item, index) {
            const li = document.createElement('li');
            li.textContent = item;

            const remove = document.createElement('button');
            remove.textContent = 'Remove';
            remove.addEventListener('click', function() {
                items.splice(index, 1);
                render();
            });

            li.appendChild(remove);
            taskList.appendChild(li);
        });
    }

    addTask.addEventListener('click', function() {
        items.push('Task ' + (items.length + 1));
        render();
    });

    render();
</script>
```

This works. It is also the point where many projects start accumulating custom mini-render systems by accident.

### GyosJS version

```html
<div g-scope="{ items: ['Draft proposal', 'Review copy'] }">
    <button @click="items.push('Task ' + (items.length + 1))">Add task</button>

    <ul>
        <li *for="item, index in items" g-key="item + '-' + index">
            {item}
            <button @click="items.splice(index, 1)">Remove</button>
        </li>
    </ul>
</div>
```

The state stays as an array. The template declares how to render it. You do not manually clear and rebuild the list.

### Runnable example

```html
<div g-scope="{ items: ['Draft proposal', 'Review copy'] }" class="card card-body">
    <h3 style="margin-top:0;">Task list</h3>
    <button class="btn btn-primary" @click="items.push('Task ' + (items.length + 1))">
        Add task
    </button>

    <ul style="padding-left:20px;">
        <li *for="item, index in items" g-key="item + '-' + index" style="margin:8px 0;">
            {item}
            <button class="btn btn-danger" style="width:auto;margin-left:8px;" @click="items.splice(index, 1)">
                Remove
            </button>
        </li>
    </ul>

    <p *if="items.length === 0" style="color:#666;">No tasks left.</p>
</div>
```

## Pattern 4. Scattered widget logic vs one scope

When plain JavaScript grows, the real problem is often not syntax. It is scattered ownership.

For example, a filter panel might have:

- a listener for the search input
- a listener for the status select
- a listener for a reset button
- a render function for the results
- another render function for the badge count

GyosJS lets you pull that interaction back into one place.

### Plain JavaScript approach

```html
<div class="users-panel">
    <input id="queryInput" placeholder="Search users" />
    <select id="statusFilter">
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
    </select>
    <button id="resetFilters">Reset</button>

    <p id="resultCount"></p>
    <ul id="userResults"></ul>
</div>

<script>
    const queryInput = document.getElementById('queryInput');
    const statusFilter = document.getElementById('statusFilter');
    const resetFilters = document.getElementById('resetFilters');
    const resultCount = document.getElementById('resultCount');
    const userResults = document.getElementById('userResults');

    const users = [
        { name: 'Ada', status: 'active' },
        { name: 'Grace', status: 'paused' },
        { name: 'Linus', status: 'active' }
    ];

    function render() {
        const q = queryInput.value.toLowerCase().trim();
        const status = statusFilter.value;

        const filtered = users.filter(function(user) {
            const matchName = !q || user.name.toLowerCase().includes(q);
            const matchStatus = status === 'all' || user.status === status;
            return matchName && matchStatus;
        });

        resultCount.textContent = filtered.length + ' users';
        userResults.innerHTML = filtered.map(function(user) {
            return '<li>' + user.name + ' - ' + user.status + '</li>';
        }).join('');
    }

    queryInput.addEventListener('input', render);
    statusFilter.addEventListener('change', render);
    resetFilters.addEventListener('click', function() {
        queryInput.value = '';
        statusFilter.value = 'all';
        render();
    });

    render();
</script>
```

### GyosJS approach

```html
<div g-scope="UserFilterMigrationDemo" class="card card-body">
    <h3 style="margin-top:0;">User filter panel</h3>

    <div style="display:grid;grid-template-columns:2fr 1fr auto;gap:10px;">
        <input class="input" g-model.trim="query" placeholder="Search users" />

        <select class="input" g-model="status">
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
        </select>

        <button class="btn btn-warning" style="width:auto;" @click="reset">
            Reset
        </button>
    </div>

    <p style="margin:8px 0 0;">
        {filteredUsers.length} user(s) match
    </p>

    <ul style="padding-left:20px;">
        <li *for="user in filteredUsers" g-key="user.name">
            {user.name} - {user.status}
        </li>
    </ul>

    <p *if="filteredUsers.length === 0" style="color:#666;">
        No users match the current filters.
    </p>
</div>

<script g-script-once>
    Gyos.scope('UserFilterMigrationDemo', {
        query: '',
        status: 'all',
        users: [
            { name: 'Ada', status: 'active' },
            { name: 'Grace', status: 'paused' },
            { name: 'Linus', status: 'active' },
            { name: 'Mina', status: 'paused' }
        ],

        get filteredUsers() {
            var q = String(this.query || '').toLowerCase().trim();
            var status = this.status;

            return this.users.filter(function(user) {
                var matchName = !q || user.name.toLowerCase().includes(q);
                var matchStatus = status === 'all' || user.status === status;
                return matchName && matchStatus;
            });
        },

        reset() {
            this.query = '';
            this.status = 'all';
        }
    });
</script>
```

The benefit here is not that GyosJS uses fewer characters. The benefit is that the ownership is clearer:

- data lives in the scope
- derived results live in a getter
- the template describes output directly
- reset logic stays local

## Pattern 5. Fetch and replace vs `g-boost`

One of the most painful plain JavaScript patterns in server-rendered apps is custom navigation code:

```js
document.addEventListener('click', async function(event) {
    const link = event.target.closest('a[data-fast-nav]');
    if (!link) return;

    event.preventDefault();

    const response = await fetch(link.href);
    const html = await response.text();

    const doc = new DOMParser().parseFromString(html, 'text/html');
    document.querySelector('#app').innerHTML =
        doc.querySelector('#app').innerHTML;

    history.pushState({}, '', link.href);
});
```

This quickly turns into a maintenance problem because you still have to solve:

- form submissions
- history
- scroll restoration
- partial updates
- scripts
- head updates
- persisted islands

GyosJS gives you a higher-level contract:

```html
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <nav>
            <a href="/dashboard.html">Dashboard</a>
            <a href="/reports.html">Reports</a>
        </nav>
        <main>...</main>
    </div>
</body>
```

Then add more specific patterns only when you need them:

- `g-target` for partial swaps
- `g-current-head` only when the first global outlet changes but should retain the current head
- `g-router-link` for button-driven router requests
- `g-persist` for narrow long-lived islands

## A realistic migration plan

The safest migration path is usually incremental.

### Step 1. Inventory the current pain points

Look for places where plain JavaScript is doing too much repetitive UI glue:

- form syncing
- toggle panels
- filter widgets
- manual list rendering
- fetch-and-replace navigation

Do not migrate everything. Start where the benefit is obvious.

### Step 2. Pick one isolated UI island

Good first candidates:

- a pricing widget
- a search/filter box
- a profile settings form
- a draft editor
- a comments panel

This keeps the migration low risk.

### Step 3. Keep the server-rendered HTML contract

GyosJS works well when your HTML already means something. Keep:

- real links
- real forms
- real routes
- real server responses

Do not start by inventing a JSON API if the page already speaks HTML well.

### Step 4. Replace DOM writes with state-driven markup

In practice, this usually means:

- replace manual `.textContent` updates with `{expression}` or `g-text`
- replace `classList.toggle(...)` with `:class`
- replace `input.value` sync code with `g-model`
- replace `innerHTML` list building with `*for`
- replace visibility toggles with `*if` or `g-show`

### Step 5. Extract larger blocks into named scopes

Inline scopes are great for tiny features. Once the block grows, move it into `Gyos.scope('FeatureName', { ... })`.

That gives you:

- cleaner HTML
- reusable logic
- easier testing by behavior
- clearer ownership

### Step 6. Add MPA boost last

Only after the page-level HTML contract is stable, add:

- `g-boost`
- `g-outlet`
- `g-snapshot`

Then layer on:

- partial swaps with `g-target`
- partial buttons with `g-router-link`
- persisted islands with `g-persist`

This order matters. If you add boosted navigation before your server responses are predictable, you will be debugging layout and response-shape problems instead of gaining speed.

## What usually migrates well

- local form state
- tabs, accordions, toggles
- search and filter panels
- dynamic lists and repeated rows
- settings pages
- server-rendered MPA navigation

## What should often stay as plain JavaScript

Not every script benefits from being rewritten.

Keep plain JavaScript when:

- the code is tiny and stable
- it does not manage much state
- it integrates with a third-party widget that already owns the DOM
- it is a one-off behavior with no real reactivity needs

GyosJS is strongest when it removes repetitive UI glue. If a piece of code has no such problem, there may be nothing to gain.

## A final rule of thumb

If your current code keeps asking:

- where is the source of truth?
- which function re-renders this part?
- why is this field out of sync?
- why did this listener not reattach after navigation?

then GyosJS is probably a good fit.

If your current code is already simple, isolated, and predictable, leave it alone.

That is usually the most realistic migration mindset.

## Suggested next reading

- [Tutorial Guide](./tutorial-guide.md)
- [Reactivity and Signals](./reactivity-signals.md)
- [Template Syntax](./template-syntax.md)
- [MPA Boost Deep Dive](./mpa-boost-deep-dive.md)
