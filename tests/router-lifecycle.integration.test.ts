import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAll, scope } from '../src/core/component';
import { disposeEffects } from '../src/template/cleanup';
import { __routerTest } from '../src/core/router/router';
import { resetPersistState } from '../src/core/router/persist';

const response = (html: string) => Promise.resolve(new Response(html, {
	status: 200,
	headers: { 'Content-Type': 'text/html' }
}));

describe('router scope lifecycle', () => {
	beforeEach(() => {
		__routerTest.resetRouterState();
		resetPersistState();
		document.body.innerHTML = '';
	});

	afterEach(() => {
		disposeEffects(document.body);
		__routerTest.resetRouterState();
		resetPersistState();
	});

	it('keeps existing scopes mounted during append navigation', async () => {
		let oldMounts = 0;
		let oldUnmounts = 0;
		let newMounts = 0;
		scope('RouterAppendOld', {
			onMount() { oldMounts++; },
			onUnmount() { oldUnmounts++; }
		});
		scope('RouterAppendNew', {
			onMount() { newMounts++; }
		});
		document.body.innerHTML = `
			<div g-outlet>
				<div id="items"><article id="old" g-scope="RouterAppendOld">old</article></div>
			</div>
			<button id="more" g-target="#items" g-swap="append" g-noscroll></button>
		`;
		mountAll();
		const old = document.getElementById('old');
		global.fetch = vi.fn(() => response(`
			<div id="items"><article id="new" g-scope="RouterAppendNew">new</article></div>
		`)) as any;

		await (__routerTest as any).navigate({
			url: '/items?page=2',
			method: 'GET',
			trigger: document.getElementById('more'),
			changeState: false
		});

		expect(document.getElementById('old')).toBe(old);
		expect(oldMounts).toBe(1);
		expect(oldUnmounts).toBe(0);
		expect(newMounts).toBe(1);
	});

	it('unmounts and remounts a morphed scope while preserving compatible DOM identity', async () => {
		let mounts = 0;
		let unmounts = 0;
		scope('RouterMorphScope', {
			onMount() { mounts++; },
			onUnmount() { unmounts++; }
		});
		document.body.innerHTML = `
			<div id="app" g-outlet g-scope="RouterMorphScope">
				<label for="name">Old</label><input id="name" value="typed">
			</div>
			<a id="morph" href="/morph" g-swap="morph" g-noscroll></a>
		`;
		mountAll();
		const input = document.getElementById('name') as HTMLInputElement;
		input.focus();
		global.fetch = vi.fn(() => response(`
			<div id="app" g-outlet g-scope="RouterMorphScope">
				<label for="name">New</label><input id="name" value="server">
			</div>
		`)) as any;

		await (__routerTest as any).navigate({
			url: '/morph',
			method: 'GET',
			trigger: document.getElementById('morph'),
			changeState: false
		});

		expect(document.getElementById('name')).toBe(input);
		expect(document.activeElement).toBe(input);
		expect(document.querySelector('label')!.textContent).toBe('New');
		expect(mounts).toBe(2);
		expect(unmounts).toBe(1);
	});

	it('mounts and removes a scope declared on the global outlet across inner layout swaps', async () => {
		let mounts = 0;
		let unmounts = 0;
		scope('RouterOutletRootScope', {
			onMount() { mounts++; },
			onUnmount() { unmounts++; }
		});
		document.body.innerHTML = `
			<div id="app" class="theme-one-row" g-outlet g-snapshot>
				<a id="docs" href="/docs" g-noscroll>docs</a>
			</div>
		`;
		const outlet = document.getElementById('app')!;
		global.fetch = vi.fn()
			.mockImplementationOnce(() => response(`
				<div id="app" class="theme-dashboard" g-outlet g-snapshot g-scope="RouterOutletRootScope">
					<aside>sidebar</aside>
					<a id="home" href="/home" g-noscroll>home</a>
				</div>
			`))
			.mockImplementationOnce(() => response(`
				<div id="app" class="theme-one-row" g-outlet g-snapshot>
					<main>home</main>
				</div>
			`)) as any;

		await (__routerTest as any).navigate({
			url: '/docs',
			method: 'GET',
			trigger: document.getElementById('docs'),
			changeState: false
		});

		expect(document.getElementById('app')).toBe(outlet);
		expect(outlet.className).toBe('theme-dashboard');
		expect(outlet.getAttribute('g-scope')).toBe('RouterOutletRootScope');
		expect(mounts).toBe(1);
		expect(unmounts).toBe(0);

		await (__routerTest as any).navigate({
			url: '/home',
			method: 'GET',
			trigger: document.getElementById('home'),
			changeState: false
		});

		expect(document.getElementById('app')).toBe(outlet);
		expect(outlet.className).toBe('theme-one-row');
		expect(outlet.hasAttribute('g-scope')).toBe(false);
		expect(mounts).toBe(1);
		expect(unmounts).toBe(1);
	});

	it('restores a parked island when a later navigation provides its placeholder', async () => {
		document.body.innerHTML = `
			<div id="app" g-outlet>
				<div id="player" g-persist="player">playing</div>
			</div>
			<button id="nav" g-noscroll></button>
		`;
		const player = document.getElementById('player')!;
		global.fetch = vi.fn()
			.mockImplementationOnce(() => response(`
				<div id="app" g-outlet><main>page without player</main></div>
			`))
			.mockImplementationOnce(() => response(`
				<div id="app" g-outlet><main><!-- g-persist:player --></main></div>
			`)) as any;

		await (__routerTest as any).navigate({
			url: '/without-player',
			method: 'GET',
			trigger: document.getElementById('nav'),
			changeState: false
		});
		expect(document.getElementById('app')!.contains(player)).toBe(false);
		expect(player.isConnected).toBe(true);

		await (__routerTest as any).navigate({
			url: '/with-player',
			method: 'GET',
			trigger: document.getElementById('nav'),
			changeState: false
		});

		expect(document.getElementById('app')!.contains(player)).toBe(true);
		expect(document.getElementById('player')).toBe(player);
	});

	it.each(['inner', 'replace', 'morph'])('preserves an island across %s navigation', async swapMode => {
		document.body.innerHTML = `
			<div id="app" g-outlet><div id="player" g-persist="player">playing</div></div>
			<a id="nav" href="/next" g-swap="${swapMode}" g-noscroll>next</a>
		`;
		const player = document.getElementById('player')!;
		global.fetch = vi.fn(() => response(`
			<div id="app" g-outlet><main><!-- g-persist:player --><p>next</p></main></div>
		`)) as any;

		await (__routerTest as any).navigate({
			url: '/next',
			method: 'GET',
			trigger: document.getElementById('nav'),
			changeState: false
		});

		expect(document.getElementById('player')).toBe(player);
		expect(document.querySelectorAll('[g-persist="player"]')).toHaveLength(1);
		expect(document.getElementById('app')!.textContent).toContain('next');
	});

	it.each(['append', 'prepend'])('leaves an existing persisted island untouched during %s navigation', async swapMode => {
		document.body.innerHTML = `
			<div g-outlet><div id="items"><div id="player" g-persist="player">playing</div></div></div>
			<button id="more" g-target="#items" g-swap="${swapMode}" g-noscroll></button>
		`;
		const player = document.getElementById('player')!;
		global.fetch = vi.fn(() => response(`
			<div id="items"><p class="incoming">new</p></div>
		`)) as any;

		await (__routerTest as any).navigate({
			url: '/items',
			method: 'GET',
			trigger: document.getElementById('more'),
			changeState: false
		});

		expect(document.getElementById('player')).toBe(player);
		expect(document.querySelectorAll('[g-persist="player"]')).toHaveLength(1);
		expect(document.querySelector('.incoming')).not.toBeNull();
	});
});
