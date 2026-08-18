import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Gyos, * as api from '../src/index';
import { applyPipe } from '../src/core/pipe';
import packageJson from '../package.json';

let id = 0;

const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

const unique = (prefix: string) => `${prefix}-${++id}`;

describe('documented public API contracts', () => {
	beforeEach(() => {
		Gyos.cleanup();
		Gyos.clearAllEvents();
		document.body.innerHTML = '';
		document.getElementById('gyos-transitions')?.remove();
	});

	afterEach(() => {
		Gyos.cleanup();
		Gyos.clearAllEvents();
		document.getElementById('gyos-transitions')?.remove();
		vi.restoreAllMocks();
	});

	it('keeps named exports aligned with the default export and package version', () => {
		const namedExports = [
			'applyDirective', 'applyTransitionStyles', 'batch', 'cleanup', 'clearAllEvents',
			'computed', 'debounce', 'directive', 'effect', 'emit', 'getEventListeners',
			'getGlobalContainer', 'getStoreNames', 'getTransitionConfig', 'getValidator',
			'getValidatorNames', 'hasStore', 'inject', 'isComputed', 'isSignal', 'markRaw',
			'mount', 'mountAll', 'mountedScopes', 'mountTree', 'nextTick', 'off', 'on',
			'onAfterNavigate', 'onBeforeNavigate', 'once', 'pipe', 'portalCreate',
			'portalDestroy', 'provide', 'ready', 'registerTransition', 'removeStore', 'scope',
			'setCspNonce', 'shallow', 'signal', 'startRouter', 'store', 'throttle', 'unref', 'untrack',
			'useAsync', 'useCounter', 'useDebounce', 'useFetch', 'useInterval',
			'useLocalStorage', 'useMediaQuery', 'useMouse', 'useThrottle', 'useTimeout',
			'useToggle', 'useWindowSize', 'validate', 'validator'
		].sort();

		expect(Object.keys(api).filter(name => name !== 'default').sort()).toEqual(namedExports);
		for (const name of namedExports) {
			expect((api as Record<string, unknown>)[name]).toBe((Gyos as Record<string, unknown>)[name]);
		}
		expect(Gyos.version).toBe(packageJson.version);
	});

	it('registers a scope on an element, mounts it, and exposes the live scope map', () => {
		const root = document.createElement('section');
		root.innerHTML = '<span>{message}</span>';
		document.body.appendChild(root);

		Gyos.scope(root, { message: 'mounted directly' });
		expect(root.hasAttribute('g-scope')).toBe(true);
		expect(Gyos.mountedScopes().has(root)).toBe(false);

		Gyos.mount(root);
		const mounted = Gyos.mountedScopes();
		expect(mounted.get(root).message).toBe('mounted directly');
		expect(root.textContent).toBe('mounted directly');
		expect(Gyos.mountedScopes()).toBe(mounted);
	});

	it('mounts only descendant scopes in the requested tree', () => {
		const insideName = unique('tree-inside');
		const outsideName = unique('tree-outside');
		document.body.innerHTML = `
			<div id="tree"><div id="inside" g-scope="${insideName}">{value}</div></div>
			<div id="outside" g-scope="${outsideName}">{value}</div>
		`;
		Gyos.scope(insideName, { value: 'inside' });
		Gyos.scope(outsideName, { value: 'outside' });

		Gyos.mountTree(document.getElementById('tree')!);

		expect(document.getElementById('inside')!.textContent).toBe('inside');
		expect(Gyos.mountedScopes().has(document.getElementById('inside')!)).toBe(true);
		expect(Gyos.mountedScopes().has(document.getElementById('outside')!)).toBe(false);
	});

	it('cleans a mounted subtree without removing it or unrelated scopes', async () => {
		const parentName = unique('cleanup-parent');
		const childName = unique('cleanup-child');
		const siblingName = unique('cleanup-sibling');
		const parentUnmount = vi.fn();
		const childUnmount = vi.fn();
		document.body.innerHTML = `
			<div id="parent" g-scope="${parentName}">
				<span>{count}</span><div id="child" g-scope="${childName}">{count}</div>
			</div>
			<div id="sibling" g-scope="${siblingName}">{count}</div>
		`;
		Gyos.scope(parentName, { count: 1, onUnmount: parentUnmount });
		Gyos.scope(childName, { count: 2, onUnmount: childUnmount });
		Gyos.scope(siblingName, { count: 3 });
		Gyos.mountAll();

		const parent = document.getElementById('parent')!;
		const child = document.getElementById('child')!;
		const sibling = document.getElementById('sibling')!;
		const parentState = Gyos.mountedScopes().get(parent);
		const siblingState = Gyos.mountedScopes().get(sibling);
		Gyos.cleanup(parent);

		parentState.count = 10;
		siblingState.count = 30;
		await flush();
		expect(parent.isConnected).toBe(true);
		expect(parentUnmount).toHaveBeenCalledOnce();
		expect(childUnmount).toHaveBeenCalledOnce();
		expect(Gyos.mountedScopes().has(parent)).toBe(false);
		expect(Gyos.mountedScopes().has(child)).toBe(false);
		expect(Gyos.mountedScopes().has(sibling)).toBe(true);
		expect(sibling.textContent).toBe('30');
	});

	it('keeps markRaw nested mutations raw while tracking property replacement', async () => {
		const name = unique('raw-store');
		const initial = Gyos.markRaw({ value: 1 });
		const state = Gyos.store(name, { config: initial });
		const values: number[] = [];
		const dispose = Gyos.effect(() => values.push(state.config.value));

		state.config.value = 2;
		await flush();
		expect(state.config).toBe(initial);
		expect(values).toEqual([1]);

		state.config = Gyos.markRaw({ value: 3 });
		await flush();
		expect(values).toEqual([1, 3]);
		dispose();
		Gyos.removeStore(name);
	});

	it('identifies and unwraps documented signal and computed values', () => {
		const count = Gyos.signal(2);
		const doubled = Gyos.computed(() => count.value * 2);

		expect(Gyos.isSignal(count)).toBe(true);
		expect(Gyos.isSignal(doubled)).toBe(false);
		expect(Gyos.isComputed(doubled)).toBe(true);
		expect(Gyos.isComputed(count)).toBe(false);
		expect(Gyos.unref(count)).toBe(2);
		expect(Gyos.unref(3)).toBe(3);
		expect(count.peek).toBe(2);
	});

	it('makes shallow direct properties reactive without proxying nested objects', async () => {
		const name = unique('shallow-store');
		const nested = { name: 'light' };
		const options = Gyos.shallow({ theme: nested, enabled: false });
		const state = Gyos.store(name, { options });
		const snapshots: string[] = [];
		const dispose = Gyos.effect(() => snapshots.push(`${state.options.theme.name}:${state.options.enabled}`));

		state.options.theme.name = 'dark';
		await flush();
		expect(state.options.theme).toBe(nested);
		expect(snapshots).toEqual(['light:false']);

		state.options.enabled = true;
		await flush();
		expect(snapshots).toEqual(['light:false', 'dark:true']);

		state.options.theme = { name: 'contrast' };
		await flush();
		expect(snapshots).toEqual(['light:false', 'dark:true', 'contrast:true']);
		dispose();
		Gyos.removeStore(name);
	});

	it('exposes a global DI container with inheriting child containers', () => {
		const key = unique('service');
		const globalService = { source: 'global' };
		Gyos.provide(key, globalService);
		const container = Gyos.getGlobalContainer();
		const child = container.createChild();

		expect(container.has(key)).toBe(true);
		expect(container.get(key)).toBe(globalService);
		expect(Gyos.inject(key)).toBe(globalService);
		expect(child.get(key)).toBe(globalService);
		child.set(key, { source: 'child' });
		expect(child.get(key)).toEqual({ source: 'child' });
		expect(container.get(key)).toBe(globalService);
		expect(Gyos.inject(unique('missing'), 'fallback')).toBe('fallback');
	});

	it('creates reactive stores and keeps store helper metadata consistent', async () => {
		const name = unique('counter-store');
		const counter = Gyos.store(name, {
			count: 0,
			increment() { this.count++; }
		});
		const seen: number[] = [];
		const dispose = Gyos.effect(() => seen.push(counter.count));

		counter.increment();
		await flush();
		expect(seen).toEqual([0, 1]);
		expect(Gyos.store(name)).toBe(counter);
		expect(Gyos.hasStore(name)).toBe(true);
		expect(Gyos.getStoreNames()).toContain(name);

		dispose();
		Gyos.removeStore(name);
		expect(Gyos.hasStore(name)).toBe(false);
		expect(Gyos.getStoreNames()).not.toContain(name);
		expect(() => Gyos.store(name)).toThrow(`Store "${name}" not found`);
	});

	it('reports deduplicated event listener counts and clears debug state', () => {
		const event = unique('debug-event');
		const handler = vi.fn();
		Gyos.on(event, handler);
		Gyos.on(event, handler);
		expect(Gyos.getEventListeners()).toMatchObject({ [event]: 1 });

		Gyos.clearAllEvents();
		expect(Gyos.getEventListeners()).toEqual({});
		Gyos.emit(event, 'ignored');
		expect(handler).not.toHaveBeenCalled();
	});

	it('provides every built-in pipe documented by the API reference', () => {
		const localDate = new Date(2024, 0, 2, 3, 4, 5);
		const sourceArray = ['a', 'b', 'c'];
		const cases: Array<[string, unknown, unknown[], unknown]> = [
			['currency', 1234.5, ['USD', 'en-US'], new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(1234.5)],
			['date', localDate, ['YYYY-MM-DD HH:mm:ss'], '2024-01-02 03:04:05'],
			['slug', '  Hello, Gyos JS!  ', [], 'hello-gyos-js'],
			['truncate', 'abcdef', [3, '...'], 'abc...'],
			['uppercase', 'Gyos', [], 'GYOS'],
			['lowercase', 'Gyos', [], 'gyos'],
			['capitalize', 'gYOS', [], 'Gyos'],
			['fallback', '', ['Guest'], 'Guest'],
			['json', { ok: true }, [2], JSON.stringify({ ok: true }, null, 2)],
			['number', 12.345, [2], '12.35'],
			['pluralize', 2, ['item', 'items'], '2 items'],
			['percent', 0.333, [1], '33.3%'],
			['join', ['a', 'b'], [' | '], 'a | b'],
			['limit', sourceArray, [2], ['a', 'b']],
			['reverse', sourceArray, [], ['c', 'b', 'a']]
		];

		for (const [name, value, args, expected] of cases) {
			expect(applyPipe(value, name, args), name).toEqual(expected);
		}
		expect(sourceArray).toEqual(['a', 'b', 'c']);
	});

	it('returns an applyDirective cleanup that calls the unmounted hook', () => {
		const name = unique('contract-directive');
		const mounted = vi.fn();
		const unmounted = vi.fn();
		const element = document.createElement('button');
		Gyos.directive(name, { mounted, unmounted });

		const cleanup = Gyos.applyDirective(element, name, 'Save', ['placement', 'top']);
		expect(mounted).toHaveBeenCalledWith(element, {
			value: 'Save',
			oldValue: undefined,
			arg: ['placement', 'top']
		});

		cleanup();
		expect(unmounted).toHaveBeenCalledOnce();
		expect(unmounted).toHaveBeenCalledWith(element);
	});

	it('applies transition styles idempotently', () => {
		Gyos.applyTransitionStyles();
		const first = document.getElementById('gyos-transitions');
		Gyos.applyTransitionStyles();

		expect(first).toBeInstanceOf(HTMLStyleElement);
		expect(document.querySelectorAll('#gyos-transitions')).toHaveLength(1);
		expect(document.getElementById('gyos-transitions')).toBe(first);
		expect(first!.textContent).toContain('[g-cloak]');
	});

	it('moves a portal and restores its exact original position on destroy', () => {
		document.body.innerHTML = `
			<div id="origin"><span id="before"></span><div id="portal">Modal</div><span id="after"></span></div>
			<div id="target"></div>
		`;
		const origin = document.getElementById('origin')!;
		const target = document.getElementById('target')!;
		const portal = document.getElementById('portal')!;

		Gyos.portalCreate(portal, '#target');
		expect(portal.parentElement).toBe(target);
		expect(Array.from(origin.childNodes).some(node => node.nodeType === Node.COMMENT_NODE)).toBe(true);

		Gyos.portalDestroy(portal);
		expect(portal.parentElement).toBe(origin);
		expect(Array.from(origin.children, child => child.id)).toEqual(['before', 'portal', 'after']);
		expect(Array.from(origin.childNodes).some(node => node.nodeType === Node.COMMENT_NODE)).toBe(false);
	});
});
