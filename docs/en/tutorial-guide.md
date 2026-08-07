# Tutorial Guide

This guide is for developers who want to understand how GyosJS solves real interface problems, not just memorize directives one by one.

It has two major parts:

1. Build one practical UI with a single scope and see how far the HTML-first model can go.
2. Extend the same mindset to MPA navigation with `g-boost`, `g-outlet`, partial swaps, and persisted islands.

If you are reading this page inside the GyosJS docs site, the inline HTML examples should work directly. If you are copying them into a standalone page, load GyosJS first.

```html
<script src="https://cdn.jsdelivr.net/npm/gyosjs@0.1.2/dist/gyos.auto.min.js"></script>
```

## Part 1. Build One Practical UI With One Scope

### The problem

Imagine you have a service business site and you want one page where a user can draft a quote before contacting you.

You need to solve a few common UI problems at once:

- keep form fields and UI text in sync
- let the user add and remove quote lines
- calculate totals without manual DOM updates
- show warnings only when they matter
- keep everything readable in HTML

This is a good fit for a single GyosJS scope because the state is local to one part of the page.

### What we will build

We will build a quote draft panel with:

- customer information
- a service list
- line items
- live subtotal, discount, and total
- validation and submit state

The important point is not the design. The important point is that one scope keeps the entire interaction model together.

### Example: a working quote draft scope

```html
<div g-scope="QuoteDraftGuideScope" class="card card-body">
    <div style="display:grid;gap:16px;">
        <div>
            <h3 style="margin:0 0 8px;">Project Quote Draft</h3>
            <p style="margin:0;color:#666;">
                A single scope keeps local state, list operations, derived totals, and validation together.
            </p>
        </div>

        <form @submit.prevent="submitDraft" g-no-boost style="display:grid;gap:16px;">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
                <label style="display:grid;gap:6px;">
                    <span>Client name</span>
                    <input class="input" g-model.trim="clientName" placeholder="Acme Studio" />
                </label>

                <label style="display:grid;gap:6px;">
                    <span>Contact email</span>
                    <input class="input" g-model.trim="clientEmail" placeholder="team@acme.test" />
                </label>

                <label style="display:grid;gap:6px;">
                    <span>Discount (%)</span>
                    <input class="input" type="number" min="0" max="50" g-model.number="discountPercent" />
                </label>
            </div>

            <div style="display:grid;gap:10px;">
                <div *for="line, index in lines" g-key="line.id" style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:10px;align-items:end;">
                    <label style="display:grid;gap:6px;">
                        <span>Service</span>
                        <input class="input" g-model.trim="line.label" placeholder="Landing page review" />
                    </label>

                    <label style="display:grid;gap:6px;">
                        <span>Hours</span>
                        <input class="input" type="number" min="1" g-model.number="line.hours" />
                    </label>

                    <label style="display:grid;gap:6px;">
                        <span>Rate</span>
                        <input class="input" type="number" min="0" step="10" g-model.number="line.rate" />
                    </label>

                    <button class="btn btn-danger" type="button" @click="removeLine(index)">
                        Remove
                    </button>
                </div>
            </div>

            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button class="btn btn-primary" type="button" @click="addLine">
                    Add line item
                </button>
                <button class="btn btn-info" type="button" @click="loadStarterPack">
                    Load starter pack
                </button>
                <button class="btn btn-warning" type="button" @click="clearDraft">
                    Reset
                </button>
            </div>

            <label style="display:grid;gap:6px;">
                <span>Project note</span>
                <textarea class="input" rows="4" g-model="note"
                    placeholder="What problem should this quote solve?"></textarea>
            </label>

            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;display:grid;gap:8px;">
                <div><strong>Client:</strong> {clientName || 'Pending'} ({clientEmail || 'no email yet'})</div>
                <div><strong>Lines:</strong> {lines.length}</div>
                <div><strong>Subtotal:</strong> ${formatMoney(subtotal)}</div>
                <div><strong>Discount:</strong> ${formatMoney(discountAmount)}</div>
                <div><strong>Total:</strong> ${formatMoney(total)}</div>
                <div *if="overBudget" style="color:#b91c1c;">
                    Total is over the internal fast-approval threshold of $3,000.
                </div>
                <div *if="!canSubmit" style="color:#92400e;">
                    Add a client name, a valid email, and at least one non-empty line item before submitting.
                </div>
                <div *if="submittedMessage" style="color:#166534;">
                    {submittedMessage}
                </div>
            </div>

            <button class="btn btn-success" type="submit" :disabled="!canSubmit">
                Save quote draft
            </button>
        </form>
    </div>
</div>

<script g-script-once>
    Gyos.scope('QuoteDraftGuideScope', {
        clientName: '',
        clientEmail: '',
        note: '',
        discountPercent: 10,
        nextId: 3,
        lines: [
            { id: 1, label: 'Landing page review', hours: 4, rate: 90 },
            { id: 2, label: 'Content structure pass', hours: 6, rate: 75 }
        ],
        submittedMessage: '',

        get subtotal() {
            return this.lines.reduce(function(sum, line) {
                return sum + ((Number(line.hours) || 0) * (Number(line.rate) || 0));
            }, 0);
        },

        get discountAmount() {
            return this.subtotal * ((Number(this.discountPercent) || 0) / 100);
        },

        get total() {
            return Math.max(0, this.subtotal - this.discountAmount);
        },

        get overBudget() {
            return this.total > 3000;
        },

        get hasValidLines() {
            return this.lines.some(function(line) {
                return String(line.label || '').trim() && Number(line.hours) > 0;
            });
        },

        get canSubmit() {
            return String(this.clientName || '').trim()
                && String(this.clientEmail || '').includes('@')
                && this.hasValidLines;
        },

        addLine() {
            this.lines.push({
                id: this.nextId++,
                label: '',
                hours: 1,
                rate: 60
            });
            this.submittedMessage = '';
        },

        removeLine(index) {
            if (this.lines.length === 1) return;
            this.lines.splice(index, 1);
            this.submittedMessage = '';
        },

        loadStarterPack() {
            this.lines = [
                { id: 1, label: 'Homepage redesign', hours: 8, rate: 120 },
                { id: 2, label: 'CTA copy rewrite', hours: 3, rate: 85 },
                { id: 3, label: 'Analytics setup review', hours: 2, rate: 100 }
            ];
            this.nextId = 4;
            this.note = 'The quote should focus on conversion, not just layout changes.';
            this.submittedMessage = '';
        },

        clearDraft() {
            this.clientName = '';
            this.clientEmail = '';
            this.note = '';
            this.discountPercent = 10;
            this.lines = [
                { id: 1, label: 'Landing page review', hours: 4, rate: 90 },
                { id: 2, label: 'Content structure pass', hours: 6, rate: 75 }
            ];
            this.nextId = 3;
            this.submittedMessage = '';
        },

        formatMoney(value) {
            return Number(value || 0).toFixed(2);
        },

        submitDraft() {
            if (!this.canSubmit) {
                this.submittedMessage = '';
                return;
            }

            this.submittedMessage =
                'Quote draft saved for ' + this.clientName + ' at ' + new Date().toLocaleTimeString() + '.';
        }
    });
</script>
```

