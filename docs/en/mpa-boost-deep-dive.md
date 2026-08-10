# MPA Boost Deep Dive

GyosJS MPA boost is an attribute-driven router for server-rendered HTML. It lets you keep a normal multi-page architecture while upgrading links and forms into smoother, partial, state-aware navigation.

This page is written for people using GyosJS in real apps. The goal is not to explain router internals for contributors. The goal is to help you answer practical questions:

- What does boosted navigation actually do?
- Which attributes matter in real pages?
- How should my server responses be shaped?
- When should I use `inner`, `replace`, `prepend`, or `morph`?
- What happens with forms, history, persisted UI, scripts, and head tags?

The examples here are grounded in the current router behavior used by `examples/router` and `examples/mpa-demo`.

---

## What MPA Boost Solves

Traditional MPA navigation is simple and reliable, but every click reloads the whole document. That usually means:

- browser-level flash between pages
- losing local UI state
- re-running scripts unnecessarily
- no easy way to update only one region

GyosJS MPA boost keeps the server-rendered MPA model, but swaps HTML into your current document when navigation is eligible.

In practice, this gives you:

- normal links and forms
- progressive enhancement
- partial region swaps
- history support
- snapshot restore on back/forward
- persistent islands such as audio players or timers
- smoother transitions without turning the whole app into a SPA

If your application is mostly server-rendered HTML and you want faster navigation without introducing a client-side routing framework, this feature is one of the main reasons to use GyosJS.

---

## The Minimum Contract

At its simplest, boosted navigation needs three things:

- a page that loads GyosJS
- some element in the document with `g-boost`
- at least one swap target, usually `[g-outlet]`

Any `g-boost` element is enough for `startRouter()` to install its listeners. Global interception still requires `g-boost` on `body`; otherwise only links and forms with their own `g-boost` are eligible.

The most common setup looks like this:

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>My App</title>
    <script src="/dist/gyos.auto.min.js"></script>
</head>
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <nav>
            <a href="/home.html">Home</a>
            <a href="/posts.html">Posts</a>
            <a href="/account.html">Account</a>
        </nav>

        <main>
            <h1>Home</h1>
            <p>Server-rendered content.</p>
        </main>
    </div>
</body>
</html>
```

What this gives you immediately:

- same-origin links become boosted by default because `body` has `g-boost`
- the first `[g-outlet]` becomes the default swap region
- snapshots can be saved for this target because it has `g-snapshot`

This is the same general structure used across the router demos.

---

## What The Router Intercepts

GyosJS currently intercepts three kinds of navigation:

1. same-origin anchor clicks
2. same-origin form submissions
3. custom triggers using `g-router-link`

That sounds broad, but the router is intentionally selective. It falls back to normal browser behavior for many cases.

### Anchor clicks

GyosJS will boost an anchor click when all of these are true:

- it is a left click
- the event was not already prevented
- no modifier keys are held
- the URL is same-origin
- the link is not inside `[g-no-boost]`
- the link is not a download link
- the link target is missing or `_self`
- the link itself is boostable because it has `g-boost` or the document has global boost

This means standard browser expectations are preserved:

- Cmd/Ctrl-click still opens a new tab
- `target="_blank"` still behaves normally
- external links still perform a full navigation

### Form submissions

Forms are boosted when:

- the form is same-origin
- the form is not inside `[g-no-boost]`
- the form itself has `g-boost`, or the page has global boost

Native boosted forms support the browser's effective form methods:

- `GET`: form fields are merged into the URL query string, and history changes are enabled by default
- `POST`: the request body is sent, but history is not pushed by default

That matches how the router demos use search forms and login/create forms.

Use `g-router-link` with `g-router-method` for `PUT`, `PATCH`, or `DELETE`. Put `g-no-boost` on cross-origin forms; otherwise global boost converts the submission to a hard location change and cannot preserve POST data.

### Custom router triggers

Any element can trigger navigation with `g-router-link`.

```html
<button
    g-router-link="/posts-item.html"
    g-router-method="GET"
    g-router-params="{ page, filter }"
    g-target="#items"
    g-swap="prepend"
