# Layouts, Scripts, and Lifecycle

When you adopt GyosJS MPA boost, the router is not only swapping HTML. It is also shaping how your layout responds to navigation, how scripts are executed, how persistent islands survive, and when lifecycle code runs.

This page focuses on the practical architecture side of the router:

- how to shape pages and partials
- how the router chooses what to swap
- what happens to `<head>` and scripts
- how persisted layout islands work
- when navigation hooks and scope hooks run
- which caveats matter in production

This guide is based on the current behavior in `src/core/router/router.ts` and the router demos.

---

## Think In Layout Surfaces

GyosJS does not create a separate client-side layout system. It works with the HTML layout your server already returns.

The key question on each navigation is:

> Which existing surface in the current document should receive the incoming HTML?

That surface is the target.

In most apps, you will work with one of these layout patterns:

- a full-page app shell with one main `[g-outlet]`
- a page with one main outlet plus a few targeted partial regions
- a mostly static page with one local panel updated by `g-target`

---

## Target Resolution And Layout Selection

GyosJS resolves the live target in this order:

1. the trigger’s `g-target` selector
2. the closest ancestor `[g-outlet]` containing the trigger
3. the first global `[g-outlet]`

This is the rule you should design your layouts around.

### Pattern 1: Single main outlet

```html
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <header>...</header>
        <main>...</main>
        <footer>...</footer>
    </div>
</body>
```

This is the default and most resilient setup.

Why it works well:

- normal page navigation is simple
- full HTML responses work naturally
- head updates make sense
- snapshots are easy to reason about

This is how the main router demo pages are structured.

### Pattern 2: Partial panel inside a bigger page

```html
<div id="app" g-outlet g-snapshot>
    <main class="layout">
        <aside id="sidebar" class="card">
            Current sidebar
        </aside>

        <section class="card">
            <button
                g-router-link="/sidebar.html"
                g-router-method="GET"
                g-target="#sidebar"
                g-swap="morph"
            >
                Refresh sidebar
            </button>
        </section>
    </main>
</div>
```

This pattern keeps the page layout stable while updating only the sidebar.

### Pattern 3: Trigger inside a nested outlet

```html
<section class="dashboard">
    <div class="widget-shell" g-outlet>
        <a href="/reports.html">Reports</a>
        <div class="widget-content">
            ...
        </div>
    </div>
</section>
```

If that link has no `g-target`, GyosJS will use the nearest ancestor `[g-outlet]` instead of the global outlet.

This lets you scope navigation locally.

---

## How GyosJS Chooses HTML From The Response

After fetching and parsing the response, GyosJS chooses the source fragment with this order:

1. if the current target has an `id`, search for the same `id` in the incoming document
2. if the target is an outlet, use the incoming `[g-outlet]` at the same document position
3. otherwise use the first `[g-outlet]` in the incoming document
4. otherwise fall back to the incoming `<body>`

Positional matching allows unnamed nested outlets to consume full-document responses. Keep outlet order stable between pages, or prefer stable IDs for partial targets.

This is why both of these strategies work:

- return a full HTML document and let GyosJS extract the matching part
- return a smaller HTML partial that already matches the target

### Full-page response example

Current page:

```html
<div id="app" g-outlet g-snapshot>
    <a href="/posts.html">Posts</a>
    <main>Home content</main>
</div>
```

Server response:

```html
<!doctype html>
<html>
<head>
    <title>Posts</title>
</head>
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <main>
            <h1>Posts</h1>
        </main>
    </div>
</body>
</html>
```

GyosJS will extract `#app`.

### Partial response example

Current page:

```html
<aside id="sidebar" class="card">
    Current sidebar
</aside>
```

Server response:

```html
<aside id="sidebar" class="card">
    <h3>Sidebar</h3>
    <p>New content from the server.</p>
</aside>
```

GyosJS will extract `#sidebar`.

---

## Swap Modes And Their Layout Implications

The swap mode is a layout decision, not just a rendering preference.

### `inner`

```html
<a href="/posts.html" g-swap="inner">Posts</a>
```

Current behavior:

- target element stays
- target children are fully replaced
- when the target is the first global outlet, its attributes are also synchronized from the incoming outlet

Choose `inner` when:

- the target wrapper should stay stable
- the incoming page naturally maps to the target’s content
- you want a page-like update without replacing the target node itself

### `replace`

```html
<a href="/posts.html" g-swap="replace">Replace outlet</a>
```

Current behavior:

- the target element is replaced with the incoming source element

Choose `replace` when:

- the wrapper itself changes meaningfully
- the target needs different attributes or a different tag

### `append`

```html
<button
    g-router-link="/posts-item.html"
    g-router-method="GET"
    g-target="#items"
    g-swap="append"
>
    Append items
</button>
```

Current behavior:

- child nodes of the source fragment are appended to the target
- the source wrapper is not appended as a wrapper
- existing target scopes and effects remain mounted
- only newly inserted scopes are mounted
- only scripts inside the incoming child nodes are considered for execution

This is a good fit for:

- feeds
- comments
- paginated lists
- activity logs

### `prepend`

```html
<button
    g-router-link="/posts-item.html"
    g-router-method="GET"
    g-target="#items"
    g-swap="prepend"
    g-noscroll
>
    Prepend results
</button>
```

Current behavior:

- child nodes of the source fragment are inserted at the beginning of the target
- existing target scopes and effects remain mounted
- only newly inserted scopes are mounted
- scripts that were already in the target are not executed again

This is useful for:

- reverse chronological feeds
- “latest first” updates
- activity timelines

### `morph`

```html
<a href="/morph-b.html?v=hello" g-swap="morph">Morph to B</a>
```

Current behavior:

- the existing target element remains
- the router patches the tree in place
- attributes are synchronized
- text nodes are updated
- children are matched with a lightweight key strategy
- persisted nodes and persist placeholders receive special handling

Choose `morph` when:

- both pages are structurally similar
- preserving focus or selection matters
- you want less flicker than a full subtree replacement

Avoid `morph` when:

- the two layouts are radically different
- the incoming structure is unstable
- you expect it to behave like a full component reconciler

---

## Designing Layouts For `morph`

Because `morph` is intentionally simple, a little layout discipline goes a long way.

The current morph logic compares elements using:

- tag name
- `id`
- `data-gyos-persist-id`
- `data-gyos-key`

That means morph works best when:

- important elements keep stable `id`s
- repeated items have stable keys
- large sections stay in roughly the same order
- the next page is a variation of the current page, not a different application shell

### Example: good morph target

```html
<div id="app" g-outlet g-snapshot>
    <main>
        <div class="card" id="profile-card">
            <input type="text" value="Ada">
        </div>

        <p>
            <a href="/profile-edit.html" g-swap="morph">Edit profile</a>
        </p>
    </main>
</div>
```

If the next page keeps the same overall structure, GyosJS can patch in place and the input is more likely to keep a natural feel.

### Example: poor morph target

```html
<div id="app" g-outlet g-snapshot>
    <main>
        <section class="landing-grid">...</section>
    </main>
</div>
```

Then the next page becomes:

```html
<div id="app" g-outlet g-snapshot>
    <main>
        <table class="admin-report">...</table>
    </main>
</div>
```

That is usually better handled with `inner` or `replace`.

---

## Head Behavior

A major difference between full-page swaps and partial swaps is whether the current document head should follow the incoming page.

### What GyosJS updates in `<head>`

For a navigation whose target is the first global outlet, GyosJS updates the following unless the trigger has `g-current-head`:

- `document.title`
- `meta`
- `link`
- `style` except `style#gyos-transitions`
- `script`

This is appropriate for page-to-page MPA navigation.

### Example: full page navigation should update the head

```html
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <nav>
            <a href="/home.html">Home</a>
            <a href="/posts.html">Posts</a>
        </nav>
    </div>
</body>
```

If `/posts.html` has a different title, description, stylesheet, or page-level script, GyosJS will bring those changes into the current document.

### `g-current-head`

Use `g-current-head` when you are swapping the first global outlet but intentionally want to retain the current document head. For example, an embedded preview can change the outlet without adopting the preview document's metadata:

```html
<div id="app" g-outlet>
    <a href="/embedded-preview.html" g-current-head>
        Open preview and keep this document head
    </a>
</div>
```

This keeps:

- the current title
- current meta tags
- current links and styles
- current head scripts

This is useful for global-outlet flows such as:

- embedded previews
- shell-owned metadata that must not follow the destination response
- outlet refreshes whose head resources are managed separately

### Important nuance

Targets other than the first global outlet do not update the head, so a normal `g-target="#sidebar"` refresh does not need `g-current-head`. The attribute only changes head behavior for the global outlet. In either case, scripts inside swapped content still follow normal swap-time execution rules.

So think of it as:

- “keep the page head as-is”

not:

- “disable all script work”

---

## Script Behavior

Scripts are one of the most important practical concerns in boosted MPA navigation.

GyosJS handles scripts in three different places:

1. scripts in the initial page
2. scripts inside the swapped result
3. scripts outside the global outlet in a full-page response

Understanding this makes router behavior much easier to predict.

### Initial page script caching

On router startup, GyosJS scans scripts already in the document.

Current behavior:

- initial scripts have already executed by the time the router starts
- `g-script-wrap` affects scripts inserted by boosted navigation; it cannot retroactively isolate an initial parser-executed script
- only scripts marked `g-script-once` are cached as already executed
- the two attributes can be combined; the once key is based on the original script content

Why this matters:

- when you navigate back to the initial page via snapshot or fetch, `g-script-once` scripts do not run again
- if an initial inline script needs local scope, write the IIFE directly or use `type="module"`

### Scripts inside the swapped target

After a swap, GyosJS scans `<script>` tags inside the result and decides whether each one should execute.

#### Default behavior

By default, scripts execute again on navigation.

```html
<div id="app" g-outlet g-snapshot>
    <main>
        <script>
            console.log('Runs when this area is swapped in');
        </script>
    </main>
</div>
```

Use this for scripts that are truly page- or fragment-specific and safe to run each time.

#### `g-script-once`

Mark a script so it only executes once.

```html
<script g-script-once>
    alert('Show this welcome message only once');
</script>
```

Current behavior:

- external scripts are keyed by `src`
- inline scripts are keyed by a hash of their text content
- if the same key has already executed, GyosJS clears the script text instead of re-running it
- a failed external script is removed from the once cache so a later navigation can retry it
- external and module scripts finish before scopes mount and `onAfterNavigate` runs
- relative external script URLs resolve against the destination response URL

This is useful for:

- one-time analytics bootstrap
- one-time welcome UI
- libraries that should not initialize twice

#### `g-script-wrap`

Wraps inline script content in an IIFE before execution.

```html
<script g-script-wrap>
    console.log('This runs inside an IIFE');
</script>
```

This is useful when:

- you want local script scope
- you do not want temporary variables leaking globally

### Scripts outside the target region

For full-outlet navigation, GyosJS also compares scripts outside the outlet region.

In practice, this means page-level scripts in the body but outside the swapped area can still be updated to follow the incoming document.

This is important for layouts where:

- some scripts live near the end of `<body>`
- the main content is inside the outlet
- page-level behavior is still coupled to the document being shown

For `g-target` partial navigation, GyosJS does not diff global body scripts. This prevents a sidebar refresh or load-more response from removing layout scripts that were never part of that partial.

### Example: script once for a page alert

```html
<div id="app" g-outlet g-snapshot>
    <script g-script-once>
        alert("I'm a one-time page script");
    </script>

    <main>
        <h1>Home</h1>
    </main>
</div>
```

This mirrors the pattern used in the router demos.

### Example: wrap a body-end script

```html
<script g-script-wrap>
    console.log('Page-specific script at the end of body');
</script>
```

### Practical advice for scripts

- keep page-level bootstrapping idempotent when possible
- use `g-script-once` only when a script really must not re-run
- use `g-script-wrap` for inline scripts that should stay locally scoped
- prefer server-rendered HTML and scope lifecycle for UI behavior over large inline imperative scripts

---

## Persisted Islands In Layouts

`g-persist` is one of the most useful layout features in GyosJS MPA boost.

It lets you keep a live DOM island across navigations without keeping the whole app alive as a client-side SPA shell.

### How it works

During navigation, GyosJS:

1. waits until a successful response has been parsed and a source fragment is available
2. finds `[g-persist]` elements inside the destructive swap target
3. leaves persisted islands outside a partial target in place
4. gives the selected islands a stable persist key if needed
5. moves them into a hidden parking container
6. performs the swap
7. looks for matching placeholders in the new live DOM
8. re-inserts matching parked nodes
9. keeps unmatched nodes parked for a later navigation

### Ways to match persisted content

#### Element placeholder

Page A:

```html
<div g-persist="player" class="player-shell">
    <audio controls src="/audio/theme.mp3"></audio>
</div>
```

Page B:

```html
<div g-persist="player" class="player-shell"></div>
```

#### Comment placeholder

Page B:

```html
<!-- g-persist:player -->
```

This comment pattern is used in the router examples and is often the cleanest choice when you want a clear insertion point without a fake wrapper.

### Persist key rules

Current key selection is:

1. existing `data-gyos-persist-id`
2. the value of `g-persist`
3. the element `id`
4. an auto-generated key

As an end user, the practical takeaway is simple:

- always give persisted islands an explicit `g-persist="name"` when you can

