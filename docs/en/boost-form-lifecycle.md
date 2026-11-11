# Boosted form lifecycle

GyosJS 0.4 adds two document events for boosted forms. Use them for pending indicators, retry messages and draft recovery. Keep business validation on the server; use `g-form` for client-side validation when useful.

`gyos:form-start` fires once when a boosted request starts. `gyos:form-end` fires once when that request finishes, including errors and cancellation. Both are `CustomEvent<BoostFormEventDetail>` events with:

| Field | Value |
| --- | --- |
| `form` | The original `HTMLFormElement`; it may be detached after a successful swap |
| `url` | Request URL at start, response URL when available at end |
| `status` | HTTP status when available, otherwise `null` |
| `outcome` | `null` at start; `success`, `http-error`, `network-error`, `aborted`, `invalid-response`, `fallback`, or `error` at end |
| `committed` | Whether new DOM was applied; inspect it even after an abort |
| `fallback` | Whether Gyos requested native navigation |

```js
document.addEventListener('gyos:form-start', ({ detail }) => {
  detail.form.setAttribute('aria-busy', 'true');
});
document.addEventListener('gyos:form-end', ({ detail }) => {
  detail.form.removeAttribute('aria-busy');
  if (detail.outcome !== 'success' && detail.form.isConnected) {
    // Keep current input and display an actionable message.
  }
});
```

`success` means the HTML navigation pipeline completed, including a redirected validation page returned as HTTP 200. Applications must still inspect their server-rendered validation errors. An explicitly rendered 422 has `outcome: 'http-error'` and `committed: true`. `aborted` or `network-error` cannot establish whether the server committed a write. Gyos does not automatically replay an unsuccessful POST.

The clicked submit button contributes its name/value to `FormData`. Its `formaction`, `formmethod`, and `formtarget` override the form attributes. An Enter submission without a submitter uses the form defaults and adds no button value; browsers may assign the default button to an Enter submission, in which case its value is included. Attributes are read directly so controls named `action`, `method`, or `target` cannot shadow form properties.

Targets other than `_self`, cross-origin actions, `method="dialog"`, image submitters and `text/plain` encoding use normal browser submission. Forms without a resolved outlet also remain native. A preview button with `formtarget="_blank"` therefore opens a new tab while the save button on the same form can use boost. Existing `g-no-boost` and cancelled submit events remain respected. Repeated submits of one form while its boosted request is pending produce one request.

Relative actions resolve against the document base URL. Explicit `enctype`/`formenctype="application/x-www-form-urlencoded"` produces a URL-encoded request. Otherwise boosted POST retains the existing multipart `FormData` behavior, including files. GET forms put successful controls in the query. `g-form` replays its approved submission with the same submitter; `g-submit` owns submission itself and does not emit router form events unless it starts a separate boosted submission.

Custom upload/autosave handlers should cancel their submit event or use explicit fetch calls; they do not emit these router events. Subscribe globally, or ensure the replacement page subscribes during `onAfterNavigate`, since the end event follows that hook.

## Server validation without replay

Laravel's usual POST -> redirect -> GET validation flow works with boost. If an endpoint returns HTML with status 422 directly, opt in on that form:

```html
<main id="page" g-outlet>
  <form action="/products" method="post" g-boost-errors="422">
    <input type="hidden" name="_token" value="SERVER_CSRF_TOKEN">
    <label>Title <input name="title" value="SERVER_OLD_TITLE"></label>
    <!-- Render the server validation message here. -->
    <button name="action" value="draft">Save draft</button>
    <button name="action" value="publish">Publish</button>
  </form>
</main>
```

Enable `g-boost` on body or the form. Return the same `#page` outlet, with escaped submitted values and useful validation messages. The router renders it once, leaves the URL unchanged, mounts scopes and reports HTTP 422 as a committed error. There is no second POST, automatic retry or client-side conversion from JSON.

Without opt-in, the current DOM and input remain mounted. Listen for `gyos:form-end` to explain the error. A 419 usually needs session recovery; a 429 may need a retry delay; a network failure leaves the write outcome uncertain. Do not retry destructive actions blindly.

## External widget lifecycle

Do not destroy charts, editors or polling at request start. A failed or cancelled request may leave the same page visible. Prefer scope `onUnmount` for scope-owned resources. For integrations outside scopes, use the accepted-swap hook:

```js
const widgets = new Map();

function mountWidgets(root) {
  root.querySelectorAll('[data-chart]').forEach(element => {
    if (!widgets.has(element)) widgets.set(element, createChart(element));
  });
}

const stopBefore = Gyos.onBeforeSwap((url, context) => {
  // Additive updates retain existing widgets.
  const mode = context.trigger?.getAttribute('g-swap');
  if (!context.popstate && (mode === 'append' || mode === 'prepend')) return;
  widgets.forEach((chart, element) => {
    if (context.target?.contains(element) && !element.closest('[g-persist]')) {
      chart.destroy();
      widgets.delete(element);
    }
  });
});

const stopAfter = Gyos.onAfterNavigate(() => mountWidgets(document));
const stopEnd = Gyos.onNavigationEnd(context => {
  // A script failure/abort can follow an already-applied DOM swap.
  if (context.committed && context.outcome !== 'success' && context.outcome !== 'http-error') mountWidgets(document);
});

Gyos.ready(() => mountWidgets(document));
// When removing this integration: stopBefore(); stopAfter(); stopEnd();
```

`createChart` is your library adapter; it is not a Gyos API. Keep mounting idempotent, dispose SDK resources explicitly, and use a separate AbortController for each widget lifetime. The navigation signal is not a page lifetime signal. Router hooks do not await module imports, workers or your asynchronous setup. For browser BFCache, handle `pageshow` with `event.persisted` only when your adapter actually needs resuming.

A rendered HTTP 422 already runs `onAfterNavigate`. Do not mount a second time from `onNavigationEnd` just because its outcome is `http-error`. An aborted commit can require recovery; keep that separate from an HTTP error that finished rendering normally.

For page-owned asynchronous work, capture the current page controller before starting. Check `signal.aborted` after every awaited import/request before mounting DOM, restoring a player or clearing a draft. Pass that signal to fetch where possible. An aborted event listener does not cancel a promise you started earlier. If account changes require several storage operations, serialize those transitions and finish any started purge before applying the next account.

```js
let pageLifetime = new AbortController();
async function mountEditor(root) {
  const signal = pageLifetime.signal;
  const { createEditor } = await import('./editor.js');
  if (signal.aborted || !root.isConnected) return;
  const editor = createEditor(root);
  signal.addEventListener('abort', () => editor.destroy(), { once: true });
}
// In the accepted destructive-swap cleanup:
// pageLifetime.abort(); pageLifetime = new AbortController();
```

## Upgrading from 0.3.2

- Move destructive `onBeforeNavigate(cleanup)` logic to `onBeforeSwap` or scope cleanup.
- Existing callbacks accepting just `url` still work; hook registration now returns unsubscribe.
- Remove local submitter/action monkey patches after testing the published package.
- Keep native payment, OAuth, download and image-coordinate form flows where appropriate.
- Responses containing `<base href>` cannot be boosted safely under an unknown `base-uri` policy. GET falls back to native navigation; an already-sent POST is not replayed and ends with `invalid-response`. Use root-relative assets or `g-no-boost` on base-dependent forms.
- Body data/class state is not automatically synchronized unless body is the outlet. Own page data explicitly in your layout or scope.
- Use `g-head-persist` for a runtime SDK that should survive response head reconciliation; keep page-specific metadata unmarked.