### Why this example matters

That example solves a real class of problems that often turns into repetitive plain JavaScript:

- multiple `querySelector` calls
- separate event listeners for every input
- manual text updates for totals
- custom list rendering code
- scattered validation checks

With GyosJS:

- the state lives where the UI lives
- repeated rows come from `*for`
- totals come from getters
- form values stay synced through `g-model`
- the submit button only cares about `canSubmit`

### What to notice in the example

#### 1. The scope is the local source of truth

The quote panel does not need a global store. Everything it needs is inside one scope:

- form fields
- list items
- methods
- derived values

That is usually the right first move in GyosJS. Start local. Expand only when multiple scopes truly need the same state.

#### 2. The template is mostly declarative

The HTML does not manually say:

- when to redraw the totals
- when to disable the submit button
- when to insert or remove DOM rows

It only declares relationships:

- `g-model` keeps inputs and state in sync
- `*for` repeats each line
- `*if` reveals warnings and success states
- `:disabled` follows `canSubmit`

#### 3. Getters keep derived state readable

Instead of storing duplicate values like `subtotal`, `discountAmount`, and `total` as separate mutable fields, the scope derives them from the real source data.

That matters in practice because the UI cannot drift out of sync as easily.

### A smaller inline-scope version

Not every feature needs a named scope. For tiny blocks, inline `g-scope` is often enough.

