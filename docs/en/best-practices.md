# Best Practices

This page is for developers using GyosJS to build real pages, not for contributors working on the internals.

The main question behind every best practice in GyosJS is simple:

> Will another developer understand what problem this page solves, and why GyosJS is helping here?

GyosJS works best when HTML stays honest, scopes stay small, and the server remains the source of truth for page content. If you follow that model, you get a pleasant mix of server-rendered HTML, reactive UI, and MPA navigation without turning everything into a heavy SPA.

This guide focuses on practical decisions:

- how to structure scopes
- how to build an MPA layout
- when to use partial swaps
- what should persist across navigation
- how forms should behave
- how to keep scripts predictable
- how to keep the project maintainable over time

---

## The Core Mindset

The shortest version of GyosJS best practices is this:

- server returns meaningful HTML
- `g-scope` enhances local UI behavior
- `g-boost` upgrades normal links and forms
- `g-target` swaps only the region that truly needs to change
- `g-persist` keeps only a few intentional long-lived islands alive
- scripts are treated carefully so navigation stays predictable

If a page is hard to reason about without JavaScript, it is usually a sign that the GyosJS layer is doing too much.

---

## 1. Keep HTML As The Source Of Truth

A good GyosJS page still looks like HTML a backend developer can understand.

Bad direction:

- hiding all behavior behind large opaque scripts
- building a pseudo-SPA shell and forcing every page into it
- returning incomplete partial data that only works after custom client-side repair

Better direction:

- return real links and real forms
- let server-rendered HTML stay canonical
- use GyosJS to add reactivity and smoother navigation

Example:

<div g-scope="{ query: '' }" class="card">
    <label>Search posts</label>
    <input g-model="query" placeholder="Type a keyword" />
    <p>Preview: {query || 'Nothing yet'}</p>
    <a :href="'/posts?query=' + encodeURIComponent(query || '')">Open full results page</a>
</div>

Why this is a best practice:

- the input preview is reactive and immediate
- the final navigation still goes to a real URL
- the server can render the same results page even if JavaScript is disabled
- another developer can read the markup and understand the user journey quickly

---

## 2. Keep Scope Boundaries Small And Obvious

`g-scope` should usually describe one UI concern, not the whole page.

Good scope boundaries:

- one search box
- one filter panel
- one cart preview
- one profile form
- one comments list

Risky scope boundaries:

- one giant page-wide object that contains everything
- unrelated widgets sharing the same local state
- huge inline scope objects with many methods and nested branches

### Prefer focused scopes

<section class="card" g-scope="{ open: false }">
    <button @click="open = !open">
        {open ? 'Hide filters' : 'Show filters'}
    </button>

    <div *if="open">
        <p>Only this filter box cares about `open`.</p>
    </div>
</section>

<section class="card" g-scope="{ copied: false }">
    <button
        @click="
            navigator.clipboard.writeText('https://example.com/share');
            copied = true;
            setTimeout(() => copied = false, 1200);
        ">
        {copied ? 'Copied' : 'Copy link'}
    </button>
</section>

Why this is a best practice:

- each scope has a single responsibility
- state names stay meaningful
- unmounting and remounting stay predictable
- partial swaps affect fewer moving parts

### Move larger logic into `Gyos.scope()`

Inline objects are perfect when the behavior is short. Once the object becomes hard to scan, give it a name.

<div g-scope="CheckoutSummary" class="card">
    <h3>Checkout summary</h3>
    <p>Subtotal: ${subtotal.toFixed(2)}</p>
    <p>Shipping: ${shipping.toFixed(2)}</p>
    <p><strong>Total: ${total.toFixed(2)}</strong></p>
    <button :disabled="busy" @click="applyCoupon">
        {busy ? 'Applying...' : 'Apply coupon'}
    </button>
</div>

