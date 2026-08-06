import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mounts = vi.hoisted(() => ({ mountAll: vi.fn() }));
const routerScripts = vi.hoisted(() => ({
	cacheInitialPageScripts: vi.fn(),
	executeScripts: vi.fn(),
	executeScriptsInNodes: vi.fn()
}));
const progressBar = vi.hoisted(() => ({
	start: vi.fn(),
	complete: vi.fn(),
	hide: vi.fn(),
	setProgress: vi.fn(),
	getCurrentProgress: vi.fn().mockReturnValue(0)
}));
const progressFactory = vi.hoisted(() => ({ create: vi.fn(() => progressBar) }));
const targetSpinner = vi.hoisted(() => ({
	showTargetSpinner: vi.fn(() => document.createElement('div')),
	hideTargetSpinner: vi.fn()
}));
const persist = vi.hoisted(() => ({
	detachPersist: vi.fn(),
	mergePersistIntoLive: vi.fn()
}));
const scrollFns = vi.hoisted(() => ({
	handleScroll: vi.fn(),
	saveScrollPosition: vi.fn()
}));
const cleanupFns = vi.hoisted(() => ({ disposeEffects: vi.fn() }));
const scopeRegistry = vi.hoisted(() => ({
	unmountScope: vi.fn(),
	getScopeFromElement: vi.fn(() => ({}))
}));
const diffFns = vi.hoisted(() => ({ diffNodes: vi.fn() }));

vi.mock('../src/core/component', () => mounts);
vi.mock('../src/core/router/script', () => routerScripts);
vi.mock('../src/utils/progress-bar', () => ({ ProgressBar: progressFactory.create }));
vi.mock('../src/utils/target-spinner', () => targetSpinner);
vi.mock('../src/core/router/persist', () => persist);
vi.mock('../src/core/router/scroll', () => scrollFns);
vi.mock('../src/template/cleanup', () => cleanupFns);
vi.mock('../src/core/scope-registry', () => scopeRegistry);
vi.mock('../src/core/router/diff-nodes', () => diffFns);

import {
	__routerTest,
	onAfterNavigate,
	onBeforeNavigate,
	startRouter
} from '../src/core/router/router';

function absoluteUrl(path: string): string {
	return new URL(path, window.location.href).toString();
}

function response(html: string, path: string): Promise<Response> {
	return Promise.resolve({
		status: 200,
		ok: true,
		url: absoluteUrl(path),
		redirected: false,
		headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }),
		text: async () => html
	} as Response);
}

function click(element: Element): MouseEvent {
	const event = new MouseEvent('click', {
		bubbles: true,
		button: 0,
		cancelable: true
	});
	element.dispatchEvent(event);
	return event;
}

