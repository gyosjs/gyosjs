import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __routerTest, onAfterNavigate, onBeforeNavigate, onBeforeSwap, onNavigationEnd, startRouter } from '../src/core/router/router';
import { ProgressBar } from '../src/utils/progress-bar';

const response = (html: string, status = 200, url = location.href) => ({
	ok: status >= 200 && status < 300, status, url,
	headers: new Headers({ 'Content-Type': 'text/html' }), text: async () => html
} as Response);
const page = (attributes = 'lang="en"', content = 'Next') => `<!doctype html><html ${attributes}><head><title>Next</title></head><body><main g-outlet>${content}</main></body></html>`;

describe('dogfood router integration', () => {
	beforeEach(() => {
		history.replaceState({}, '', '/start');
		__routerTest.resetRouterState();
		document.head.innerHTML = '';
		document.documentElement.lang = 'en';
		document.documentElement.dir = 'ltr';
		document.body.innerHTML = '<main g-outlet><form g-boost action="/save" method="post"><input name="title" value="Draft"><button name="action" value="publish">Save</button></form></main>';
		vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		startRouter({ showProgress: false });
	});
	afterEach(() => {
		__routerTest.resetRouterState();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		vi.useRealTimers();
		document.documentElement.removeAttribute('lang');
		document.documentElement.removeAttribute('dir');
		document.documentElement.removeAttribute('data-theme');
	});

	it('syncs lang/dir for full HTML and snapshot history without changing client attributes', async () => {
		document.documentElement.dataset.theme = 'dark';
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page('lang="ar" dir="rtl"'))));
		await __routerTest.navigate({ url: '/ar', method: 'GET', changeState: true });
		expect(document.documentElement.lang).toBe('ar');
		expect(document.documentElement.dir).toBe('rtl');
		expect(document.documentElement.dataset.theme).toBe('dark');
		__routerTest.saveSnapshot(`${location.origin}/en`, page('lang="en"'));
		await __routerTest.navigate({ url: '/en', method: 'GET', popstate: true });
		expect(document.documentElement.lang).toBe('en');
		expect(document.documentElement.hasAttribute('dir')).toBe(false);
		__routerTest.saveSnapshot(`${location.origin}/default`, page(''));
		await __routerTest.navigate({ url: '/default', method: 'GET', popstate: true });
		expect(document.documentElement.hasAttribute('lang')).toBe(false);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it.each(['partial', 'fragment', 'append', 'current-head'])('keeps document language for %s navigation', async mode => {
		const trigger = document.createElement('a');
		if (mode === 'partial') {
			document.querySelector('main')!.innerHTML = '<aside id="panel"></aside>';
			trigger.setAttribute('g-target', '#panel');
		}
		if (mode === 'current-head') trigger.setAttribute('g-current-head', '');
		const html = mode === 'fragment' ? '<main g-outlet>Fragment</main>' : page('lang="ar" dir="rtl"', '<aside id="panel">Panel</aside>');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(html)));
		await __routerTest.navigate({ url: '/part', method: 'GET', trigger, swapMode: mode === 'append' ? 'append' : 'inner' });
		expect(document.documentElement.lang).toBe('en');
		expect(document.documentElement.dir).toBe('ltr');
	});

	it('keeps fragment snapshots from adopting parser-generated document attributes', async () => {
		__routerTest.saveSnapshot(`${location.origin}/fragment`, '<main g-outlet>Fragment</main>');
		vi.stubGlobal('fetch', vi.fn());
		await __routerTest.navigate({ url: '/fragment', method: 'GET', popstate: true });
		expect(document.documentElement.lang).toBe('en');
		expect(document.documentElement.dir).toBe('ltr');
		expect(fetch).not.toHaveBeenCalled();
	});

	it('rejects incoming base URLs before cleanup and never replays or snapshots a POST', async () => {
		const end = vi.fn(), before = vi.fn(); onNavigationEnd(end); onBeforeSwap(before);
		const form = document.querySelector('form')!;
		document.querySelector('main')!.setAttribute('g-snapshot', '');
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page().replace('</head>', '<base href="/assets/"></head>'))));
		await __routerTest.navigate({ url: '/save', method: 'POST', form });
		expect(end.mock.calls[0][0]).toMatchObject({ outcome: 'invalid-response', committed: false, fallback: false });
		expect(before).not.toHaveBeenCalled();
		expect(form.isConnected).toBe(true);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(__routerTest.snapshots.size).toBe(0);
	});

	it('reports a committed abort while a new head script is still pending', async () => {
		const end = vi.fn(); onNavigationEnd(end);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page().replace('</head>', '<script src="/slow.js"></script></head>'))));
		const navigation = __routerTest.navigate({ url: '/next', method: 'POST' });
		await vi.waitFor(() => expect(document.head.querySelector('script[src$="/slow.js"]')).not.toBeNull());
		expect(document.querySelector('main')?.textContent).toBe('Next');
		__routerTest.resetRouterState();
		// Reset removes old subscriptions; attach just for this final outcome.
		onNavigationEnd(end);
		await navigation;
		expect(end).toHaveBeenCalledOnce();
		expect(end.mock.calls[0][0]).toMatchObject({ outcome: 'aborted', committed: true });
	});

	it.each([419, 422, 429, 500])('reports HTTP %s without disposing or replaying a failed form', async status => {
		const before = vi.fn(), after = vi.fn(), end = vi.fn();
		onBeforeSwap(before); onAfterNavigate(after); onNavigationEnd(end);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page('', 'Error'), status)));
		const form = document.querySelector('form')!;
		form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: form.querySelector('button') }));
		await vi.waitFor(() => expect(end).toHaveBeenCalledTimes(1));
		expect(before).not.toHaveBeenCalled(); expect(after).not.toHaveBeenCalled();
		expect(end.mock.calls[0][0]).toMatchObject({ status, outcome: 'http-error', committed: false, fallback: false });
		expect(form.isConnected).toBe(true);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('renders opted-in 422 HTML once, preserves URL and reports a committed HTTP error', async () => {
		const order: string[] = [];
		onBeforeNavigate(() => order.push('request'));
		onBeforeSwap((_url, ctx) => { expect(ctx.committed).toBe(false); order.push('dispose'); });
		onAfterNavigate((_url, ctx) => { expect(ctx.committed).toBe(true); order.push('mount'); });
		const end = vi.fn(() => order.push('end')); onNavigationEnd(end);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page('', '<p role="alert">Title is required</p>'), 422, `${location.origin}/save`)));
		const form = document.querySelector('form')!;
		form.setAttribute('g-boost-errors', '422'); form.setAttribute('g-change-state', '');
		await __routerTest.navigate({ url: '/save', method: 'POST', form, trigger: form, formData: new FormData(form) });
		expect(document.querySelector('[role="alert"]')?.textContent).toBe('Title is required');
		expect(location.pathname).toBe('/start');
		expect(order).toEqual(['request', 'dispose', 'mount', 'end']);
		expect(end.mock.calls[0][0]).toMatchObject({ status: 422, outcome: 'http-error', committed: true });
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(__routerTest.snapshots.size).toBe(0);
	});

	it('unsubscribes each hook registration independently and isolates context mutation', async () => {
		const callback = vi.fn(); const off = onAfterNavigate(callback);
		onAfterNavigate(callback); off(); off();
		onBeforeSwap((_url, ctx) => { ctx.committed = true; });
		const before = vi.fn(); onBeforeSwap(before);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page())));
		await __routerTest.navigate({ url: '/next', method: 'GET' });
		expect(callback).toHaveBeenCalledTimes(1);
		expect(before.mock.calls[0][1].committed).toBe(false);
	});

	it('ends a superseded request without cleaning up the visible page early', async () => {
		const end = vi.fn(), dispose = vi.fn(); onNavigationEnd(end); onBeforeSwap(dispose);
		vi.stubGlobal('fetch', vi.fn().mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
			init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
		})).mockResolvedValue(response(page())));
		const first = __routerTest.navigate({ url: '/slow', method: 'POST' });
		await __routerTest.navigate({ url: '/next', method: 'GET' }); await first;
		expect(dispose).toHaveBeenCalledTimes(1);
		expect(end.mock.calls.map(([ctx]) => [ctx.outcome, ctx.committed])).toContainEqual(['aborted', false]);
		expect(end).toHaveBeenCalledTimes(2);
	});

	it('resolves action against base and honors URL-encoded submitter overrides', async () => {
		document.head.innerHTML = '<base href="/admin/">';
		const form = document.querySelector('form')!;
		const button = form.querySelector('button')!;
		button.setAttribute('formaction', 'preview');
		button.setAttribute('formenctype', 'application/x-www-form-urlencoded');
		const end = vi.fn(); onNavigationEnd(end);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page(), 422)));
		form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: button }));
		await vi.waitFor(() => expect(end).toHaveBeenCalledTimes(1));
		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(String(url)).toBe(`${location.origin}/admin/preview`);
		expect(String(init?.body)).toBe('title=Draft&action=publish');
	});

	it.each(['no-outlet', 'cross-origin', 'text/plain', 'image', 'base-target'])('leaves %s submissions native without emitting boost lifecycle', mode => {
		const form = document.querySelector('form')!;
		if (mode === 'no-outlet') document.querySelector('main')!.removeAttribute('g-outlet');
		if (mode === 'cross-origin') form.setAttribute('action', 'https://other.test/save');
		if (mode === 'text/plain') form.setAttribute('enctype', 'text/plain');
		if (mode === 'base-target') document.head.innerHTML = '<base target="_blank">';
		if (mode === 'image') form.innerHTML = '<input type="image" name="point">';
		const end = vi.fn(); onNavigationEnd(end); vi.stubGlobal('fetch', vi.fn());
		const event = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: form.querySelector('button, input[type="image"]') });
		form.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(fetch).not.toHaveBeenCalled(); expect(end).not.toHaveBeenCalled();
	});

	it('restores one live progress bar after body replacement and cloned snapshot markup', () => {
		vi.useFakeTimers();
		const bar = new ProgressBar(); bar.start();
		const original = document.getElementById('gyos-progress-bar');
		document.body.innerHTML = '<div id="gyos-progress-bar"></div>';
		bar.complete();
		expect(document.querySelectorAll('#gyos-progress-bar')).toHaveLength(1);
		expect(document.getElementById('gyos-progress-bar')).toBe(original);
		bar.start(); vi.advanceTimersByTime(1000);
		expect(original!.style.opacity).not.toBe('0');
		bar.complete(); vi.runAllTimers();
	});
});