<script>
    Gyos.scope('CheckoutSummary', {
        subtotal: 96,
        shipping: 8,
        busy: false,
        get total() {
            return this.subtotal + this.shipping;
        },
        async applyCoupon() {
            this.busy = true;
            await new Promise(resolve => setTimeout(resolve, 700));
            this.shipping = 0;
            this.busy = false;
        }
    });
</script>

Why this is a best practice:

- the template stays readable
- methods have clear names
- the same scope can be reused across pages
- later refactors do not turn attributes into a wall of logic

---

## 3. Write Templates For Reading First

GyosJS templates are expressive, but that does not mean every expression should become clever.

Prefer:

- short bindings
- meaningful getters and methods
- clear `*if` and `*for` usage
- stable `g-key` values when identity matters

### Good

<div g-scope="{
    items: [
        { id: 1, name: 'Monitor', stock: 12 },
        { id: 2, name: 'Keyboard', stock: 0 }
    ]
}" class="card">
    <ul>
        <li *for="item in items" g-key="item.id">
            {item.name}
            <strong>{item.stock > 0 ? 'In stock' : 'Sold out'}</strong>
        </li>
    </ul>
</div>

### Better than hiding too much logic inline

<div g-scope="ProductRow" class="card">
    <p>{name}</p>
    <p>{stockLabel}</p>
    <button :disabled="!canBuy" @click="addToCart">Add to cart</button>
</div>

<script>
    Gyos.scope('ProductRow', {
        name: 'Mechanical Keyboard',
        stock: 3,
        get canBuy() {
            return this.stock > 0;
        },
        get stockLabel() {
            return this.stock > 0 ? `${this.stock} left` : 'Out of stock';
        },
        addToCart() {
            if (!this.canBuy) return;
            this.stock--;
        }
    });
</script>

Why this is a best practice:

- another developer can read the template without decoding business logic
- the DOM updates stay targeted and cheap
- complex conditions move into named properties instead of becoming unreadable one-liners

---

## 4. Choose The Right State Tool

Not every reactive value should live in the same place.

### Use local scope state for local UI

Use `g-scope` when state belongs to one widget or one page section.

<div g-scope="{ tab: 'details' }" class="card">
    <nav>
        <button @click="tab = 'details'">Details</button>
        <button @click="tab = 'reviews'">Reviews</button>
    </nav>

    <div *if="tab === 'details'">Product details here.</div>
    <div *if="tab === 'reviews'">Product reviews here.</div>
</div>

### Use stores only when multiple scopes truly share state

<div class="card" g-scope="{ cart: Gyos.store('CartStore') }">
    <p>Header cart count: {cart.count}</p>
</div>

<div class="card" g-scope="{ cart: Gyos.store('CartStore') }">
    <button @click="cart.count++">Add one item</button>
    <p>Sidebar cart count: {cart.count}</p>
</div>

<script g-script-once>
    Gyos.store('CartStore', {
        count: 0
    });
</script>

Why this is a best practice:

- stores are used only where sharing is real
- page-local concerns remain local
- the project avoids turning every value into global state

### Use low-level signals when logic is outside template-driven scopes

That usually means utilities, cross-page reactive helpers, or advanced integrations. For normal page authoring, `g-scope` and store state are easier to maintain.

---

## 5. Build MPA Pages Around Real Layout Contracts

GyosJS MPA boost works best when your layout is intentional.

At minimum:

- a real page URL per screen
- `g-boost` where navigation should be upgraded
- one stable `g-outlet`
- optional `g-snapshot` when you want history restoration

### A practical layout shell

The following example is a fuller MPA website pattern for a docs, blog, or product site. It mixes:

- normal navigation
- one stable outlet
- a persisted mini cart
- a targeted sidebar swap
- a GET search form
- a POST newsletter form

Full page structure:

```html
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <header class="site-header">
            <a href="/home.html">Home</a>
            <a href="/catalog.html" g-preload>Catalog</a>
            <a href="/guides.html" g-preload>Guides</a>
            <a href="/contact.html">Contact</a>

            <div g-scope="{ mobileOpen: false }" class="mobile-nav">
                <button @click="mobileOpen = !mobileOpen">
                    {mobileOpen ? 'Close menu' : 'Open menu'}
                </button>
                <nav *if="mobileOpen">
                    <a href="/home.html">Home</a>
                    <a href="/catalog.html">Catalog</a>
                    <a href="/guides.html">Guides</a>
                    <a href="/contact.html">Contact</a>
                </nav>
            </div>
        </header>

        <main class="layout">
            <aside id="filters" class="card">
                <h3>Catalog filters</h3>

                <form
                    action="/catalog-filters.html"
                    method="get"
                    g-target="#filters"
                    g-swap="morph"
                    g-current-head>
                    <label>Category</label>
                    <select name="category">
                        <option value="">All</option>
                        <option value="ui">UI</option>
                        <option value="audio">Audio</option>
                        <option value="desk">Desk setup</option>
                    </select>

                    <label>Only available</label>
                    <input type="checkbox" name="available" value="1" />

                    <button type="submit">Apply filters</button>
                </form>
            </aside>

            <section class="content">
                <article class="card" g-scope="CatalogPage">
                    <h1>Catalog</h1>
                    <p>{intro}</p>

                    <form
                        action="/catalog-search.html"
                        method="get"
                        g-target="#results"
                        g-swap="inner"
                        g-current-head
                        g-scope="{ q: '' }">
                        <label>Search products</label>
                        <input
                            name="q"
                            g-model.debounce="q"
                            placeholder="Search by product name" />
                        <p>Preview query: {q || 'Type to search'}</p>
                        <button type="submit">Search</button>
                    </form>

                    <div id="results">
                        <div class="card">
                            <h3>Mechanical Keyboard</h3>
                            <p>Server-rendered product card.</p>
                        </div>
                        <div class="card">
                            <h3>Studio Headphones</h3>
                            <p>Another server-rendered product card.</p>
                        </div>
                    </div>

                    <button
                        g-router-link="/catalog-more.html"
                        g-router-method="GET"
                        g-router-params="%7Bpage%7D"
                        g-target="#results"
                        g-swap="append"
                        g-current-head
                        g-router-spin
                        @click="page++">
                        Load more
                    </button>
                </article>

                <section class="card">
                    <h2>Newsletter</h2>
                    <form action="/newsletter-success.html" method="post" g-boost>
                        <label>Email</label>
                        <input type="email" name="email" required />
                        <button type="submit">Subscribe</button>
                    </form>
                </section>
            </section>
        </main>

        <aside g-persist="mini-cart" class="mini-cart">
            <div g-scope="{ count: 2, open: false }" class="card">
                <button @click="open = !open">
                    Cart ({count})
                </button>
                <div *if="open">
                    <p>Your cart stays alive across boosted navigation.</p>
                    <a href="/cart.html">Open cart</a>
                </div>
            </div>
        </aside>

        <footer class="site-footer">
            <p>Built with server-rendered HTML plus GyosJS enhancement.</p>
        </footer>
    </div>
</body>

<script>
    Gyos.scope('CatalogPage', {
        page: 1,
        intro: 'Browse products with real URLs, real forms, and targeted partial updates.'
    });
</script>
```

Why this is a best practice:

- the page still works as an MPA
- links and forms keep meaningful endpoints
- only the filter sidebar and results region swap when needed
- the main outlet stays stable
- the cart is explicitly marked as a long-lived island
- page-local reactive behavior stays local instead of becoming global

---

## 6. Use Partial Swaps For Real Fragments, Not For Everything

`g-target` is one of the most useful router features in GyosJS. It is also one of the easiest to misuse.

Use partial swaps when:

- one sidebar needs new server-rendered content
- one search results list needs to update
- one feed needs append or prepend behavior
- one settings panel should refresh without replacing the whole page