That keeps the contract readable and stable across pages.

### Example: persisted audio player

Page A:

```html
<div id="app" g-outlet g-snapshot>
    <div g-persist="player" class="card">
        <strong>Mini Player</strong>
        <audio controls src="/audio/theme.mp3"></audio>
    </div>

    <a href="/posts.html">Posts</a>
</div>
```

Page B:

```html
<div id="app" g-outlet g-snapshot>
    <main>
        <h1>Posts</h1>
        <!-- g-persist:player -->
    </main>
</div>
```

This is exactly the kind of use case `g-persist` is designed for.

### Keep persisted islands narrow

Persist only the part that truly needs continuity.

Good candidates:

- audio/video players
- stopwatch or timer display
- small floating utility panels

Poor candidates:

- your entire app shell
- large content regions that should be remounted normally
- elements whose correctness depends on full server refresh

---

## Navigation Lifecycle

There are two lifecycle layers that matter to users of GyosJS:

1. router-level navigation hooks
2. scope lifecycle inside swapped content

Use each for the right job.

### Router-level hooks

GyosJS exposes:

```js
Gyos.onBeforeNavigate((url) => {
    console.log('Navigating to:', url);
});

Gyos.onAfterNavigate((url) => {
    console.log('Navigated to:', url);
});
```

Use these for:

- analytics
- logging
- page transition UI
- app-wide loading indicators
- navigation debugging

### Scope lifecycle

Inside swapped HTML, your scopes still use normal lifecycle callbacks such as `onMount()` and `onUnmount()`.

```html
<div g-scope="ClockApp">
    <p>Current Time: <span g-ref="timer">[TIMER]</span></p>
</div>

<script>
Gyos.scope('ClockApp', {
    intervalId: null,
    onMount() {
        this.intervalId = setInterval(() => {
            const now = new Date();
            this.$refs.timer.textContent = now.toLocaleTimeString();
        }, 1000);
    },
    onUnmount() {
        clearInterval(this.intervalId);
    }
});
</script>
```

Use scope lifecycle for:

- DOM work inside that scope
- timers
- subscriptions
- widget-level setup and cleanup

### New markup inside an existing scope

A partial target does not need to introduce another `g-scope`. After an `inner`, `replace`, `morph`, `append`, or `prepend` commit, GyosJS initializes the committed subtree against its nearest live scope. New text interpolation, bindings, events, models, structural syntax, and custom directives therefore work normally:

```html
<section g-scope="ResultsPage">
    <div id="results"></div>
</section>
```

```html
<!-- Matching fragment returned by a filtered request. -->
<div id="results">
    <article g-reveal :aria-label="title">{title}</article>
</div>
```

Do not add a global `onAfterNavigate` callback that rescans the document to mount those nodes. Reserve router hooks for app-wide concerns such as analytics. If your own non-router code inserts markup, call `Gyos.mountTree(insertedRoot)` once for that subtree.

### The effective order of events

For a typical boosted navigation, the user-facing order is roughly:

1. before-navigation hooks run
2. scroll position is saved
3. the response is fetched, or a snapshot is restored
4. the response is validated, parsed, and matched to the live target
5. the router verifies that this is still the latest navigation
6. for `inner`, `replace`, or `morph`, target persist islands are parked and outgoing scopes/effects are cleaned up
7. for `append` or `prepend`, existing scopes/effects remain mounted
8. history state is updated when appropriate so incoming scripts observe the destination URL
9. the outlet DOM is swapped, then full-outlet head scripts are updated and awaited before outlet scripts run
10. body-level scripts outside the outlet are updated and awaited after outlet scripts
11. persisted islands are merged back
12. new scopes mount
13. scroll handling runs

Once DOM cleanup and swapping begin, GyosJS finishes that commit before starting a newer navigation. This prevents a slow external or module script from leaving persisted islands parked or the new page only partly mounted. Before the commit phase, a newer navigation still aborts the older request normally.
14. the View Transition update callback completes, when supported
15. after-navigation hooks run

That is the order you should keep in mind when composing page behavior.

---

## View Transitions

If the browser supports `document.startViewTransition`, GyosJS uses it around the update.

You do not need to opt in per navigation in the current router. The update is wrapped automatically when the API is available.

This means:

- navigation can feel smoother on supported browsers
- `onAfterNavigate` sees the committed and mounted DOM
- `onAfterNavigate` waits for `updateCallbackDone`, not for the visual animation's `finished` promise
- unsupported browsers still work normally

That is a graceful enhancement, not a requirement.

