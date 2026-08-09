import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';
import { __routerTest } from '../src/core/router/router';
import { resetPersistState } from '../src/core/router/persist';

let id = 0;
const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
};
const response = (html: string) => Promise.resolve(new Response(html, {
	status: 200,
	headers: { 'Content-Type': 'text/html' }
}));

describe('Thegioiin consumer feedback contracts', () => {
	beforeEach(() => {
		for (const element of Array.from(Gyos.mountedScopes().keys())) Gyos.cleanup(element);
		__routerTest.resetRouterState();
		resetPersistState();
		document.body.innerHTML = '';
		document.getElementById('gyos-transitions')?.remove();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('binds ARIA, data, custom, and dynamic form metadata with removal semantics', async () => {
		const name = `ConsumerBindings${++id}`;
		document.body.innerHTML = `
			<form id="root" g-scope="${name}">
				<button :aria-expanded="open" :data-state="open ? 'open' : 'closed'" :custom-flag="custom">Toggle</button>
				<input :name="fieldName" :required="required" :min="minimum" :pattern="pattern" :autocomplete="autocomplete">
			</form>
		`;
		Gyos.scope(name, {
			open: false,
			custom: 'ready',
			fieldName: 'options[paper]',
			required: true,
			minimum: 100,
			pattern: '[0-9]+',
			autocomplete: 'off'
		});

		Gyos.mountAll();
		const root = document.getElementById('root')!;
		const state = Gyos.mountedScopes().get(root);
		const button = root.querySelector('button')!;
		const input = root.querySelector('input')!;

		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(button.getAttribute('data-state')).toBe('closed');
		expect(button.getAttribute('custom-flag')).toBe('ready');
		expect(input.name).toBe('options[paper]');
		expect(input.required).toBe(true);
		expect(input.min).toBe('100');
		expect(input.pattern).toBe('[0-9]+');

		Object.assign(state, { open: true, custom: false, required: false, minimum: null });
		await flush();
		expect(button.getAttribute('aria-expanded')).toBe('true');
		expect(button.getAttribute('data-state')).toBe('open');
		expect(button.hasAttribute('custom-flag')).toBe(false);
		expect(input.required).toBe(false);
		expect(input.hasAttribute('required')).toBe(false);
		expect(input.hasAttribute('min')).toBe(false);
	});

	it('blocks executable and framework-owned dynamic attributes', () => {
		const name = `ConsumerUnsafeBindings${++id}`;
		document.body.innerHTML = `
			<div g-scope="${name}">
				<a :href="url" :onclick="handler" :srcdoc="markup" :g-show="directive">Unsafe</a>
				<form :action="action"><button :formaction="action">Send</button></form>
			</div>
		`;
		Gyos.scope(name, {
			url: 'javascript:alert(1)',
			action: 'java\nscript:alert(1)',
			handler: 'alert(1)',
			markup: '<script>alert(1)</script>',
			directive: 'open'
		});

		Gyos.mountAll();
		const anchor = document.querySelector('a')!;
		expect(anchor.hasAttribute('href')).toBe(false);
		expect(anchor.hasAttribute('onclick')).toBe(false);
		expect(anchor.hasAttribute('srcdoc')).toBe(false);
		expect(anchor.hasAttribute('g-show')).toBe(false);
		expect(document.querySelector('form')!.hasAttribute('action')).toBe(false);
		expect(document.querySelector('button')!.hasAttribute('formaction')).toBe(false);
	});

	it('does not interpolate raw-text and fallback containers', async () => {
		const name = `ConsumerRawText${++id}`;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		document.body.innerHTML = `
			<div g-scope="${name}">
				<style>.demo { display: block; }</style>
				<script type="application/ld+json">{"name":"{literal}"}</script>
				<noscript><style>[g-cloak] { display: block !important; }</style></noscript>
				<textarea>{message}</textarea>
				<p>{message}</p>
			</div>
		`;
		Gyos.scope(name, { message: 'Rendered' });

		Gyos.mountAll();
		await flush();
		expect(document.querySelector('style')!.textContent).toContain('{ display: block; }');
		expect(document.querySelector('script')!.textContent).toContain('{literal}');
		expect(document.querySelector('textarea')!.textContent).toBe('{message}');
		expect(document.querySelector('p')!.textContent).toBe('Rendered');
		expect(error).not.toHaveBeenCalled();
	});

	it('mountTree initializes a new ordinary subtree with its nearest scope', async () => {
		const scopeName = `ConsumerMountTree${++id}`;
		const directiveName = `consumer-reveal-${id}`;
		const mounted = vi.fn();
		const unmounted = vi.fn();
		Gyos.directive(directiveName, { mounted, unmounted });
		document.body.innerHTML = `<div id="root" g-scope="${scopeName}"><div id="target"></div><span>{count}</span></div>`;
		Gyos.scope(scopeName, { count: 1 });
		Gyos.mountAll();

		const inserted = document.createElement('section');
		inserted.innerHTML = `<button g-${directiveName}="count" @click="count++" :aria-label="'Count ' + count">{count}</button>`;
		document.getElementById('target')!.append(inserted);
		Gyos.mountTree(inserted);

		expect(mounted).toHaveBeenCalledTimes(1);
		expect(inserted.textContent).toBe('1');
		expect(inserted.querySelector('button')!.getAttribute('aria-label')).toBe('Count 1');
		inserted.querySelector('button')!.click();
		await flush();
		expect(inserted.textContent).toBe('2');
		Gyos.cleanup(inserted);
		expect(unmounted).toHaveBeenCalledTimes(1);
	});

	it.each(['inner', 'append'] as const)('mounts custom directives committed by a %s router swap', async swapMode => {
		const scopeName = `ConsumerRouter${swapMode}${++id}`;
		const directiveName = `consumer-router-${swapMode}-${id}`;
		const mounted = vi.fn();
		Gyos.directive(directiveName, { mounted });
		document.body.innerHTML = `
			<div g-outlet><section id="root" g-scope="${scopeName}"><div id="results"><p id="old">Old</p></div></section></div>
			<button id="trigger" g-target="#results" g-swap="${swapMode}" g-noscroll></button>
		`;
		Gyos.scope(scopeName, { label: 'Mounted' });
		Gyos.mountAll();
		global.fetch = vi.fn(() => response(`<div id="results"><p class="new" g-${directiveName}="label">{label}</p></div>`)) as any;

		await (__routerTest as any).navigate({
			url: '/filtered', method: 'GET', trigger: document.getElementById('trigger'), changeState: false
		});

		expect(mounted).toHaveBeenCalledTimes(1);
		expect(document.querySelector('.new')!.textContent).toBe('Mounted');
		if (swapMode === 'append') expect(document.getElementById('old')).not.toBeNull();
	});

	it('animates g-show after mount without removing the element', async () => {
		vi.useFakeTimers();
		const name = `ConsumerShowTransition${++id}`;
		Gyos.applyTransitionStyles();
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<div class="panel" style="display:grid" g-show="open" g-transition.20="fade">Panel</div>
			</div>
		`;
		Gyos.scope(name, { open: true });
		Gyos.mountAll();
		const root = document.getElementById('root')!;
		const state = Gyos.mountedScopes().get(root);
		const panel = document.querySelector<HTMLElement>('.panel')!;
		expect(panel.style.display).toBe('grid');

		state.open = false;
		await flush();
		expect(panel.isConnected).toBe(true);
		await vi.runAllTimersAsync();
		expect(panel.style.display).toBe('none');
		expect(panel.isConnected).toBe(true);

		state.open = true;
		await flush();
		expect(panel.style.display).toBe('grid');
		await vi.runAllTimersAsync();
		expect(panel.isConnected).toBe(true);
	});

	it('keeps the latest g-show state during rapid transition toggles', async () => {
		vi.useFakeTimers();
		const name = `ConsumerShowRace${++id}`;
		document.body.innerHTML = `<div id="root" g-scope="${name}"><div class="panel" g-show="open" g-transition.30="fade">Panel</div></div>`;
		Gyos.scope(name, { open: true });
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!);
		const panel = document.querySelector<HTMLElement>('.panel')!;

		state.open = false;
		await flush();
		state.open = true;
		await flush();
		state.open = false;
		await flush();
		await vi.runAllTimersAsync();

		expect(panel.style.display).toBe('none');
		expect(panel.isConnected).toBe(true);
	});

	it('injects only namespaced built-in transition utilities', () => {
		Gyos.applyTransitionStyles();
		const css = document.getElementById('gyos-transitions')!.textContent!;
		expect(css).toContain('.gyos-t-opacity-0');
		expect(css).not.toMatch(/\n\s*\.opacity-0\s*\{/);
		expect(css).not.toMatch(/\n\s*\.scale-100\s*\{/);
	});
});