Do not use partial swaps just because they feel more advanced. If the whole page meaningfully changes, a normal outlet swap is often simpler.

### Good partial swap example

<div class="layout">
    <aside id="sidebar" class="card">
        <h3>Profile sidebar</h3>
        <p>Account details loaded from the server.</p>
    </aside>

    <section class="card">
        <h2>Profile</h2>
        <p>This page can update the sidebar without replacing the whole page.</p>

        <a
            href="/profile-sidebar.html"
            g-target="#sidebar"
            g-swap="morph"
            g-current-head>
            Refresh sidebar details
        </a>
    </section>
</div>

Why this is a best practice:

- the target region is small and obvious
- the partial target automatically leaves page-level head and layout scripts unchanged
- `g-current-head` documents that intent explicitly
- `morph` is used on similar markup where preserving state can help

### A realistic "load more" pattern

<div class="card" g-scope="{ page: 1 }">
    <h3>Recent posts</h3>
    <div id="post-items">
        <article class="card">Post 1</article>
        <article class="card">Post 2</article>
    </div>

    <button
        g-router-link="/posts-item.html"
        g-router-method="GET"
        g-router-params="%7Bpage%7D"
        g-target="#post-items"
        g-swap="prepend"
        g-current-head
        g-router-spin
        @click="page++">
        Load more posts
    </button>
</div>

Why this is a best practice:

- the server still renders the new post HTML
- the client only decides where to insert it
- `prepend` matches the user experience being requested
- existing list scopes remain mounted and only the incoming items mount
- the page avoids a custom fetch-and-template layer

### Choosing the swap mode

Use `inner` when:

- the target container stays the same
- you want to replace the inside of that region

Use `replace` when:

- the target element itself should be replaced
- the incoming markup is structurally different

Use `append` or `prepend` when:

- loading lists, feeds, or comments

Use `morph` when:

- old and new markup are intentionally similar
- preserving focus or element identity matters

Best-practice rule:

> Start with `inner` or `replace`. Reach for `morph` only when you can explain exactly what continuity you want to preserve.

---

## 7. Persist Only What Should Truly Survive Navigation

`g-persist` is powerful because it lets an MPA keep a live island alive across navigation. That does not mean many parts of the page should be persisted.

Good candidates:

- media players
- mini carts
- floating chat widgets
- timers
- compact monitoring panels

Poor candidates:

- the whole main content area
- ordinary content cards
- large unrelated layout sections
- things that are easier to re-render from the server

### Good `g-persist` example

<div g-persist="player" class="card">
    <div g-scope="{ playing: false, title: 'Ambient Focus Mix' }">
        <h3>{title}</h3>
        <button @click="playing = !playing">
            {playing ? 'Pause' : 'Play'}
        </button>
        <p>{playing ? 'Playing across navigation...' : 'Ready'}</p>
    </div>
</div>

Why this is a best practice:

- the persisted island has a clear reason to exist
- it is small and independent
- the rest of the page can swap freely without surprising lifecycle issues

### Placeholder pattern for another page

When the persisted island should appear in the same visual place on another page, use a placeholder:

```html
<!-- g-persist:player -->
```

Why this is a best practice:

- page layouts remain consistent
- the router has a clear place to reinsert the live element
- navigation stays predictable across screens

If an intermediate page intentionally has no placeholder, the island stays alive in GyosJS's parking container. A later page can restore it with the same key. This is useful, but it should be intentional: a missing placeholder also means the user cannot see or interact with that island on the intermediate page.

---

## 8. Prefer Honest Forms Over Custom JavaScript Submission

GyosJS shines when forms remain real HTML forms first.

That means:

- use `action`
- use `method`
- let the server validate
- use `g-model` for convenience, not as a replacement for backend rules

### GET form for search or filters