```html
<div g-scope="{
    plan: 'Starter',
    seats: 3,
    monthlyPrice: {
        Starter: 19,
        Growth: 49,
        Scale: 99
    },
    get total() {
        return (this.monthlyPrice[this.plan] || 0) * (Number(this.seats) || 0);
    }
}" class="card card-body">
    <h3 style="margin-top:0;">Inline scope example</h3>
    <label style="display:grid;gap:6px;">
        <span>Plan</span>
        <select class="input" g-model="plan">
            <option>Starter</option>
            <option>Growth</option>
            <option>Scale</option>
        </select>
    </label>

    <label style="display:grid;gap:6px;">
        <span>Seats</span>
        <input class="input" type="number" min="1" g-model.number="seats" />
    </label>

    <p style="margin-bottom:0;">
        Estimated monthly cost: <strong>${total}</strong>
    </p>
</div>
```

Use this style when:

- the state is tiny
- the methods are short
- the block is not reused anywhere else

Move to `Gyos.scope('Name', { ... })` when the object starts getting hard to scan in HTML.

### A practical checklist for local scope design

Before building a UI block with GyosJS, ask:

1. Is the state local to one section of the page?
2. Can the UI be described as data plus derived values?
3. Are the repeated DOM updates mostly predictable from state changes?

If the answer is yes, one scope is usually enough.

Good fits:

- filters
- quote forms
- dashboards with local widgets
- pricing panels
- settings sections
- comment composers

Less ideal fits for a single giant scope:

- the entire application shell
- unrelated page sections merged together
- state that should survive page-to-page navigation

## Part 2. Build MPA Navigation Patterns

GyosJS becomes much more interesting when the page is already server-rendered and you want navigation to feel faster without moving to a full SPA.

The router in GyosJS is attribute-driven. You keep normal links, normal forms, and real HTML responses. Then you decide which parts should be boosted.

### The minimum page contract

At minimum, a boosted page usually starts like this:

```html
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        ...
    </div>

    <script src="https://cdn.jsdelivr.net/npm/gyosjs@0.1.2/dist/gyos.auto.min.js"></script>
</body>
```

What this means:

- `g-boost` tells GyosJS to intercept eligible same-origin links and forms
- `g-outlet` marks the swap region
- `g-snapshot` allows history navigation to restore saved HTML snapshots

### Pattern 1: full-page boosted links

If your server already returns complete HTML pages, the first upgrade is simple.

`home.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>Home</title>
    <script src="https://cdn.jsdelivr.net/npm/gyosjs@0.1.2/dist/gyos.auto.min.js"></script>
</head>
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <nav>
            <a href="/home.html">Home</a>
            <a href="/pricing.html">Pricing</a>
            <a href="/contact.html">Contact</a>
        </nav>

        <main>
            <h1>Home</h1>
            <p>This is still a normal MPA page.</p>
        </main>
    </div>
</body>
</html>
```

`pricing.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>Pricing</title>
    <script src="https://cdn.jsdelivr.net/npm/gyosjs@0.1.2/dist/gyos.auto.min.js"></script>
</head>
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <nav>
            <a href="/home.html">Home</a>
            <a href="/pricing.html">Pricing</a>
            <a href="/contact.html">Contact</a>
        </nav>

        <main>
            <h1>Pricing</h1>
            <p>The router swaps the outlet instead of forcing a full reload.</p>
        </main>
    </div>
</body>
</html>
```

This is the simplest and often the highest-value starting point. Keep your server pages real. Let GyosJS improve the transition.

### Pattern 2: GET form search

Boosted forms are often the next useful pattern. A search form with method `GET` can update the page while still keeping a real URL.

```html
<body g-boost>
    <div id="app" g-outlet g-snapshot>
        <form action="/docs/search.html" method="GET">
            <input name="q" placeholder="Search docs" />
            <button type="submit">Search</button>
        </form>

        <main>
            <h1>Search results</h1>
            <p>Render the server result here.</p>
        </main>
    </div>
</body>
```

When the form is boosted:

- GyosJS builds the request
- merges form fields into the URL for `GET`
- fetches the next HTML
- swaps the outlet
- pushes history state by default for `GET`

This makes search, filters, and paginated lists feel much better without changing the backend contract.

### Pattern 3: partial swaps with `g-target`

Sometimes you do not want to replace the whole outlet. You only want one region to refresh.

This is where `g-target` becomes useful.

```html
<div class="layout">
    <aside id="sidebar">
        <h3>Filters</h3>
        <p>This sidebar can be replaced independently.</p>
    </aside>

    <main>
        <h1>Profile</h1>

        <a href="/profile/sidebar.html"
           g-target="#sidebar"
           g-swap="morph">
            Refresh sidebar
        </a>
    </main>
</div>
```

