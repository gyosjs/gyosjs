import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks to avoid temporal dead zone with vi.mock
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
const cleanupFns = vi.hoisted(() => ({
	disposeEffects: vi.fn()
}));
const scopeRegistry = vi.hoisted(() => ({
	unmountScope: vi.fn(),
	getScopeFromElement: vi.fn(() => ({}))
}));
const diffFns = vi.hoisted(() => ({
	diffNodes: vi.fn()
}));

vi.mock('../src/core/component', () => mounts);
vi.mock('../src/core/router/script', () => routerScripts);
vi.mock('../src/utils/progress-bar', () => ({
	ProgressBar: vi.fn(() => progressBar)
}));
vi.mock('../src/utils/target-spinner', () => targetSpinner);
vi.mock('../src/core/router/persist', () => persist);
vi.mock('../src/core/router/scroll', () => scrollFns);
vi.mock('../src/template/cleanup', () => cleanupFns);
vi.mock('../src/core/scope-registry', () => scopeRegistry);
vi.mock('../src/core/router/diff-nodes', () => diffFns);

import { startRouter, onAfterNavigate, __routerTest } from '../src/core/router/router';

const buildResponse = (html: string, url = '/response', redirected = false) =>
	Promise.resolve({
		status: 200,
		ok: true,
		url,
		redirected,
		headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }),
		text: async () => html
	} as Response);