<div class="card" g-scope="{ q: '', category: 'all' }">
    <form action="/search.html" method="get">
        <label>Keyword</label>
        <input name="q" g-model.trim="q" placeholder="Search docs" />

        <label>Category</label>
        <select name="category" g-model="category">
            <option value="all">All</option>
            <option value="guides">Guides</option>
            <option value="api">API</option>
        </select>

        <p>Searching for: {q || 'everything'} in {category}</p>
        <button type="submit">Search</button>
    </form>
</div>

Why this is a best practice:

- the browser URL stays shareable
- the server can render the same filtered page
- the preview improves UX without breaking the normal form contract

### POST form for actions

<div class="card" g-scope="{ saving: false }">
    <form
        action="/profile/save.html"
        method="post"
        g-boost
        @submit="saving = true">
        <label>Display name</label>
        <input type="text" name="displayName" required />

        <label>Bio</label>
        <textarea name="bio"></textarea>

        <button type="submit">
            {saving ? 'Saving...' : 'Save profile'}
        </button>
    </form>
</div>

Why this is a best practice:

- the form remains normal HTML
- optimistic UI is tiny and local
- the server still owns success and error responses

### Keep form shape explicit when it matters

For simple forms, GyosJS can infer fields through `g-model`. For larger forms, predeclaring the state is easier to maintain.

<div g-scope="{
    form: {
        fullName: '',
        email: '',
        agree: false
    }
}" class="card">
    <input g-model.trim="form.fullName" placeholder="Full name" />
    <input g-model.trim="form.email" type="email" placeholder="Email" />
    <label>
        <input g-model="form.agree" type="checkbox" />
        I agree to the terms
    </label>

    <p>{JSON.stringify(form)}</p>
</div>

Why this is a best practice:

- the data contract is visible immediately
- validation and submission logic are easier to evolve
- teammates do not have to guess what fields exist

### Be deliberate with `.trim` and `.debounce`

`g-model.trim` is useful for search boxes, email inputs, and fields where whitespace should not matter. For IME-heavy text entry or editors, trimming on every change may feel too aggressive.

`g-model.debounce` is useful when:

- search should not submit on every keystroke
- previews or remote suggestions should wait briefly
- a heavy expression depends on a text input

---

## 9. Treat Scripts As Part Of Navigation Design

In boosted MPA navigation, script behavior matters. A page can look correct and still behave badly if scripts re-run unexpectedly or assume a full reload every time.

### Use `g-script-once` for setup that must not run twice

<script g-script-once>
    window.analyticsBooted = window.analyticsBooted || false;

    if (!window.analyticsBooted) {
        console.log('Boot analytics once');
        window.analyticsBooted = true;
    }
</script>

Best for:

- global store setup
- one-time analytics bootstrapping
- singleton listeners
- cross-page helpers

Why this is a best practice:

- repeated navigation does not duplicate setup
- global state remains stable
- pages avoid "already defined" script errors

### Keep page-specific behavior close to the page

<div g-scope="{
    seconds: 0,
    timerId: null,
    onMount() {
        this.timerId = setInterval(() => this.seconds++, 1000);
    },
    onUnmount() {
        clearInterval(this.timerId);
    }
}" class="card">
    <p>Time on this page: {seconds}s</p>
</div>

Why this is a best practice:

- page behavior lives with the page markup
- cleanup is explicit
- boosted navigation does not leak timers and listeners

### Use script wrapping intentionally

If a script needs an isolated execution context across page updates, `g-script-wrap` is useful.

```html
<script g-script-wrap>
    console.log('This page-level script runs in its wrapped context');
</script>
```

Why this is a best practice:

- script execution stays predictable
- page-specific code is less likely to leak variables globally

### Best-practice script rule

Ask this before adding any script:

1. should this run once for the whole site?
2. should this run each time this page or fragment appears?
3. what must be cleaned up when the element disappears?

If those answers are unclear, the script design is usually not ready.

---

## 10. Be Explicit About Routing Intent