>
    Load more
</button>
```

This is especially useful for:

- load more buttons
- sidebar panels
- infinite scroll helpers
- small region updates that are not a normal anchor or form

Important current behavior:

- `g-router-link` defaults to `changeState: false`
- allowed methods are `GET`, `POST`, `PUT`, `DELETE`, `PATCH`
- `g-router-params` is evaluated as an expression in the current scope

That default is deliberate: partial actions like “load more” usually should not create a new history entry every time.

---

## When GyosJS Does Not Boost

The easiest way to understand the router is to also understand its fallbacks.

GyosJS does not boost when:

- the clicked link is external
- the link has `download`
- the link has `target` other than `_self`
- the link or form is inside `[g-no-boost]`
- the click uses modifier keys
- no swap target can be resolved
- the request fails and the router falls back to normal navigation
- the response is not OK and the router falls back to normal navigation

This is good. A boost router should not force every navigation through one path. It should upgrade the safe cases and leave the rest alone.

---

## The Core Attributes

The router is attribute-driven. Most of your day-to-day work is deciding which attribute belongs on which link, form, or target.

### `g-boost`

Enables boosted navigation.

You can place it globally:

```html
<body g-boost>
    <div g-outlet>
        ...
    </div>
</body>
```

Or place it narrowly:

```html
<a g-boost href="/pricing.html">Pricing</a>

<form g-boost action="/search.html" method="get">
    <input name="q">
</form>
```

Use `body[g-boost]` when most same-origin navigation should be upgraded. Use element-level boost when only a specific link or form should be enhanced. Placing `g-boost` on an arbitrary container starts the router but does not make all descendants boostable.

### `g-no-boost`

Turns boost off for a subtree.

```html
<body g-boost>
    <nav>
        <a href="/docs.html">Boosted docs link</a>
    </nav>

    <section g-no-boost>
        <a href="/legacy-admin.html">Legacy admin, use full reload</a>
    </section>
</body>
```

Use this around areas that rely on plain browser navigation or third-party code you do not want the router to intercept.

### `g-outlet`

Marks a swap region. The router uses this as the default target when no more specific target is provided.

```html
<div id="app" g-outlet g-snapshot>
    ...
</div>
```

Most apps have one main outlet. Some layouts also place links inside nested outlets to scope swaps more narrowly.

### `g-target`

Overrides the default target and points to a specific element in the current document.

```html
<a href="/profile-with-sidebar.html" g-target="#sidebar">
    Reload sidebar only
</a>
```

This is one of the most important attributes in the router.

Current target resolution order is:

1. the selector in `g-target` on the trigger
2. the closest ancestor `[g-outlet]` containing the trigger
3. the first global `[g-outlet]`

If no target is found, GyosJS falls back to full-page navigation.

### `g-swap`

Controls how incoming HTML is applied.

Supported modes:

- `inner`
- `replace`
- `append`
- `prepend`
- `morph`

These are not cosmetic differences. They change how the target node behaves, how scripts run, and whether the target element itself survives.

#### `g-swap="inner"`

Replace the target’s children, but keep the target element itself.

```html
<a href="/posts.html" g-swap="inner">Posts</a>
```

Use this as the default page-like swap mode. It preserves the target node identity while replacing its contents.

#### `g-swap="replace"`

Replace the target element itself with the incoming element.

```html
<a href="/posts.html" g-swap="replace">Replace outlet node</a>
```

Use this when the incoming HTML needs to replace the entire element, not just its children.

#### `g-swap="append"`

Append the incoming source fragment’s child nodes to the target.

```html
<button
    g-router-link="/posts-item.html"
    g-router-method="GET"
    g-target="#items"
    g-swap="append"
    g-router-remove
>
    Append items
</button>
```

`g-router-remove` removes this specific trigger only after the new fragment commits. If the response contains the next load-more control, the old and new controls do not remain together; failed requests keep the current trigger available.

This is useful for timelines, feeds, or “show more” flows.

#### `g-swap="prepend"`

Prepend the incoming source fragment’s child nodes to the target.

```html
<button
    g-router-link="/posts-item.html"
    g-router-method="GET"
    g-target="#items"
    g-swap="prepend"
