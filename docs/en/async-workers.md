# Async work and Workers

[Rivergate](https://github.com/hohphu8/rivergate) searches for a Xiangqi move in a Worker while GyosJS renders the board and controls. Undo, a new game, history navigation or scope cleanup can make a pending answer obsolete. A reactive signal does not decide whether that answer still belongs to the current screen.

Keep three decisions separate: **stop unnecessary work**, **reject obsolete callbacks**, and **validate the result against current application state**. This recipe counts primes to demonstrate those boundaries without the chess engine. It uses existing GyosJS APIs; it does not introduce a Worker abstraction.

## Run the example

In a Vite vanilla JavaScript project with `gyosjs@0.5.5`, use these three files. The manual CSP entry registers the scope before `Gyos.mountAll()`; do not also load an auto build. Serve through Vite, not `file://`. Run your normal production build/preview too so the emitted Worker URL is checked.

Put this in `index.html`:

```html
<section g-scope="PrimeCounter">
  <label>Upper limit
    <input type="number" min="2" max="1000000" :value="limit()"
      @input="change($event.target.value)">
  </label>
  <button @click="run()">Count / Restart</button>
  <button @click="cancel()" :disabled="!busy()">Cancel</button>
  <p role="status">{status()}</p>
  <output>{summary()}</output>
  <p role="alert">{error()}</p>
</section>
<script type="module" src="/src/primes.js"></script>
```

Put this in `src/primes.js`:

```js
import Gyos from 'gyosjs/csp';

Gyos.scope('PrimeCounter', () => {
  const limit = Gyos.signal('100000');
  const busy = Gyos.signal(false), result = Gyos.signal(null), error = Gyos.signal('');
  const status = Gyos.computed(() => busy() ? 'Counting...' : 'Ready');
  const summary = Gyos.computed(() => {
    const value = result();
    return value ? `${value.count} primes up to ${value.limit}` : 'No result';
  });
  let worker = null, timer = null, generation = 0, alive = true;

  function release() {
    generation++; // Invalidate callbacks before releasing their resources.
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
    }
    worker = null;
  }
  function cancel() {
    if (!alive) return;
    release();
    Gyos.batch(() => { busy(false); result(null); error(''); });
  }
  function change(value) {
    if (!alive) return;
    cancel(); // An edit invalidates the old input even before the next Run.
    limit(value);
  }
  function run() {
    if (!alive) return;
    cancel();
    const upper = Number(limit.peek), id = generation;
    if (!Number.isInteger(upper) || upper < 2 || upper > 1000000) {
      error('Enter an integer from 2 to 1000000.');
      return;
    }
    busy(true);
    let task = null;
    const current = () => alive && generation === id && worker === task;
    const fail = () => {
      if (!current()) return;
      release();
      Gyos.batch(() => { busy(false); error('Worker could not finish. Try again.'); });
    };
    try {
      task = new Worker(new URL('./primes.worker.js', import.meta.url), { type: 'module' });
      worker = task;
      task.onmessage = ({ data }) => {
        if (!current() || data?.id !== id || data?.limit !== upper) return;
        if (data.type === 'error') { fail(); return; }
        if (data.type !== 'result') return;
        if (!Number.isInteger(data.count) || data.count < 1 || data.count > upper) {
          fail();
          return;
        }
        release(); // Also rejects duplicate replies and clears the timeout.
        Gyos.batch(() => { busy(false); result({ limit: upper, count: data.count }); });
      };
      task.onerror = event => { event.preventDefault(); fail(); };
      task.onmessageerror = fail;
      timer = setTimeout(fail, 5000);
      task.postMessage({ type: 'count', id, limit: upper });
    } catch {
      fail(); // Includes construction and postMessage failures.
    }
  }
  return {
    limit, busy, result, error, status, summary, run, cancel, change,
    onUnmount() { alive = false; release(); }
  };
});
Gyos.mountAll();
```

Put this in `src/primes.worker.js`. It has no GyosJS dependency or DOM access:

```js
self.onmessage = ({ data }) => {
  if (data?.type !== 'count') return;
  const { id, limit } = data;
  if (!Number.isInteger(limit) || limit < 2 || limit > 1000000) {
    self.postMessage({ type: 'error', id, limit });
    return;
  }
  let count = 0;
  for (let candidate = 2; candidate <= limit; candidate++) {
    let prime = true;
    for (let divisor = 2; divisor * divisor <= candidate; divisor++) {
      if (candidate % divisor === 0) { prime = false; break; }
    }
    if (prime) count++;
  }
  self.postMessage({ type: 'result', id, limit, count });
};
```

Try 100: the result is 25. Change the input while counting, restart, or cancel: the old answer must not replace the new screen. A small computation may finish before you can press Cancel; tests should control reply order instead of depending on machine speed. Duplicate the section, keeping one script tag, for independent instances.

The Worker is disposable: each run creates one and completion/cancellation terminates it. This keeps the example small; a long-lived Worker or pool may suit frequent jobs better. The trial-division algorithm and five-second timeout are demonstration choices, not performance targets. A timeout means the UI stopped accepting that task, not proof that the algorithm is incorrect.

## What each guard does

| Boundary | Responsibility |
| --- | --- |
| `terminate()` and `clearTimeout()` | Stop the old Worker and release its watchdog. Removing handlers also releases callback references. |
| `alive`, `generation`, Worker identity | Reject a captured callback from an old run, an already completed run, or a disposed scope. Error callbacks need the same check as successful replies. |
| Reply `id` and `limit` | Associate the message with the request and its input snapshot. Each input edit cancels this example's current request. |
| Result validation | Check the expected message shape before applying it. The count range check is not independent proof of mathematical correctness. Rivergate additionally checks whether a returned move is legal in the current position. |

The generation check remains useful even when input changes from A to B and back to A: an old answer for A still belongs to the old run. Do not use input equality alone as a request ID. Every command that invalidates your application's state must also invalidate its pending work. This example exposes `change()` for edits; writing `limit(...)` directly from another module would bypass that command.

`computed` derives synchronous UI labels here. It does not cancel promises or Workers. Signals/computed created synchronously in the scope factory belong to that mount; browser resources still need explicit cleanup. Before manually removing a mounted root, call `Gyos.cleanup(root)`. Gyos-managed removal already invokes cleanup. Remount through the factory for a fresh lifetime; do not reuse a disposed controller.

## Fetch, file reads and asynchronous errors

The same ownership rule applies to asynchronous I/O. Capture a generation before starting and check it, plus the owner's lifetime, **after each relevant `await` and before any UI write**. Check `catch` and `finally` too: a stale rejection must not overwrite a newer error, and an old `finally` must not clear a newer request's loading indicator. Cleanup invalidates the generation even for work that cannot be aborted.

| Operation | Stop work when possible | Reject late UI writes |
| --- | --- | --- |
| `fetch` | Give each request a fresh AbortController; pass its signal to fetch, then abort on replacement/unmount. Check HTTP status and validate the parsed data. | Check ownership after reading/parsing the response, including error/loading updates. Aborting the client does not roll back a server mutation. |
| `File.text()` / `Blob.text()` | These promise APIs do not take an AbortSignal. If cancellation is needed, choose an API that supports it. | Check the generation after the read, on rejection, and before clearing a file input. A stale read must not clear a newer selection. |
| CPU work in a Worker | Terminate this disposable Worker. Sending a cancel message cannot interrupt its currently running synchronous loop; a reusable design must yield or use a cooperative cancellation mechanism. | Keep request/lifetime checks, and validate against current domain state. |

For browser details, see [Worker termination](https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate), [Worker construction](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker), and [canceling fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#canceling_a_request). The CSP build avoids dynamic expression compilation; it does not grant permission to start a Worker. Your policy must allow the Worker URL, for example `worker-src 'self'` for this same-origin module. Test the deployed policy and production asset path.

## From this recipe to Rivergate

- [Bot client](https://github.com/hohphu8/rivergate/blob/main/src/bot-client.js): request IDs, position keys, progress, timeout, termination, and Worker errors.
- [Game controller](https://github.com/hohphu8/rivergate/blob/main/src/game.js): revision, mode/history/position checks, then legal-move validation before committing a result.
- [Scope adapter](https://github.com/hohphu8/rivergate/blob/main/src/main.js): reactive projection and `onUnmount` disposal.
- [Validation report](https://github.com/hohphu8/rivergate/blob/main/docs/VALIDATION.md): real production Workers plus controlled stale replies, failures, retry and teardown. Historical measurements are not guarantees for every device or policy.

This guide's executable tests use both real module Workers and controlled callbacks. Real Workers check the algorithm and module path; controlled callbacks exercise replacement, wrong IDs/inputs, invalid results, errors, timeout, duplicate replies and cleanup without relying on a race happening by chance.

Continue with [external engines](./external-engines), [scope ownership](./what-is-gscope), [lifecycle](./layouts-scripts-lifecycle), or [Built with GyosJS](./built-with-gyosjs).