GyosJS router features are most maintainable when the markup explains the intention directly.

### Prefer normal links first

<a href="/posts.html">Posts</a>

With `g-boost` on the body, this already becomes a boosted navigation candidate. You do not need a custom click handler for ordinary page navigation.

Why this is a best practice:

- links remain copyable and inspectable
- browser behavior stays familiar
- the codebase does not fill up with unnecessary custom navigation logic

### Use `g-router-link` when there is no natural anchor or form

<button
    g-router-link="/notifications-panel.html"
    g-router-method="GET"
    g-target="#notifications-panel"
    g-swap="inner"
    g-current-head>
    Refresh notifications
</button>

Why this is a best practice:

- it keeps the router contract declarative
- it is clearer than wiring a manual fetch flow
- the button clearly communicates that it updates one fragment

### Use `g-current-head` for fragment updates

If you only swap a sidebar or result list, GyosJS keeps the current page head automatically. Keeping `g-current-head` on the trigger can still be a useful project convention because it makes the intended navigation boundary obvious during review.

Why this is a best practice:

- the title and head metadata remain stable during fragment-level refreshes by router contract
- fragment endpoints can still return full HTML safely
- future target changes are easier to review because the trigger states its head policy

---

## 11. A Maintainable GyosJS Project Has Clear Conventions

GyosJS is flexible. Teams should narrow that flexibility with project-level conventions.

Good conventions to define:

- when inline `g-scope` is acceptable
- when a scope must move into `Gyos.scope()`
- naming for stores
- naming for events
- when `g-target` is allowed
- which swap mode is the default
- which widgets are allowed to use `g-persist`

### Example team conventions

- inline `g-scope` is allowed up to roughly 10 to 15 lines
- `g-swap="inner"` is the default for fragment updates
- `g-swap="morph"` requires a comment or obvious reason
- `g-persist` is allowed only for cart, audio player, and chat launcher
- form submission always uses real `action` and `method`

Why this is a best practice:

- teammates make fewer accidental architecture decisions
- docs stay aligned with the codebase
- review becomes easier because expectations are shared

---

## 12. A Full Example With Commentary

This section combines many of the practices above into one longer example. It is intentionally compact enough to read, but realistic enough to reuse as a starting point.

```html
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <header class="site-header">
            <a href="/docs/home.html">Docs home</a>
            <a href="/docs/guides.html" g-preload>Guides</a>
            <a href="/docs/api.html" g-preload>API</a>
            <a href="/docs/contact.html">Contact</a>
        </header>

        <main class="layout">
            <aside id="guide-sidebar" class="card">
                <h3>Guide navigation</h3>
                <ul>
                    <li><a href="/docs/guides/intro.html" g-target="#guide-content" g-current-head>Introduction</a></li>
                    <li><a href="/docs/guides/forms.html" g-target="#guide-content" g-current-head>Forms</a></li>
                    <li><a href="/docs/guides/router.html" g-target="#guide-content" g-current-head>Router</a></li>
                </ul>
            </aside>

            <section id="guide-content" class="card" g-scope="GuidePage">
                <h1>{title}</h1>
                <p>{summary}</p>

                <div class="card">
                    <form
                        action="/docs/search.html"
                        method="get"
                        g-target="#search-results"
                        g-swap="inner"
                        g-current-head
                        g-scope="{ q: '' }">
                        <input
                            name="q"
                            g-model.debounce="q"
                            placeholder="Search this documentation" />
                        <p>Live query: {q || 'Nothing yet'}</p>
                        <button type="submit">Search docs</button>
                    </form>
                </div>

                <div id="search-results">
                    <article class="card">
                        <h3>Search results appear here</h3>
                        <p>Returned by the server and swapped into this region.</p>
                    </article>
                </div>

                <button
                    g-router-link="/docs/more-guides.html"
                    g-router-method="GET"
                    g-router-params="%7Bpage%7D"
                    g-target="#search-results"
                    g-swap="append"
                    g-current-head
                    g-router-spin
                    @click="page++">
                    Load more guides
                </button>
            </section>
        </main>

        <div g-persist="floating-help" class="floating-help">
            <div g-scope="{ open: false }" class="card">
                <button @click="open = !open">
                    {open ? 'Hide help' : 'Need help?'}
                </button>

                <div *if="open">
                    <p>This support widget stays mounted while you move around the docs.</p>
                    <a href="/docs/contact.html">Contact support</a>
                </div>
            </div>
        </div>
    </div>
</body>

<script g-script-once>
    Gyos.store('DocsUserPrefs', {
        fontSize: 'normal'
    });
</script>

<script>
    Gyos.scope('GuidePage', {
        title: 'GyosJS Best Practices',
        summary: 'Build small scopes, return real HTML, and let partial swaps stay intentional.',
        page: 1
    });
</script>
```