>
    Prepend items
</button>
```

This matches the “load more” style demo in `profile-with-sidebar.html`.

#### `g-swap="morph"`

Patch the existing DOM tree in place instead of replacing it outright.

```html
<a href="/morph-b.html?v=hello" g-swap="morph">Morph to B</a>
```

Use `morph` when both pages are structurally similar and you want to preserve things like:

- focused inputs
- selected text
- media element state
- stable element identity

This is powerful, but it is not a generic virtual DOM. The current morph logic is intentionally simple and works best when the old and new trees are close to each other.

### `g-preload`

Preloads a same-origin anchor response on mouseover.

```html
<a g-preload href="/posts.html">Posts</a>
```

GyosJS stores the pending fetch in a preload cache and consumes it on the actual navigation if the request is a `GET`.

Use it for:

- menu items people are likely to click next
- heavyweight page transitions
- frequently used navigation paths

### `g-snapshot`

Allows the router to save HTML snapshots for history restoration.

```html
<div id="app" g-outlet g-snapshot>
    ...
</div>
```

Current behavior:

- snapshots are saved only when the target element has `g-snapshot`
- snapshots are keyed by URL without the hash
- on browser back/forward, GyosJS tries to restore the snapshot first

This is one of the reasons the router feels fast on history navigation.

### `g-persist`

Marks an island that should survive navigation.

```html
<div g-persist="player">
    <audio controls src="/audio/theme.mp3"></audio>
</div>
```

Or use a placeholder comment in the next page:

```html
<!-- g-persist:player -->
```

After a response has been fetched and parsed successfully, GyosJS detaches persisted nodes inside the destructive swap target into a hidden parking area, performs the swap, and then merges matching nodes back into the live DOM. A persisted node outside a partial target is not touched. If the next page has no matching placeholder, the node stays parked and can be restored by a later page.

This is ideal for:

- audio players
- media previews
- clocks or timers
- lightweight long-lived tools

### `g-current-head`

Keeps the current `<head>` unchanged when the selected target is the first global `[g-outlet]`.

```html
<div id="app" g-outlet>
    <a href="/embedded-preview.html" g-current-head>
        Open preview without adopting its head
    </a>
</div>
```

Use this when the global outlet should change but page-level metadata, stylesheets, and head scripts should remain owned by the current shell. A target other than the first global outlet does not update the head, so ordinary sidebar and list fragment swaps do not need this attribute.

### `g-change-state`

Forces a navigation to change history state.

```html
<button
    g-router-link="/filters.html"
    g-router-method="GET"
    g-target="#results"
    g-change-state
>
    Replace results and push history
</button>
```

This matters most for `g-router-link`, which otherwise defaults to `changeState: false`.

### `g-current-state`

Treats the current history state as the state to keep.

```html
<button
    g-router-link="/sidebar.html"
    g-target="#sidebar"
    g-current-state
>
    Update sidebar without pushing state
</button>
```

In current behavior, when `g-current-state` is present:

- GyosJS does not push or replace history for that navigation
- scroll restoration uses the existing `history.state.scroll` if available

### `g-noscroll`

Skips GyosJS scroll handling for this navigation.

```html
<a href="/about.html" g-noscroll>Stay at current scroll position</a>
```

Without `g-noscroll`, GyosJS will:

- smooth scroll to a matching hash target if the URL includes one
- otherwise restore saved scroll on history navigation
- otherwise smooth scroll to the top

### `g-router-spin`

Shows a target spinner during navigation.

```html
<button
    g-router-link="/posts-item.html"
    g-target="#items"
    g-swap="prepend"
    g-router-spin
>
    Load more
</button>
```

This is useful for small region updates where a global progress bar is too broad.

### `g-router-link`, `g-router-method`, `g-router-params`

Turns any element into a router trigger.

```html
<button
    g-router-link="/posts-item.html"
    g-router-method="GET"
    g-router-params="{ page, searchQuery, items, info }"
    g-target="#items"
    g-swap="prepend"
    g-router-spin