describe('Router documented public contracts', () => {
	beforeEach(() => {
		__routerTest.resetRouterState();
		vi.clearAllMocks();
		document.head.innerHTML = '<title>Current</title>';
		document.body.innerHTML = '';
		global.fetch = vi.fn() as any;
		vi.spyOn(history, 'replaceState').mockImplementation(() => null as any);
		vi.spyOn(history, 'pushState').mockImplementation(() => null as any);
	});

	afterEach(() => {
		__routerTest.resetRouterState();
		vi.restoreAllMocks();
	});

	it('does not start without g-boost and starts only once when enabled', async () => {
		document.body.innerHTML = `
			<button id="inactive" g-router-link="/inactive">inactive</button>
			<div g-outlet>old</div>
		`;

		startRouter();
		click(document.getElementById('inactive')!);

		expect(global.fetch).not.toHaveBeenCalled();
		expect(routerScripts.cacheInitialPageScripts).not.toHaveBeenCalled();

		document.body.setAttribute('g-boost', '');
		document.body.insertAdjacentHTML('afterbegin', '<a id="active" href="/active">active</a>');
		global.fetch = vi.fn(() => response('<div g-outlet>active page</div>', '/active')) as any;

		startRouter();
		startRouter();
		click(document.getElementById('active')!);

		await vi.waitFor(() => expect(document.querySelector('[g-outlet]')!.textContent).toBe('active page'));
		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(progressFactory.create).toHaveBeenCalledTimes(1);
		expect(routerScripts.cacheInitialPageScripts).toHaveBeenCalledTimes(1);
	});

	it('honors a g-no-boost ancestor for links and g-router-link controls', () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<div g-no-boost>
				<a id="link" href="/link">link</a>
				<button id="router-link" g-router-link="/action">action</button>
			</div>
			<div g-outlet>old</div>
		`;
		global.fetch = vi.fn(() => response('<div g-outlet>unexpected</div>', '/unexpected')) as any;
		startRouter();
		document.getElementById('link')!.addEventListener('click', event => event.preventDefault());

		click(document.getElementById('link')!);
		click(document.getElementById('router-link')!);

		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('restricts g-router-link requests to the current origin', () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<button id="external" g-router-link="https://external.example/action">external</button>
			<div g-outlet>old</div>
		`;
		global.fetch = vi.fn(() => response('<div g-outlet>unexpected</div>', '/unexpected')) as any;
		startRouter();

		click(document.getElementById('external')!);

		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('rejects non-HTML, attachment, and cross-origin navigation responses', async () => {
		document.body.innerHTML = '<div id="app" g-outlet>safe content</div>';
		const navigate = (__routerTest as any).navigate as (options: any) => Promise<void>;
		const cases = [
			{ url: absoluteUrl('/api'), headers: { 'Content-Type': 'application/json' } },
			{
				url: absoluteUrl('/download'),
				headers: { 'Content-Type': 'text/html', 'Content-Disposition': 'attachment; filename="page.html"' }
			},
			{ url: 'https://external.example/page', headers: { 'Content-Type': 'text/html' } }
		];

		for (const item of cases) {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				url: item.url,
				redirected: false,
				headers: new Headers(item.headers),
				text: async () => '<div id="app" g-outlet><script>window.bad = true</script>unsafe</div>'
			} as Response);
			await navigate({ url: '/candidate', method: 'GET', changeState: false });
			expect(document.getElementById('app')!.textContent).toBe('safe content');
			expect((global.fetch as any).mock.calls[0][1].mode).toBe('same-origin');
		}
	});

	it('does not replay a non-GET request when its response cannot be boosted', async () => {
		document.body.innerHTML = '<div id="app" g-outlet>safe content</div>';
		const navigate = (__routerTest as any).navigate as (options: any) => Promise<void>;
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			url: absoluteUrl('/api'),
			redirected: false,
			headers: new Headers({ 'Content-Type': 'application/json' }),
			text: async () => '{"created":true}'
		} as Response);

		await navigate({ url: '/api', method: 'POST', jsonData: { title: 'Post' }, changeState: false });

		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(document.getElementById('app')!.textContent).toBe('safe content');
		expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('will not be replayed'));
	});

	it('sends the documented method and URI-encoded params from g-router-link', async () => {
		const params = encodeURIComponent("{ page: 2, filter: 'open' }");
		document.body.innerHTML = `
			<div g-boost></div>
			<button id="action" g-router-link="/items" g-router-method="POST"
				g-router-params="${params}">load</button>
			<div g-outlet>old</div>
		`;
		global.fetch = vi.fn(() => response('<div g-outlet>loaded</div>', '/items')) as any;
		startRouter();

		click(document.getElementById('action')!);

		await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
		const [url, init] = (global.fetch as any).mock.calls[0] as [string, RequestInit];
		expect(url).toBe(absoluteUrl('/items'));
		expect(init.method).toBe('POST');
		expect(init.body).toBe(JSON.stringify({ page: 2, filter: 'open' }));
		expect((init.headers as Headers).get('Content-Type')).toBe('application/json');
	});

	it('uses g-target and matches the response fragment by target id on click', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<a id="partial" href="/panel" g-target="#panel">refresh</a>
			<div g-outlet><section id="panel">old panel</section><p id="stable">stable</p></div>
		`;
		global.fetch = vi.fn(() => response(`
			<div g-outlet><p>wrong fragment</p></div>
			<section id="panel">new panel</section>
		`, '/panel')) as any;
		startRouter();

		click(document.getElementById('partial')!);

		await vi.waitFor(() => expect(document.getElementById('panel')!.textContent).toBe('new panel'));
		expect(document.getElementById('stable')!.textContent).toBe('stable');
		expect(history.pushState).toHaveBeenCalledWith(
			expect.objectContaining({ gyos: true }),
			'',
			absoluteUrl('/panel')
		);
	});

	it('matches an unnamed nested outlet by its document position', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<div id="app" g-outlet>
				<p id="stable">Keep the outer outlet</p>
				<section class="widget" g-outlet>
					<a id="nested-link" href="/nested">refresh widget</a>
					<span class="widget-value">old widget</span>
				</section>
			</div>
		`;
		global.fetch = vi.fn(() => response(`
			<div id="app" g-outlet>
				<p>incoming outer content</p>
				<section class="widget" g-outlet>
					<span class="widget-value">new widget</span>
				</section>
			</div>
		`, '/nested')) as any;
		startRouter();

		click(document.getElementById('nested-link')!);

		await vi.waitFor(() => expect(document.querySelector('.widget-value')!.textContent).toBe('new widget'));
		expect(document.getElementById('stable')!.textContent).toBe('Keep the outer outlet');
		expect(document.querySelectorAll('[g-outlet]')).toHaveLength(2);

		const historyFragment = document.createElement('section');
		historyFragment.setAttribute('g-outlet', '');
		historyFragment.innerHTML = '<span class="widget-value">restored widget</span>';
		await (__routerTest as any).navigate({
			url: '/nested-history',
			method: 'GET',
			popstate: true,
			changeState: false,
			targetOutletIndex: 1,
			historyFragment
		});

		expect(document.querySelector('.widget-value')!.textContent).toBe('restored widget');
		expect(document.getElementById('stable')!.textContent).toBe('Keep the outer outlet');
	});

	it('replaces the target node and runs destructive lifecycle cleanup for replace swaps', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<a id="replace" href="/replacement" g-swap="replace">replace</a>
			<div id="app" g-outlet data-version="old">old</div>
		`;
		const oldOutlet = document.getElementById('app')!;
		global.fetch = vi.fn(() => response(
			'<div id="app" g-outlet data-version="new">new</div>',
			'/replacement'
		)) as any;
		startRouter();

		click(document.getElementById('replace')!);

		await vi.waitFor(() => expect(document.getElementById('app')!.textContent).toBe('new'));
		expect(document.getElementById('app')).not.toBe(oldOutlet);
		expect(oldOutlet.isConnected).toBe(false);
		expect(cleanupFns.disposeEffects).toHaveBeenCalledWith(oldOutlet);
		expect(persist.detachPersist).toHaveBeenCalledWith(oldOutlet);
		expect(mounts.mountAll).toHaveBeenCalledTimes(1);
	});

	it('keeps the current document head when the trigger has g-current-head', async () => {
		document.head.innerHTML = '<title>Current</title><meta name="stable" content="yes">';
		document.body.innerHTML = `
			<div g-boost></div>
			<a id="navigate" href="/next" g-current-head>next</a>
			<div g-outlet>old</div>
		`;
		global.fetch = vi.fn(() => response(`
			<html>
				<head><title>Incoming</title><meta name="incoming" content="yes"></head>
				<body><div g-outlet>new</div></body>
			</html>
		`, '/next')) as any;
		startRouter();

		click(document.getElementById('navigate')!);

		await vi.waitFor(() => expect(document.querySelector('[g-outlet]')!.textContent).toBe('new'));
		expect(document.title).toBe('Current');
		expect(document.head.querySelector('meta[name="stable"]')).not.toBeNull();
		expect(diffFns.diffNodes).toHaveBeenCalledTimes(1);
		expect(diffFns.diffNodes.mock.calls[0][2]).toBe(document.body);
	});

	it('lets g-current-state override both default navigation and g-change-state', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<button id="change" g-router-link="/partial" g-target="#panel" g-change-state>change</button>
			<a id="keep" href="/keep" g-change-state g-current-state>keep</a>
			<div g-outlet><section id="panel">old</section></div>
		`;
		global.fetch = vi.fn()
			.mockImplementationOnce(() => response('<section id="panel">partial</section>', '/partial'))
			.mockImplementationOnce(() => response('<div g-outlet><section id="panel">kept</section></div>', '/keep')) as any;
		startRouter();

		click(document.getElementById('change')!);
		await vi.waitFor(() => expect(document.getElementById('panel')!.textContent).toBe('partial'));
		expect(history.pushState).toHaveBeenCalledTimes(1);
		expect(history.pushState).toHaveBeenLastCalledWith(
			expect.objectContaining({ gyos: true }),
			'',
			absoluteUrl('/partial')
		);

		click(document.getElementById('keep')!);
		await vi.waitFor(() => expect(document.getElementById('panel')!.textContent).toBe('kept'));
		expect(history.pushState).toHaveBeenCalledTimes(1);
		expect(history.replaceState).toHaveBeenCalledTimes(1);
	});

	it('deduplicates preload requests and consumes the cached response on navigation', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<a id="preload" href="/preloaded" g-preload>preload</a>
			<div g-outlet>old</div>
		`;
		global.fetch = vi.fn(() => response('<div g-outlet>from preload</div>', '/preloaded')) as any;
		startRouter();
		const link = document.getElementById('preload')!;

		link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

		click(link);

		await vi.waitFor(() => expect(document.querySelector('[g-outlet]')!.textContent).toBe('from preload'));
		expect(global.fetch).toHaveBeenCalledTimes(1);
		expect(__routerTest.preloadCache.size).toBe(0);
	});

	it('restores a hash-normalized snapshot without fetching and strips once-only script bodies', async () => {
		document.body.innerHTML = '<div id="app" g-outlet>current</div>';
		__routerTest.saveSnapshot(absoluteUrl('/cached#old'), `
			<html><head><title>Cached</title></head><body>
				<div id="app" g-outlet>
					<p>restored</p>
					<script g-script-once>window.onceFromSnapshot = true;</script>
				</div>
			</body></html>
		`);

		await (__routerTest as any).navigate({
			url: '/cached#section',
			method: 'GET',
			popstate: true,
			changeState: false
		});

		expect(global.fetch).not.toHaveBeenCalled();
		expect(document.querySelector('#app p')!.textContent).toBe('restored');
		expect(document.querySelector<HTMLScriptElement>('#app script')!.textContent).toBe('');
		expect(document.title).toBe('Cached');
	});

	it('runs navigation hooks in order and isolates callback errors', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<a id="next" href="/next">next</a>
			<div g-outlet>old</div>
		`;
		const events: string[] = [];
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		onBeforeNavigate(url => events.push(`before:${new URL(url, location.href).pathname}`));
		onBeforeNavigate(() => { throw new Error('hook failed'); });
		onAfterNavigate(url => events.push(`after:${new URL(url, location.href).pathname}`));
		global.fetch = vi.fn(() => response('<div g-outlet>new</div>', '/final')) as any;
		startRouter();

		click(document.getElementById('next')!);

		await vi.waitFor(() => expect(events).toEqual(['before:/next', 'after:/final']));
		expect(consoleError).toHaveBeenCalledWith(
			'[GyosRouter] navigation hook error',
			expect.any(Error)
		);
	});

	it('shows and removes the target spinner around navigation', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<a id="next" href="/next" g-router-spin>next</a>
			<div id="app" g-outlet>old</div>
		`;
		global.fetch = vi.fn(() => response('<div id="app" g-outlet>new</div>', '/next')) as any;
		startRouter();

		click(document.getElementById('next')!);

		await vi.waitFor(() => expect(document.getElementById('app')!.textContent).toBe('new'));
		expect(targetSpinner.showTargetSpinner).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'app' }),
			'inner'
		);
		expect(targetSpinner.hideTargetSpinner).toHaveBeenCalledTimes(1);
	});
});