---

## Practical Recipes

### Recipe 1: Full MPA shell with persistent utility widget

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Home</title>
    <script src="/dist/gyos.auto.min.js"></script>
</head>
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <nav>
            <a href="/home.html">Home</a>
            <a href="/about.html">About</a>
            <a href="/contact.html">Contact</a>
        </nav>

        <main class="page-shell">
            <h1>Home</h1>

            <div g-scope="ClockApp" g-persist="timer-app" class="floating-clock">
                <p>Current Time: <span g-ref="timer">[TIMER]</span></p>
            </div>
        </main>
    </div>

    <script>
    Gyos.scope('ClockApp', {
        intervalId: null,
        onMount() {
            const tick = () => {
                this.$refs.timer.textContent = new Date().toLocaleTimeString();
            };
            tick();
            this.intervalId = setInterval(tick, 1000);
        },
        onUnmount() {
            clearInterval(this.intervalId);
        }
    });
    </script>
</body>
</html>
```

This is a very strong pattern for a marketing site, docs site, dashboard, or small product app.

### Recipe 2: Partial sidebar with safe head behavior

```html
<div class="layout">
    <aside id="sidebar" class="card">
        Current filter summary
    </aside>

    <section class="card">
        <button
            g-router-link="/sidebar.html"
            g-router-method="GET"
            g-target="#sidebar"
            g-swap="morph"
            g-router-spin
        >
            Refresh sidebar
        </button>
    </section>
</div>
```

The narrow target automatically leaves the document head and layout scripts unchanged.

### Recipe 3: Search page with proper history

```html
<div id="app" g-outlet g-snapshot>
    <main>
        <form action="/search.html" method="get">
            <input name="q" placeholder="Search">
            <button>Search</button>
        </form>
    </main>
</div>
```

Because it is a `GET` form:

- the query goes into the URL
- history changes naturally
- back/forward is intuitive

### Recipe 4: Append a list without touching the head

```html
<div g-scope="{ page: 1 }">
    <div id="feed"></div>

    <button
        g-router-link="/feed-page-2.html"
        g-router-method="GET"
        g-router-params="{ page: page + 1 }"
        @click="page++"
        g-target="#feed"
        g-swap="append"
        g-noscroll
    >
        More posts
    </button>
</div>
```

This is a good fit for partial flows that should stay inside one page context.

---

## Caveats And Troubleshooting

### My partial update replaced more than I expected

Check:

- whether `g-target` points to the right live element
- whether the selector exists in the current document
- whether the response contains a matching `id`

If not, GyosJS may fall back to the outlet or response body.

### My page title changed during a sidebar update

Verify that `g-target` resolves to the sidebar in the live document. A true partial target does not update the page title. If the trigger resolves to the global outlet instead, correct the selector or add `g-current-head` when the full-outlet swap is intentional.

### My script runs too many times

Consider:

- moving the logic into a scope lifecycle
- making the script idempotent
- marking it with `g-script-once` if it truly should run once

### My custom directive did not run after a partial update

GyosJS initializes committed partial markup automatically. If it still does not mount, check that the directive was registered before the swap completes, the node is not inside `g-ignore`, and the response contains the matching target fragment. For DOM inserted by application code rather than MPA Boost, call `Gyos.mountTree(insertedRoot)`.

### My focus did not survive a navigation

Try:

- using `g-swap="morph"`
- keeping the two layouts structurally similar
- adding stable `id`s or keys where appropriate

### My persisted island did not come back

Check:

- the `g-persist` key
- whether the next page includes a matching element or comment placeholder
- whether the placeholder is inside the swapped live DOM

### My “load more” action changed the whole page title and styles

That usually means the live `g-target` selector did not resolve and the router fell back to the global outlet. Confirm that the target exists before the click and that the response contains a wrapper with the same `id`.

---

## Recommended Mental Model

For layout and lifecycle work, GyosJS is easiest to reason about if you think in these terms:

- the server owns HTML structure
- the trigger decides which live surface is updated
- the response provides the next fragment for that surface
- swap mode decides how much DOM identity is preserved
- the head follows only first-global-outlet navigation, and `g-current-head` can suppress that update
- scripts are opt-in to “once” behavior, not “once” by default
- `g-persist` is for small, intentional long-lived islands

That model is enough to build fast, practical, server-rendered MPA flows without losing control of document behavior.

---

## Read Next

- [MPA Boost Deep Dive](./mpa-boost-deep-dive.md)
- [Best Practices](./best-practices.md)
- [Examples](./examples.md)