>
    Load more posts
</button>
```

This is the most flexible router API for partial updates. It is also the most explicit.

Use it when:

- you do not want a normal anchor
- you need to send structured params from scope state
- the navigation should affect a specific region only

---

## How Navigation Actually Flows

This is the high-level lifecycle a boosted navigation follows today.

### 1. The event is captured

GyosJS listens for:

- `click`
- `submit`
- `mouseover` for preloading
- `popstate`

For clicks and submits, it first decides whether the navigation is eligible for boost.

### 2. The current scroll position is saved

Before swapping, the router stores `window.scrollX` and `window.scrollY` in `history.state`.

That matters later for browser back/forward.

### 3. The target is resolved

GyosJS decides which live element will be updated:

1. `g-target` selector on the trigger
2. closest ancestor `[g-outlet]`
3. first global `[g-outlet]`

### 4. The request is built

GyosJS sends:

- `X-Gyos-Boost: 1`
- `Accept: text/html,application/xhtml+xml`

For `GET` forms or `GET` router params, values are merged into the URL query string.

For non-`GET` forms:

- `FormData` is sent as the request body

For non-`GET` `g-router-link` with object params:

- JSON is sent as the request body

### 5. A snapshot may be used instead of fetching

On `popstate`, if a snapshot exists for the URL without its hash, GyosJS restores the saved HTML instead of refetching.

If not, it fetches the response normally.

### 6. The response is validated and the source fragment is chosen

GyosJS does not tear down the current target while the request is pending. A failed, aborted, non-OK, cross-origin, non-HTML, or attachment response leaves the live target mounted. GET requests fall back to normal browser navigation. Non-GET requests are not replayed after dispatch because repeating a mutation could duplicate its side effects; GyosJS keeps the current page and reports the failure instead.

After a successful response is read and parsed as HTML, the router picks the source fragment using this order:

1. if the target has an `id`, look for the same `id` in the response
2. if the target is an outlet, use the response `[g-outlet]` at the same document position
3. otherwise use the first `[g-outlet]` in the response
4. otherwise use `document.body` from the response

This is the key rule that makes both full-document responses and partial fragments workable.

Before source selection, GyosJS removes every `noscript` element from the fetched document. A `DOMParser` document has scripting disabled and therefore parses `noscript` children as real markup. Removing the fallback preserves the semantics of the live JavaScript-enabled page and also keeps snapshots from activating fallback CSS on Back/Forward.

Unnamed nested outlets require stable outlet order across full-page responses. A stable target `id` remains the most explicit option.

### 7. The commit begins

Only the latest active navigation may enter the commit. For destructive modes (`inner`, `replace`, and `morph`), GyosJS now:

1. parks persisted islands inside the target
2. disposes effects and unmounts scopes in the outgoing target
3. updates history when appropriate so incoming scripts observe the destination URL
4. applies the incoming DOM

For additive modes (`append` and `prepend`), existing target nodes, scopes, and effects stay mounted.

### 8. The swap happens

GyosJS performs the selected swap mode:

- `inner`
- `replace`
- `append`
- `prepend`
- `morph`

For destructive swaps, scripts in the new result follow normal execution rules. For `append` and `prepend`, only scripts in the newly inserted child nodes are considered; scripts already in the target are not run again.

### 9. Head and non-target scripts are updated for full-outlet navigation

When the target is the first global outlet, and the trigger does not have `g-current-head`, GyosJS updates:

- `document.title`
- `meta`
- `link`
- `style` except `#gyos-transitions`
- `script`

Separately, GyosJS diffs scripts outside the global outlet, which matters for page-level scripts living in `body`.

When `g-target` resolves to a smaller partial region, the document head and global body scripts are not diffed. Scripts inside the incoming partial still execute according to the selected swap mode.

### 10. Persist, mount, and scroll are finalized

Finally, GyosJS:

- merges persisted islands back into the live DOM
- mounts scopes in the new HTML
- handles scroll
- completes the progress UI

This ordering matters. Persisted islands come back before the new content fully settles, and mounting happens after the swap.