describe('router', () => {
	beforeEach(() => {
		__routerTest.resetRouterState();
		vi.clearAllMocks();
		vi.spyOn(history, 'replaceState').mockImplementation(() => null as any);
		vi.spyOn(history, 'pushState').mockImplementation(() => null as any);
	});

	afterEach(() => {
		__routerTest.resetRouterState();
		delete (document as any).startViewTransition;
	});

	it('delegates click navigation and swaps outlet content', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<a id="link" href="/next" g-boost>next</a>
			<div id="out" g-outlet g-snapshot>old</div>
		`;

		global.fetch = vi.fn().mockResolvedValue(
			buildResponse('<div g-outlet id="out">new</div>', 'http://localhost:3000/next')
		) as any;

		startRouter();
		document.getElementById('link')!.dispatchEvent(
			new MouseEvent('click', { bubbles: true, button: 0, cancelable: true })
		);

		await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled(), { timeout: 1000 });
		await vi.waitFor(() =>
			expect(document.getElementById('out')!.textContent).toContain('new'),
			{ timeout: 1000 }
		);
		expect((__routerTest.snapshots as Map<string, unknown>).size).toBeGreaterThan(0);
		expect(mounts.mountAll).toHaveBeenCalled();
		expect(cleanupFns.disposeEffects).toHaveBeenCalled();
		expect(persist.detachPersist).toHaveBeenCalled();
		expect(persist.mergePersistIntoLive).toHaveBeenCalled();
	});

	it('aborts in-flight navigation when a new navigation starts', async () => {
		document.body.innerHTML = `<div id="out" g-outlet></div>`;

		const abortingFetch = vi.fn((_url, init: RequestInit) => {
			return new Promise((_resolve, reject) => {
				const err: any = new Error('AbortError');
				err.name = 'AbortError';
				(init.signal as AbortSignal).addEventListener('abort', () => reject(err));
			});
		});
		const fastFetch = vi.fn((_url, _init: RequestInit) =>
			buildResponse('<div g-outlet>done</div>', 'http://localhost:3000/fast')
		);

		global.fetch = vi
			.fn()
			.mockImplementationOnce(abortingFetch as any)
			.mockImplementationOnce(fastFetch as any) as any;

		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		const first = navigate({ url: '/slow', method: 'GET', changeState: false });
		const second = navigate({ url: '/fast', method: 'GET', changeState: false });

		await second;
		await expect(first).resolves.toBeUndefined();

		const firstSignal = (global.fetch as any).mock.calls[0][1].signal as AbortSignal;
		expect(firstSignal.aborted).toBe(true);
	});

	it('boosts form submissions with FormData', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<form g-boost action="/search" method="GET">
				<input name="q" value="hello">
			</form>
			<div g-outlet></div>
		`;

		global.fetch = vi.fn().mockResolvedValue(
			buildResponse('<div g-outlet>ok</div>', 'http://localhost:3000/search?q=hello')
		) as any;

		startRouter();
		document.querySelector('form')!.dispatchEvent(
			new Event('submit', { bubbles: true, cancelable: true })
		);

		await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled(), { timeout: 1000 });
		const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
		expect(calledUrl).toContain('q=hello');
		
		// Wait for navigation to complete
		await vi.waitFor(() => expect(mounts.mountAll).toHaveBeenCalled(), { timeout: 1000 });
		expect(document.querySelector('[g-outlet]')!.textContent).toContain('ok');
	});

	it('lets only the latest navigation commit even when an aborted fetch resolves later', async () => {
		document.body.innerHTML = `<div id="out" g-outlet>initial</div>`;
		let resolveSlow!: (response: Response) => void;
		const slowResponse = new Promise<Response>(resolve => {
			resolveSlow = resolve;
		});

		global.fetch = vi.fn()
			.mockImplementationOnce(() => slowResponse)
			.mockImplementationOnce(() => buildResponse(
				'<div id="out" g-outlet>fast</div>',
				'http://localhost:3000/fast'
			)) as any;
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		const slow = navigate({ url: '/slow', method: 'GET', changeState: false });
		const fast = navigate({ url: '/fast', method: 'GET', changeState: false });
		await fast;
		resolveSlow(await buildResponse(
			'<div id="out" g-outlet>stale</div>',
			'http://localhost:3000/slow'
		));
		await slow;

		expect(document.getElementById('out')!.textContent).toBe('fast');
		expect(cleanupFns.disposeEffects).toHaveBeenCalledTimes(1);
	});

	it('prevents a stale preloaded response from committing or completing newer progress', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<a id="preload" href="/slow" g-preload>slow</a>
			<div id="out" g-outlet>initial</div>
		`;
		let resolvePreload!: (response: Response) => void;
		const pendingPreload = new Promise<Response>(resolve => {
			resolvePreload = resolve;
		});
		global.fetch = vi.fn()
			.mockImplementationOnce(() => pendingPreload)
			.mockImplementationOnce(() => buildResponse(
				'<div id="out" g-outlet>fast</div>',
				'http://localhost:3000/fast'
			)) as any;
		startRouter();
		document.getElementById('preload')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		const slow = navigate({ url: '/slow', method: 'GET', changeState: false });
		const fast = navigate({ url: '/fast', method: 'GET', changeState: false });
		await fast;
		expect(progressBar.complete).toHaveBeenCalledTimes(1);

		resolvePreload(await buildResponse(
			'<div id="out" g-outlet>stale preload</div>',
			'http://localhost:3000/slow'
		));
		await slow;

		expect(document.getElementById('out')!.textContent).toBe('fast');
		expect(progressBar.complete).toHaveBeenCalledTimes(1);
	});

	it('does not tear down the current page while a response is pending', async () => {
		document.body.innerHTML = `<div id="out" g-outlet>still live</div>`;
		let resolveResponse!: (response: Response) => void;
		global.fetch = vi.fn(() => new Promise<Response>(resolve => {
			resolveResponse = resolve;
		})) as any;
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		const navigation = navigate({ url: '/pending', method: 'GET', changeState: false });
		await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());

		expect(cleanupFns.disposeEffects).not.toHaveBeenCalled();
		expect(persist.detachPersist).not.toHaveBeenCalled();
		expect(document.getElementById('out')!.textContent).toBe('still live');

		resolveResponse(await buildResponse(
			'<div id="out" g-outlet>loaded</div>',
			'http://localhost:3000/pending'
		));
		await navigation;
		expect(document.getElementById('out')!.textContent).toBe('loaded');
	});

	it('cleans the target spinner after a network failure', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<div id="out" g-outlet>still live</div>
			<a id="next" href="/offline" g-router-spin>next</a>
		`;
		global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as any;
		startRouter();
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		await navigate({
			url: '/offline',
			method: 'GET',
			trigger: document.getElementById('next'),
			changeState: false
		});

		expect(targetSpinner.showTargetSpinner).toHaveBeenCalledTimes(1);
		expect(targetSpinner.hideTargetSpinner).toHaveBeenCalledTimes(1);
		expect(progressBar.complete).toHaveBeenCalledTimes(1);
		expect(document.getElementById('out')!.textContent).toBe('still live');
	});

	it('cleans the target spinner after an unsuccessful HTTP response', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<div id="out" g-outlet>still live</div>
			<a id="next" href="/failed" g-router-spin>next</a>
		`;
		global.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 503,
			url: 'http://localhost:3000/failed',
			redirected: false,
			headers: new Headers(),
			text: vi.fn()
		} as any) as any;
		startRouter();
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		await navigate({
			url: '/failed',
			method: 'GET',
			trigger: document.getElementById('next'),
			changeState: false
		});

		expect(targetSpinner.hideTargetSpinner).toHaveBeenCalledTimes(1);
		expect(progressBar.complete).toHaveBeenCalledTimes(1);
		expect(document.getElementById('out')!.textContent).toBe('still live');
	});

	it('cleans only the superseded spinner when a newer navigation takes over', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<div id="out" g-outlet>initial</div>
			<a id="slow" href="/slow" g-router-spin>slow</a>
			<a id="fast" href="/fast">fast</a>
		`;
		const slowFetch = vi.fn((_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
			(init.signal as AbortSignal).addEventListener('abort', () => {
				const error = new DOMException('Navigation superseded', 'AbortError');
				reject(error);
			});
		}));
		global.fetch = vi.fn()
			.mockImplementationOnce(slowFetch as any)
			.mockImplementationOnce(() => buildResponse(
				'<div id="out" g-outlet>fast</div>',
				'http://localhost:3000/fast'
			)) as any;
		startRouter();
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		const slow = navigate({
			url: '/slow',
			method: 'GET',
			trigger: document.getElementById('slow'),
			changeState: false
		});
		await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
		const fast = navigate({
			url: '/fast',
			method: 'GET',
			trigger: document.getElementById('fast'),
			changeState: false
		});

		await Promise.all([slow, fast]);
		expect(targetSpinner.showTargetSpinner).toHaveBeenCalledTimes(1);
		expect(targetSpinner.hideTargetSpinner).toHaveBeenCalledTimes(1);
		expect(progressBar.complete).toHaveBeenCalledTimes(1);
		expect(document.getElementById('out')!.textContent).toBe('fast');
	});

	it('settles a superseded preloaded navigation and removes its spinner immediately', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<div id="out" g-outlet>initial</div>
			<a id="slow" href="/slow" g-router-spin>slow</a>
			<a id="fast" href="/fast">fast</a>
		`;
		let resolvePreload!: (response: Response) => void;
		const pendingPreload = new Promise<Response>(resolve => {
			resolvePreload = resolve;
		});
		__routerTest.preloadCache.set('http://localhost:3000/slow', pendingPreload);
		global.fetch = vi.fn(() => buildResponse(
			'<div id="out" g-outlet>fast</div>',
			'http://localhost:3000/fast'
		)) as any;
		startRouter();
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		const slow = navigate({
			url: '/slow',
			method: 'GET',
			trigger: document.getElementById('slow'),
			changeState: false
		});
		await vi.waitFor(() => expect(targetSpinner.showTargetSpinner).toHaveBeenCalledTimes(1));
		const fast = navigate({
			url: '/fast',
			method: 'GET',
			trigger: document.getElementById('fast'),
			changeState: false
		});
		await fast;
		const settledBeforePreload = await Promise.race([
			slow.then(() => true),
			new Promise<boolean>(resolve => setTimeout(() => resolve(false), 20))
		]);
		resolvePreload(await buildResponse(
			'<div id="out" g-outlet>stale</div>',
			'http://localhost:3000/slow'
		));
		await slow;

		expect(settledBeforePreload).toBe(true);
		expect(targetSpinner.hideTargetSpinner).toHaveBeenCalledTimes(1);
		expect(document.getElementById('out')!.textContent).toBe('fast');
	});

	it('finishes transaction cleanup when scroll-state setup throws', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<div id="out" g-outlet>initial</div>
		`;
		scrollFns.saveScrollPosition.mockImplementationOnce(() => {
			throw new Error('history state unavailable');
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		startRouter();
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		await expect(navigate({
			url: '/next',
			method: 'GET',
			changeState: false
		})).resolves.toBeUndefined();

		expect(progressBar.complete).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalledWith(
			'[GyosRouter] navigation error',
			expect.any(Error)
		);
	});

	it('cleans the target spinner when the document update throws', async () => {
		document.body.innerHTML = `
			<div g-boost></div>
			<div id="out" g-outlet>still live</div>
			<a id="next" href="/broken" g-router-spin>next</a>
		`;
		global.fetch = vi.fn().mockResolvedValue(buildResponse(
			'<html><head><meta name="broken" content="1"></head><body><div id="out" g-outlet>new</div></body></html>',
			'http://localhost:3000/broken'
		)) as any;
		diffFns.diffNodes.mockImplementationOnce(() => {
			throw new Error('head update failed');
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		startRouter();
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		await navigate({
			url: '/broken',
			method: 'GET',
			trigger: document.getElementById('next'),
			changeState: false
		});

		expect(targetSpinner.hideTargetSpinner).toHaveBeenCalledTimes(1);
		expect(progressBar.complete).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalledWith(
			'[GyosRouter] navigation error',
			expect.any(Error)
		);
	});

	it.each(['append', 'prepend'])('preserves existing target scopes for %s navigation', async swapMode => {
		document.body.innerHTML = `
			<div g-outlet><div id="items"><div id="old">old</div></div></div>
			<button id="more" g-target="#items" g-swap="${swapMode}"></button>
		`;
		const old = document.getElementById('old');
		global.fetch = vi.fn().mockResolvedValue(buildResponse(
			'<div id="items"><div id="new">new</div></div>',
			'http://localhost:3000/items'
		)) as any;
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		await navigate({
			url: '/items',
			method: 'GET',
			trigger: document.getElementById('more'),
			changeState: false
		});

		expect(document.getElementById('old')).toBe(old);
		expect(document.getElementById('new')).not.toBeNull();
		expect(cleanupFns.disposeEffects).not.toHaveBeenCalled();
		expect(persist.detachPersist).not.toHaveBeenCalled();
	});

	it('removes an additive navigation trigger only after the new fragment commits', async () => {
		document.body.innerHTML = `
			<div g-outlet>
				<div id="items"><div id="old">old</div></div>
				<a id="more" href="/items" g-target="#items" g-swap="append" g-router-remove>more</a>
			</div>
		`;
		const trigger = document.getElementById('more')!;
		global.fetch = vi.fn().mockResolvedValue(buildResponse(
			'<div id="items"><div id="new">new</div><a id="next" href="/items?page=3" g-router-remove>more</a></div>',
			'http://localhost:3000/items?page=2'
		)) as any;
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		await navigate({
			url: '/items?page=2',
			method: 'GET',
			trigger,
			changeState: false
		});

		expect(trigger.isConnected).toBe(false);
		expect(document.getElementById('new')).not.toBeNull();
		expect(document.getElementById('next')).not.toBeNull();
		expect(cleanupFns.disposeEffects).toHaveBeenCalledWith(trigger);
	});

	it('keeps document head and global scripts unchanged for a partial target update', async () => {
		document.head.innerHTML = '<title>Current</title><meta name="current" content="1">';
		document.body.innerHTML = `
			<script id="layout-script"></script>
			<div g-outlet><div id="sidebar">old</div></div>
			<button id="partial" g-target="#sidebar"></button>
		`;
		global.fetch = vi.fn().mockResolvedValue(buildResponse(`
			<html><head><title>Incoming</title><meta name="incoming" content="1"></head>
			<body><script id="other-layout-script"></script><div id="sidebar">new</div></body></html>
		`, 'http://localhost:3000/sidebar')) as any;
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		await navigate({
			url: '/sidebar',
			method: 'GET',
			trigger: document.getElementById('partial'),
			changeState: false
		});

		expect(document.title).toBe('Current');
		expect(document.getElementById('layout-script')).not.toBeNull();
		expect(diffFns.diffNodes).not.toHaveBeenCalled();
	});

	it('updates history to the final URL after a redirected non-GET submission', async () => {
		document.body.innerHTML = `<div id="out" g-outlet></div>`;
		global.fetch = vi.fn().mockResolvedValue(buildResponse(
			'<div id="out" g-outlet>created</div>',
			'http://localhost:3000/posts/42',
			true
		)) as any;
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		await navigate({ url: '/posts', method: 'POST', changeState: false });

		expect(history.pushState).toHaveBeenCalledWith(
			expect.objectContaining({ gyos: true }),
			'',
			'http://localhost:3000/posts/42'
		);
	});

	it('stores a redirected GET snapshot under the final response URL', async () => {
		document.body.innerHTML = `<div id="out" g-outlet g-snapshot>old</div>`;
		global.fetch = vi.fn().mockResolvedValue(buildResponse(
			'<div id="out" g-outlet g-snapshot>redirected</div>',
			'http://localhost:3000/final',
			true
		)) as any;
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		await navigate({ url: '/requested', method: 'GET', changeState: true });

		expect(__routerTest.snapshots.has('http://localhost:3000/final')).toBe(true);
		expect(__routerTest.snapshots.has('http://localhost:3000/requested')).toBe(false);
	});

	it('keeps the current URL for a non-redirected validation response', async () => {
		document.body.innerHTML = `<div id="out" g-outlet></div>`;
		global.fetch = vi.fn().mockResolvedValue(buildResponse(
			'<div id="out" g-outlet>validation error</div>',
			'http://localhost:3000/posts'
		)) as any;
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		await navigate({ url: '/posts', method: 'POST', changeState: false });

		expect(history.pushState).not.toHaveBeenCalled();
		expect(history.replaceState).not.toHaveBeenCalled();
	});

	it('runs afterNavigate after the view-transition update callback completes', async () => {
		document.body.innerHTML = `<div id="out" g-outlet>old</div>`;
		global.fetch = vi.fn().mockResolvedValue(buildResponse(
			'<div id="out" g-outlet>new</div>',
			'http://localhost:3000/next'
		)) as any;
		const events: string[] = [];
		let finishUpdate!: () => void;
		(document as any).startViewTransition = vi.fn((callback: () => void) => {
			callback();
			return {
				updateCallbackDone: new Promise<void>(resolve => {
					finishUpdate = () => {
						events.push('update-complete');
						resolve();
					};
				})
			};
		});
		onAfterNavigate(() => events.push('after-navigate'));
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		const navigation = navigate({ url: '/next', method: 'GET', changeState: false });
		await vi.waitFor(() => expect(document.getElementById('out')!.textContent).toBe('new'));
		expect(events).toEqual([]);
		finishUpdate();
		await navigation;

		expect(events).toEqual(['update-complete', 'after-navigate']);
	});

	it('consumes skipped view-transition promise rejections', async () => {
		document.body.innerHTML = `<div id="out" g-outlet>old</div>`;
		global.fetch = vi.fn().mockResolvedValue(buildResponse(
			'<div id="out" g-outlet>new</div>',
			'http://localhost:3000/next'
		)) as any;
		const readyCatch = vi.fn().mockResolvedValue(undefined);
		const finishedCatch = vi.fn().mockResolvedValue(undefined);
		(document as any).startViewTransition = vi.fn((callback: () => Promise<void>) => ({
			ready: { catch: readyCatch },
			finished: { catch: finishedCatch },
			updateCallbackDone: callback()
		}));
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		await navigate({ url: '/next', method: 'GET', changeState: false });

		expect(readyCatch).toHaveBeenCalledOnce();
		expect(finishedCatch).toHaveBeenCalledOnce();
		expect(document.getElementById('out')!.textContent).toBe('new');
	});

	it('waits for an in-progress DOM commit before starting the next navigation', async () => {
		document.body.innerHTML = '<div id="out" g-outlet>old</div>';
		global.fetch = vi.fn()
			.mockResolvedValueOnce(await buildResponse(
				'<div id="out" g-outlet><script type="module"></script>first</div>',
				'http://localhost:3000/first'
			))
			.mockResolvedValueOnce(await buildResponse(
				'<div id="out" g-outlet>second</div>',
				'http://localhost:3000/second'
			)) as any;
		let releaseScript!: () => void;
		routerScripts.executeScripts.mockImplementationOnce(() => new Promise<void>(resolve => {
			releaseScript = resolve;
		}));
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		const first = navigate({ url: '/first', method: 'GET', changeState: true });
		await vi.waitFor(() => expect(routerScripts.executeScripts).toHaveBeenCalledTimes(1));
		const second = navigate({ url: '/second', method: 'GET', changeState: true });
		await Promise.resolve();
		expect(global.fetch).toHaveBeenCalledTimes(1);

		releaseScript();
		await Promise.all([first, second]);

		expect(global.fetch).toHaveBeenCalledTimes(2);
		expect(document.getElementById('out')!.textContent).toBe('second');
		expect(mounts.mountAll).toHaveBeenCalledTimes(2);
	});

	it('restores a context-sensitive history fragment without reparsing it in a body', async () => {
		document.body.innerHTML = '<table><tbody><tr id="row"><td>old</td></tr></tbody></table>';
		const sourceTable = document.createElement('table');
		sourceTable.innerHTML = '<tbody><tr id="row"><td>restored</td></tr></tbody>';
		const historyFragment = sourceTable.querySelector('#row')!.cloneNode(true) as HTMLElement;
		global.fetch = vi.fn() as any;
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;

		await navigate({
			url: '/rows',
			method: 'GET',
			changeState: false,
			popstate: true,
			targetSelector: '#row',
			swapMode: 'morph',
			historyFragment
		});

		expect(document.querySelector('#row td')!.textContent).toBe('restored');
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it('does not confuse a longer path with the current URL on popstate', async () => {
		document.body.innerHTML = `<div g-boost></div><div id="out" g-outlet></div>`;
		global.fetch = vi.fn()
			.mockResolvedValueOnce(buildResponse(
				'<div id="out" g-outlet>posts</div>',
				'http://localhost:3000/posts'
			))
			.mockResolvedValueOnce(buildResponse(
				'<div id="out" g-outlet>archive</div>',
				'http://localhost:3000/posts-archive'
			)) as any;
		startRouter();
		const navigate = (__routerTest as any).navigate as (opts: any) => Promise<void>;
		await navigate({ url: '/posts', method: 'GET', changeState: true });

		(history.pushState as any).mockRestore();
		history.pushState({}, '', '/posts-archive');
		window.dispatchEvent(new PopStateEvent('popstate'));

		await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
		await vi.waitFor(() => expect(document.getElementById('out')!.textContent).toBe('archive'));
	});
});
