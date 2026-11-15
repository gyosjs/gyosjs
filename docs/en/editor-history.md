# An editor with undo and redo

[Sumboard](https://github.com/hohphu8/sumboard) is a cost-planning app built with GyosJS. This recipe reduces its editing model to two prices: validate an edit, replace a snapshot, derive the total, and undo or redo the change.

For a small form, `Gyos.scope('Profile', { name: '', ... })` remains a good starting point: its fields already become reactive. Explicit signals help here because a controller owns document snapshots and history, while the scope adapts browser inputs and lifecycle. This is one application structure, not a new required way to write GyosJS.

## Run the small example

In a Vite vanilla JavaScript project, install the runtime:

```sh
npm install gyosjs@0.5.6
```

Put this markup in the body of `index.html`. Create `src/editor.js` with the JavaScript below, then start Vite. The manual CSP entry does not auto-mount: the final `Gyos.mountAll()` runs after registration and after the module's HTML has been parsed. Do not also load the auto build.

```html
<section g-scope="CostEditor">
  <div g-ref="keyboard" tabindex="0" aria-label="Cost editor">
    <ul>
      <li *for="row in rows()" g-key="row.id">
        <label>
          {row.name}
          <input type="text" inputmode="numeric" :value="row.price"
            @change="edit(row.id, $event)"
            @keydown.enter="$event.target.blur()"
            @keydown.escape="cancel(row.id, $event)">
        </label>
      </li>
    </ul>
    <p>Total: <output>{total()}</output> VND</p>
    <p role="alert">{error()}</p>
    <button @click="undo()" :disabled="!canUndo()">Undo</button>
    <button @click="redo()" :disabled="!canRedo()">Redo</button>
  </div>
</section>
<script type="module" src="/src/editor.js"></script>
```

```js
import Gyos from 'gyosjs/csp';

function createCosts() {
  const freeze = items => Object.freeze(items.map(item => Object.freeze({ ...item })));
  const rows = Gyos.signal(freeze([
    { id: 'room', name: 'Room', price: 100000 },
    { id: 'tea', name: 'Tea', price: 50000 }
  ]));
  const total = Gyos.computed(() => rows().reduce((sum, row) => sum + row.price, 0));
  const canUndo = Gyos.signal(false), canRedo = Gyos.signal(false);
  const past = [], future = [];

  function publish(next) {
    Gyos.batch(() => {
      rows(next);
      canUndo(past.length > 0);
      canRedo(future.length > 0);
    });
  }

  function setPrice(id, text) {
    const value = text.trim();
    if (!/^\d+$/.test(value)) throw Error('Use whole VND, without separators.');
    const price = Number(value);
    if (!Number.isSafeInteger(price) || price > 1000000000) {
      throw Error('Enter a price from 0 to 1,000,000,000 VND.');
    }
    const current = rows();
    const row = current.find(item => item.id === id);
    if (!row) throw Error('This item no longer exists.');
    if (row.price === price) return; // No history entry for an unchanged value.
    const next = freeze(current.map(item => item.id === id ? { ...item, price } : item));
    past.push(current);
    if (past.length > 30) past.shift();
    future.length = 0; // An edit after undo starts a new branch.
    publish(next);
  }

  function undo() {
    if (!past.length) return;
    future.push(rows());
    publish(past.pop());
  }
  function redo() {
    if (!future.length) return;
    past.push(rows());
    publish(future.pop());
  }
  return { rows, total, canUndo, canRedo, setPrice, undo, redo };
}

Gyos.scope('CostEditor', () => {
  const costs = createCosts();
  const error = Gyos.signal('');
  const lifetime = new AbortController();
  const undo = () => { error(''); costs.undo(); };
  const redo = () => { error(''); costs.redo(); };
  function cancel(id, event) {
    event.target.value = String(costs.rows().find(row => row.id === id).price);
    error('');
  }

  return {
    rows: costs.rows, total: costs.total,
    canUndo: costs.canUndo, canRedo: costs.canRedo,
    error, undo, redo, cancel,
    edit(id, event) {
      try {
        costs.setPrice(id, event.target.value);
        error('');
      } catch (problem) {
        error(problem.message);
      }
      event.target.value = String(costs.rows().find(row => row.id === id).price);
    },
    onMount() {
      this.$refs.keyboard.addEventListener('keydown', event => {
        if (event.isComposing || !(event.ctrlKey || event.metaKey)) return;
        if (event.target.closest('input, textarea, select, [contenteditable]')) return;
        if (event.key.toLowerCase() !== 'z') return;
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }, { signal: lifetime.signal });
    },
    onUnmount() {
      lifetime.abort();
    }
  };
});
Gyos.mountAll();
```

Try changing Room to `200000`: the total becomes `250000`. Undo returns it to `150000`; redo restores `250000`. Enter or leaving the input commits; Escape restores the committed value. `12abc`, an empty input or a negative price produces an error without adding history. An unchanged price also adds no history. Undo, then commit another price: the old redo branch disappears.

## How the pieces fit

1. **One factory per editor.** `createCosts()` and the AbortController are created inside the scope factory. Duplicate the section (keep just one module script) to get two independent editors. Moving one controller outside the factory and returning it from both scopes would deliberately share its state/history.
2. **A committed snapshot.** `rows()` holds frozen row objects in a frozen array. Updates replace that array. Do not use `g-model="row.price"` here: direct nested mutation would bypass validation/history and try to mutate frozen data. Native input text is the draft; `change` is the commit boundary. This is not a restriction on `g-model` for ordinary mutable scope fields.
3. **A derived total.** `total()` reads the current snapshot, so edit, undo and redo all use the same computation. No separate total needs updating in those actions. `Gyos.batch` publishes the snapshot and history flags together; do not assume browser paint is synchronous with those writes.
4. **Stable row identity.** `g-key="row.id"` connects the new row values to existing DOM controls. Identity is independent of the array position; replacing a snapshot need not replace the input element.
5. **Owned browser resources.** The shortcut listener belongs to this editor's referenced element. Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z work while focus is inside the editor but outside a text control, preserving native text undo. `onUnmount` aborts this listener when Gyos cleans up the scope. Call `Gyos.cleanup(root)` before manually removing a mounted root; no manual cleanup is needed for a normal Gyos-managed removal. A new mount creates a fresh controller and AbortController.

This example uses a 30-change history in memory. It has no persistence; reloading starts again. There are only two whole-VND amounts, each capped at one billion, so the aggregate stays a safe integer. It intentionally omits quantities, row creation/deletion, file formats and storage recovery.

## From this recipe to Sumboard

In the full app, data validation and history are separate from the scope, with more edge cases handled at each boundary:

- [Domain model](https://github.com/hohphu8/sumboard/blob/main/src/model.js): validated immutable documents, fractional quantities, VND rounding, bounded history and JSON/CSV formats.
- [Reactive controller](https://github.com/hohphu8/sumboard/blob/main/src/sheet.js): document signal, computed summaries, filtered views and batched history flags.
- [Browser adapter](https://github.com/hohphu8/sumboard/blob/main/src/main.js): committed editing, focus, dialogs, pending import protection and cleanup of listeners, timers and download URLs.
- [Storage boundary](https://github.com/hohphu8/sumboard/blob/main/src/persistence.js): corrupt/blocked saves and detected stale-tab conflicts. localStorage is not transactional; simultaneous writes can still race.
- [Validation and limits](https://github.com/hohphu8/sumboard/blob/main/docs/VALIDATION.md): browser journeys, the 500-row workload and what those checks do not establish.

A single document signal keeps undo/redo straightforward, but changes invalidate document-wide projections. If real workloads outgrow this approach, profile them before adding per-row signals or rendering only visible rows. No extra GyosJS API is required for this recipe.

Continue with [scope ownership](./what-is-gscope), [reactivity and signals](./reactivity-signals), or [lifecycle](./layouts-scripts-lifecycle).

## Larger editable tables: paginate the view

Sumboard keeps a maximum of 500 rows but renders 50 by default, with an option for 100. This is application view state built with existing GyosJS signals/computed values; no new runtime API is needed. Render all rows when the measured workload is comfortably small. For a larger editable table, pagination bounds the number of mounted controls. Virtual scrolling is a separate design that must also handle keyboard focus, row heights and accessibility.

Keep the pipeline explicit: **document → filter/sort all rows → slice the current page → keyed DOM**. Whole-document totals and JSON/CSV exports read the document. A filtered subtotal reads all matching rows, not the page slice. Page/size/query changes do not belong in document undo history or saved data.

Given a computed `matches()` containing the full filtered and sorted result, this controller helper creates a paged view. Expose its returned signals/methods from your scope factory:

```js
function createPages(matches) {
  const requested = Gyos.signal(1);
  const size = Gyos.signal(50);
  const count = Gyos.computed(() => Math.max(1, Math.ceil(matches().length / size())));
  const page = Gyos.computed(() => Math.min(requested(), count()));
  const offset = Gyos.computed(() => (page() - 1) * size());
  const pageRows = Gyos.computed(() => matches().slice(offset(), offset() + size()));
  function go(next) {
    if (Number.isInteger(next)) requested(Math.max(1, Math.min(next, count())));
  }
  function resize(next) {
    if (![50, 100].includes(next)) return;
    const first = offset();
    Gyos.batch(() => { size(next); go(Math.floor(first / next) + 1); });
  }
  return { page, size, count, offset, pageRows, go, resize };
}
```

Render `pageRows()` using `g-key="row.id"`; display row numbers as `offset() + index + 1`. On a filter/sort command, batch the query change with `go(1)`. After publishing a changed document (including undo/redo), call `go(page())` to store the clamped page: deleting the final row on the last page should not make an old requested page reappear unexpectedly after undo. Changing page size preserves the previous page's first-row position where possible.

Focus is part of the feature, not just pagination markup:

- Commit or explicitly cancel the active input draft before removing its page. Sumboard commits on native `change`; it never treats page navigation as a document edit.
- For Enter/Shift+Enter, find the adjacent row in the **full matching list**, select its page, then focus its input after Gyos has updated the DOM. Add/duplicate follows the new row the same way. Do not query a row that is still on an unmounted page.
- On deletion, move focus to a surviving neighbor; clamp to the remaining pages. For import/reset, return to page one. Undo restores document data without restoring a hidden page request.
- Keep labeled previous/next buttons and the page-size select outside the replaced rows. Announce the current page with a polite status; if navigation disables its own focused button, move focus to that status. Show an empty state for zero matches and preserve horizontal scrolling on narrow screens.

Keys preserve DOM identity for rows that remain mounted; pagination deliberately removes off-page controls. Keep committed state in the document, not only in those controls. View state may reset on reload while the saved document remains intact.

See Sumboard's [controller](https://github.com/hohphu8/sumboard/blob/main/src/sheet.js), [focus adapter](https://github.com/hohphu8/sumboard/blob/main/src/main.js), [browser regressions](https://github.com/hohphu8/sumboard/blob/main/tests/browser/pagination.spec.js) and [measured comparison](https://github.com/hohphu8/sumboard/blob/main/docs/PAGINATION.md). GyosJS 0.5.6 avoids unchanged binding writes, but mounting hundreds of real controls still has a cost. Measure your actual workload before choosing page size or changing state architecture.