If View Transitions are supported, the commit runs inside `document.startViewTransition()`. `onAfterNavigate` runs after the transition update callback has completed, so the new DOM is mounted and scroll handling has run. It does not wait for the visual animation itself to finish.

---

## Request And Response Patterns

The router works best when your server HTML is predictable.

### Pattern 1: Full-page HTML response

This is the simplest and most robust pattern.

Current page:

```html
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <a href="/posts.html">Posts</a>
        <main>...</main>
    </div>
</body>
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
        <a href="/home.html">Home</a>
        <main>
            <h1>Posts</h1>
        </main>
    </div>
</body>
</html>
```

The router will pick `#app` because the current target has `id="app"`.

### Pattern 2: Partial response with a matching target

Current page:

```html
<aside id="sidebar" class="card">
    Current sidebar
</aside>

<button
    g-router-link="/sidebar.html"
    g-router-method="GET"
    g-target="#sidebar"
    g-swap="morph"
>
    Load sidebar
</button>
```

Server response:

```html
<aside id="sidebar" class="card">
    <h3>Sidebar</h3>
    <p>Fresh server-rendered details.</p>
</aside>
```

The router finds `#sidebar` in the response and swaps only that area.

For a quick view or modal that should keep the current URL and history entry, use the complete fragment-link recipe:

```html
<a
    href="/products/42/quick-view"
    g-target="#quick-view-shell"
    g-swap="inner"
    g-current-state
>
    Quick view
</a>
```

Each attribute has a separate job: `g-target` selects the live region, `g-swap` chooses how its response content is committed, and `g-current-state` prevents the fragment URL from replacing or extending navigation history. Also ensure the link is not inside a `g-no-boost` ancestor.

### Pattern 3: Partial list item payload

Current page:

```html
<div id="items"></div>

<button
    g-router-link="/posts-item.html"
    g-router-method="GET"
    g-target="#items"
    g-swap="prepend"
>
    Load more
</button>
```

Server response:

```html
<div id="items">
    <article class="post-card">
        <h3>Another post</h3>
        <p>Loaded from the server.</p>
    </article>
</div>
```

Because `prepend` and `append` use the source fragment’s child nodes, the wrapper works well as a delivery shape.

---

## Practical Examples

### Example 1: Boosted navigation for a normal MPA shell

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Docs</title>
    <script src="/dist/gyos.auto.min.js"></script>
</head>
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <nav>
            <a href="/home.html">Home</a>
            <a g-preload href="/docs.html">Docs</a>
            <a href="/pricing.html">Pricing</a>
        </nav>

        <main>
            <h1>Home</h1>
            <p>Clicking a same-origin link now swaps the outlet.</p>
        </main>
    </div>
</body>
</html>
```

This is the best default starting point.

### Example 2: GET search form

```html
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <main>
            <h1>Search posts</h1>

            <form action="/posts-search.html" method="get">
                <input type="text" name="q" placeholder="Search term">
                <select name="category">
                    <option value="">All</option>
                    <option value="news">News</option>
                    <option value="tips">Tips</option>
                </select>
                <button>Search</button>
            </form>
        </main>
    </div>
</body>
```

Why this works well:

- the form remains plain HTML
- query params appear in the URL
- browser history changes by default because the method is `GET`
- the response can be a complete HTML page

### Example 3: POST form that swaps in a success or error page

```html
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <main>
            <h1>Login</h1>

            <form action="/login-error.html" method="post">
                <label>Email <input type="email" name="email" required></label>
                <label>Password <input type="password" name="password" required></label>
                <button>Login</button>
            </form>
        </main>
    </div>