Why this is a best practice:

- the whole page still behaves like an MPA
- docs navigation has real URLs
- only guide content and search results swap when appropriate
- long-lived help UI is intentionally persisted
- one-time setup is isolated with `g-script-once`
- page-specific state lives in one named scope

---

## 13. Common Mistakes To Avoid

### One huge root scope

This usually creates:

- unreadable templates
- accidental coupling between widgets
- harder cleanup during swaps

### Using `g-persist` as a workaround for unclear architecture

If many page sections "need" persistence, the real problem is often page structure or state design.

### Using `morph` everywhere

`morph` is useful, but it should be chosen because continuity matters, not because it sounds more advanced.

### Replacing normal links with manual JavaScript navigation

If an anchor can express the intent, keep the anchor.

### Letting scripts accumulate side effects

Any page-level timer, listener, observer, or global variable should have a clear lifecycle story.

### Treating fragment endpoints like JSON APIs

GyosJS router works very well with HTML fragments and full HTML pages. Lean into that instead of rebuilding an API-driven client renderer for no reason.

---

## 14. A Practical Checklist

Before shipping a GyosJS page, check:

- does the page still make sense as server-rendered HTML?
- are links and forms real links and forms?
- are scope boundaries easy to explain?
- is the chosen swap mode obvious and justified?
- is `g-target` limited to clearly scoped regions?
- is every persisted island small and intentional?
- do scripts have the right once-per-site or once-per-page behavior?
- can another developer understand the flow by reading the markup?
- do all template expressions come from trusted application source rather than user data?
- are `g-html`, Markdown, bound URLs, and boosted endpoints fed only data appropriate for those sinks?

If the answer is yes, you are probably using GyosJS in the way it is strongest.

### Security boundary

GyosJS template expressions, inline `g-scope`, `gm-*`, event expressions, and `g-router-params` are executable JavaScript from trusted application templates. They are not a sandbox and must never be generated from user-controlled strings. Because this implementation uses `Function()`, a strict Content Security Policy without `unsafe-eval` is not currently compatible.

`g-html` is the explicit raw-HTML escape hatch and requires application-level sanitization. `g-markdown` escapes raw HTML and blocks active URL schemes, but applications should still apply their own content policy for untrusted rich text. Bound `href` and `src` values reject active schemes and active-content elements; validate destination URLs on the server as well.

MPA Boost accepts only same-origin HTML responses and rejects attachment responses. Use `g-no-boost` for API, download, or user-uploaded-content links that should retain native browser behavior. Once a non-GET request is dispatched, GyosJS never replays it as a fallback.

---

## Related Reading

- [What is G-Scope?](./what-is-gscope.md)
- [Reactivity & Signals](./reactivity-signals.md)
- [Template Syntax](./template-syntax.md)
- [MPA Boost Deep Dive](./mpa-boost-deep-dive.md)
- [Layouts, Scripts, and Lifecycle](./layouts-scripts-lifecycle.md)
- [Tutorial Guide](./tutorial-guide.md)
