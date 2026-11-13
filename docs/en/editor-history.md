# An editor with undo and redo

[Sumboard](https://github.com/hohphu8/sumboard) is a cost-planning app built with GyosJS. This recipe reduces its editing model to two prices: validate an edit, replace a snapshot, derive the total, and undo or redo the change.

For a small form, `Gyos.scope('Profile', { name: '', ... })` remains a good starting point: its fields already become reactive. Explicit signals help here because a controller owns document snapshots and history, while the scope adapts browser inputs and lifecycle. This is one application structure, not a new required way to write GyosJS.

## Run the small example

In a Vite vanilla JavaScript project, install the runtime:

```sh
npm install gyosjs@0.5.5
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