</body>
```

The server can return:

- a success page
- a form page with validation errors
- a redirect target that ends up at another URL

History behavior for non-`GET` forms is intentional:

- a non-redirected validation response swaps its HTML without changing the browser URL
- a redirected response pushes `response.url`, so a successful POST/Redirect/GET flow lands on the canonical destination URL
- `g-change-state` can explicitly request a history change
- `g-current-state` suppresses a history change, including an otherwise automatic redirect update

### Example 4: Sidebar partial update

```html
<div class="layout">
    <aside id="sidebar" class="card">
        Current sidebar content
    </aside>

    <section class="card">
        <h2>Profile</h2>

        <a
            href="/profile-with-sidebar.html"
            g-target="#sidebar"
            g-swap="morph"
        >
            Reload sidebar from full page response
        </a>

        <button
            g-router-link="/sidebar.html"
            g-router-method="GET"
            g-target="#sidebar"
            g-swap="morph"
        >
            Reload sidebar from partial response
        </button>
    </section>
</div>
```

This example demonstrates two valid strategies:

- fetch a full page and extract the matching `#sidebar`
- fetch a focused partial response and extract `#sidebar` directly

### Example 5: Load more with prepend

```html
<div g-scope="{ page: 1, searchQuery: '' }">
    <input type="text" g-model.debounce="searchQuery" placeholder="Search">

    <div id="items"></div>

    <button
        g-router-link="/posts-item.html"
        g-router-method="GET"
        g-router-params="{ page: page + 1, searchQuery }"
        @click="page++"
        g-target="#items"
        g-swap="prepend"
        g-noscroll
        g-router-spin
    >
        Load more posts
    </button>
</div>
```

Router clicks are captured before the scope's bubbling `@click` handler. The request therefore evaluates `page + 1`, while `@click="page++"` advances local state for the next request.

This is a good example of where `g-router-link` is more expressive than a normal anchor.

### Example 6: Persist a mini player across pages

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

The same DOM node is detached, parked, then reattached, so media playback can survive navigation.

### Example 7: Morph between similar pages

```html
<div id="app" g-outlet g-snapshot class="morph-a">
    <main>
        <div class="card" tabindex="0">
            <h3>Card A</h3>
            <input type="text" value="Try typing here">
        </div>

        <p>
            <a href="/morph-b.html" g-swap="morph">Morph to B</a>
        </p>
    </main>
</div>
```

Use this pattern when the next page is almost the same page with adjusted structure or data, not a completely different screen.

---

## Snapshots And History

Snapshots are a distinct feature, not just a cache detail.

### What gets saved

When the current target has `g-snapshot`, GyosJS stores the incoming page HTML after removing the text content of any `g-script-once` scripts.

The snapshot key ignores the hash part of the URL.

### What happens on back/forward

On `popstate`, GyosJS:

- checks for a saved snapshot for the URL without the hash
- restores it immediately if present
- otherwise performs a normal fetch without changing history again

### Why this matters

It improves:

- perceived speed on back/forward
- layout continuity
- state restoration for document content

But remember:

- snapshots are tied to targets that have `g-snapshot`
- `g-script-once` inline code will not run again from snapshot restore

### Example

```html
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <a href="/home.html">Home</a>
        <a href="/posts.html">Posts</a>
    </div>
</body>
```

This is usually enough. You do not need to manage snapshots manually.

---

## Scroll Behavior

GyosJS uses manual scroll restoration.

Current behavior for a navigation is:

1. if the trigger has `g-noscroll`, do nothing
2. else if the final URL has a hash and the element exists, smooth scroll to it
3. else if saved scroll exists, restore it
4. else smooth scroll to top

This creates a good default for MPA-style page transitions.

### Example: preserve position during partial load

```html
<button
    g-router-link="/posts-item.html"
    g-router-method="GET"
    g-target="#items"
    g-swap="append"
    g-noscroll
>
    Append more without jumping
</button>
```

---

## Redirects, Errors, And Fallbacks

A real app needs to know what happens when things are not ideal.

### Redirects

If the fetch resolves with a redirected response, GyosJS uses `response.url` as the final navigation URL.

For a non-`GET` submission, a redirect also changes browser history to that final URL. A non-redirected validation response does not change the URL unless you explicitly use `g-change-state`.

### Request failures

If fetch fails, GyosJS falls back to `window.location.href = finalUrl`.

This is important:

- you still reach the destination
- boost is an enhancement, not a hard dependency
- the outgoing target is not unmounted before the fallback begins

### Non-OK responses