Important details:

- `g-target="#sidebar"` tells the router to swap only `#sidebar`
- the router first tries to find the same `id` in the incoming response
- local targets automatically keep the current document head and outside layout scripts
- `g-swap="morph"` is best when the new DOM is intentionally similar to the current DOM

Use this pattern for:

- sidebars
- dashboard cards
- result lists
- comment sections

### Pattern 4: load more without inventing a client-side API

`g-router-link` is useful when the trigger is not a normal anchor or form, or when you want partial behavior with explicit parameters.

```html
<div id="feed" g-scope="{ page: 1, tag: 'all' }">
    <div id="feed-items">
        <article>First article</article>
        <article>Second article</article>
    </div>

    <button
        g-router-link="/articles/page.html"
        g-router-method="GET"
        g-router-params="{ page: page + 1, tag }"
        g-target="#feed-items"
        g-swap="append"
        g-router-spin
        @click="page++">
        Load more
    </button>
</div>
```

What to notice here:

- `g-router-link` triggers router navigation even though the element is a button
- `g-router-method` sets the request method
- `g-router-params` sends evaluated scope data
- `g-target` narrows the swap to one region
- `append` is useful when the server returns the next page fragment
- router-link style partial requests do not change browser history by default
- router capture evaluates `page + 1` before the bubbling `@click="page++"` advances local state

This is a strong fit for:

- load more buttons
- filter side panels
- partial drill-down panels
- search result fragments

### Pattern 5: persisted islands

Some UI should survive navigation, even in an MPA.

The common example is a mini player:

```html
<div g-persist="player" g-scope="MiniPlayerGuide">
    <strong>{title}</strong>
    <audio controls src="/media/episode-1.mp3"></audio>
</div>

<script>
    Gyos.scope('MiniPlayerGuide', {
        title: 'Episode 1'
    });
</script>
```

Then another page can provide a placeholder:

```html
<!-- g-persist:player -->
```

During navigation, GyosJS detaches the persisted island, swaps the new content, then merges the island back in. This is one of the most important differences between GyosJS MPA boost and a simple fetch-and-replace script.

Use `g-persist` for narrow, intentional islands such as:

- audio or video players
- floating timers
- compact support widgets
- a mini cart that should not restart on every page

Avoid using it for large unrelated sections that should just re-render.

### Pattern 6: choose the right swap mode

GyosJS currently supports multiple swap strategies. Pick them based on the shape of the HTML you expect back.

`inner`

- replace the inner content of the target
- good default when the container should stay

`replace`

- replace the whole target element
- good when the server returns the full replacement block

`append`

- append incoming content into the target
- good for load-more lists

`prepend`

- prepend incoming content into the target
- good for newest-first feeds

`morph`

- try to preserve similar DOM structure while updating it
- good when the old and new markup are intentionally close
- not the right choice when the layout is completely different

### A practical MPA adoption order

If you are adding boosted navigation to an existing server-rendered app, the safest order is:

1. Add `g-boost` and `g-outlet` to a layout that already works with full page loads.
2. Enable normal link navigation first.
3. Boost simple `GET` forms like search and filter forms.
4. Introduce `g-target` only for regions that are clearly independent.
5. Add `g-router-link` for load-more or panel-refresh patterns.
6. Add `g-persist` only for the few islands that truly need continuity.

This order keeps the app understandable while you gain speed and smoother transitions.

### Common mistakes in MPA setups

#### Returning unpredictable HTML

If you use `g-target="#sidebar"`, return HTML that actually contains `#sidebar` when that route is meant to drive that partial swap.

#### Treating every partial like a full navigation

A sidebar refresh does not update the head when `g-target` resolves locally. Use `g-current-head` only when the first global outlet is intentionally changing while its current head must remain.

#### Using `morph` everywhere

`morph` is useful, but it is not magic. If the markup shape changes heavily, `replace` is usually easier to reason about.

#### Persisting too much

Persist only what should genuinely live across page transitions.

## Suggested next reading

- [MPA Boost Deep Dive](./mpa-boost-deep-dive.md)
- [Layouts, Scripts, and Lifecycle](./layouts-scripts-lifecycle.md)
- [Best Practices](./best-practices.md)
- [Migrate from Plain JavaScript](./migrate-from-javascript.md)