If the response is missing or not OK, GyosJS also falls back to a normal full navigation.

### Aborted navigations

If a second navigation starts before the first one finishes, the earlier one is aborted.

That means:

- the latest user action wins
- stale responses cannot commit over newer intent, even when a preloaded request or fetch implementation does not stop immediately after abort
- an older navigation cannot clear the progress state owned by the newer navigation

---

## Caveats And Edge Cases

These are not bugs in your app. They are part of the current router contract and worth designing around.

### 1. `g-target` points to the current document, not the response

The selector in `g-target` is resolved against the live page first. Then the response fragment is chosen to match that target.

So you should think of `g-target` as:

- “which live element should be updated?”

not:

- “which element should be queried inside the response?”

### 2. `append` and `prepend` use child nodes of the source fragment

If the source fragment is:

```html
<div id="items">
    <article>One</article>
    <article>Two</article>
</div>
```

then `append` and `prepend` add the `article` nodes, not the wrapper itself.

Existing target scopes remain mounted during these additive swaps. GyosJS mounts only newly inserted scope roots, and only incoming scripts are considered for execution. This is the lifecycle expected by load-more and infinite-scroll interfaces.

### 3. `morph` is intentionally simple

The current morph logic keys elements by:

- tag name
- `id`
- `data-gyos-persist-id`
- `data-gyos-key`

This works well for similar trees. It is not designed to reconcile radically different layouts.

### 4. Same-page hash links are left alone

Links that act like same-document hash jumps are not treated as boosted navigations. The browser keeps handling that case naturally.

### 5. Partial updates still need stable server HTML

Even though GyosJS is flexible, partial flows are easiest when the server returns markup with:

- a stable `id`
- a stable target wrapper
- predictable nesting

### 6. `g-current-head` only controls global-outlet head updates

It skips title/head replacement when the selected target is the first global outlet. Local fragment targets already preserve the head. In both cases, scripts inside swapped content still follow normal execution rules.

### 7. A missing persist placeholder does not destroy the island

If page B does not contain an element or comment placeholder for a parked island, GyosJS keeps that island alive in its hidden parking container. If page C later provides the same key, the original DOM node is inserted there. Use explicit keys such as `g-persist="player"`; generated keys are not a readable cross-page contract.

### 8. `noscript` is a full-load fallback, not Boost content

You may keep `noscript` fallbacks in server-rendered pages for visitors without JavaScript. During a boosted navigation, GyosJS strips them from the fetched document before selecting or swapping an outlet.

Do not depend on `noscript` children being present after Boost, and do not place application state inside them. `g-ignore` is unrelated: it controls GyosJS template initialization after nodes exist, while destination parsing happens before that boundary can apply.

---

## Recommended Patterns

For most real apps, these patterns are the most reliable:

### Full-page MPA shell

```html
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        ...
    </div>
</body>
```

Use this for the main app surface.

### Sidebar or modal region

```html
<button
    g-router-link="/sidebar.html"
    g-router-method="GET"
    g-target="#sidebar"
    g-swap="morph"
>
    Load panel
</button>
```

Use this for local region updates.

### Feed expansion

```html
<button
    g-router-link="/feed-page-2.html"
    g-router-method="GET"
    g-target="#feed"
    g-swap="append"
    g-noscroll
>
    More
</button>
```

Use this for additive list content.

### Long-lived island

```html
<div g-persist="player">
    <audio controls src="/audio/theme.mp3"></audio>
</div>
```

Use this sparingly and intentionally.

---

## A Good Mental Model

The most useful mental model for GyosJS MPA boost is this:

> Your server is still responsible for HTML. GyosJS is responsible for deciding when it is safe to fetch, extract, swap, preserve, and remount that HTML inside the current document.

If you design around that model, the feature feels very predictable:

- pages stay server-first
- links and forms stay normal
- partial regions become practical
- history and back/forward keep working
- persistent UI is possible without a full SPA shell

---

## Read Next

- [Layouts, Scripts, and Lifecycle](./layouts-scripts-lifecycle.md)
- [Best Practices](./best-practices.md)
- [Examples](./examples.md)
