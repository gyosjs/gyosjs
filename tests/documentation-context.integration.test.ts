import { beforeEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';

let id = 0;

const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

describe('documentation scope context contracts', () => {
	beforeEach(() => {
		for (const element of Array.from(Gyos.mountedScopes().keys())) Gyos.cleanup(element);
		document.body.innerHTML = '';
		Gyos.clearAllEvents();
		vi.restoreAllMocks();
	});

	it('supports local events, DOM events, watch, effect, and element-scoped injection', async () => {
		const scopeName = `ContextDocs${++id}`;
		const localListener = vi.fn();
		const domListener = vi.fn();
		const watchName = vi.fn();
		const effectItem = vi.fn();
		document.body.innerHTML = `
			<div g-provide='{"theme":"dark"}'>
				<div id="root" g-scope="${scopeName}">
					<button @click="$emit('changed', user.name)">Emit</button>
					<p>{theme}|{user.name}|{items[0].count}</p>
				</div>
			</div>
		`;
		const root = document.getElementById('root')!;
		root.addEventListener('changed', domListener);
		Gyos.scope(scopeName, {
			theme: '',
			user: { name: 'Ada' },
			items: [{ count: 0 }],
			onMount() {
				this.theme = this.$inject('theme');
				this.$on('changed', localListener);
				this.$watch('user.name', watchName);
				this.$effect(() => effectItem(this.items[0].count));
			}
		});

		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(root);
		await flush();
		expect(document.querySelector('p')!.textContent).toBe('dark|Ada|0');
		expect(effectItem).toHaveBeenLastCalledWith(0);

		state.user.name = 'Grace';
		state.items[0].count = 1;
		await flush();
		expect(watchName).toHaveBeenCalledWith('Grace', 'Ada');
		expect(effectItem).toHaveBeenLastCalledWith(1);

		document.querySelector('button')!.click();
		expect(localListener).toHaveBeenCalledWith('Grace');
		expect(domListener).toHaveBeenCalledTimes(1);
		expect((domListener.mock.calls[0][0] as CustomEvent).detail).toEqual(['Grace']);
	});

	it('shares one reactive store across independent scopes', async () => {
		const storeName = `CounterStoreDocs${++id}`;
		const firstScope = `StoreFirst${id}`;
		const secondScope = `StoreSecond${id}`;
		const counter = Gyos.store(storeName, {
			count: 0,
			increment() { this.count++; }
		});
		document.body.innerHTML = `
			<div id="first" g-scope="${firstScope}">
				<span>{counter.count}</span><button @click="counter.increment()">Increase</button>
			</div>
			<div id="second" g-scope="${secondScope}"><span>{counter.count}</span></div>
		`;
		Gyos.scope(firstScope, { counter });
		Gyos.scope(secondScope, { counter });

		Gyos.mountAll();
		document.querySelector('button')!.click();
		await flush();
		expect(Array.from(document.querySelectorAll('span'), el => el.textContent)).toEqual(['1', '1']);
		expect(Gyos.store(storeName)).toBe(counter);
		expect(Gyos.hasStore(storeName)).toBe(true);

		Gyos.removeStore(storeName);
		expect(Gyos.hasStore(storeName)).toBe(false);
	});

	it('keeps the global event bus separate and honors once/off', () => {
		const regular = vi.fn();
		const oneTime = vi.fn();
		const unsubscribe = Gyos.on('docs:event', regular);
		Gyos.once('docs:event', oneTime);

		Gyos.emit('docs:event', 1);
		Gyos.emit('docs:event', 2);
		expect(regular.mock.calls).toEqual([[1], [2]]);
		expect(oneTime).toHaveBeenCalledTimes(1);
		expect(Gyos.getEventListeners()['docs:event']).toBe(1);

		unsubscribe();
		Gyos.emit('docs:event', 3);
		expect(regular).toHaveBeenCalledTimes(2);
	});

	it('supports global provide/inject and defaults', () => {
		const key = `docs-service-${++id}`;
		const service = { name: 'GyosJS' };
		Gyos.provide(key, service);
		expect(Gyos.inject(key)).toBe(service);
		expect(Gyos.inject(`${key}-missing`, 'fallback')).toBe('fallback');
	});

	it('cleans every mounted scope when cleanup is called without a target', async () => {
		const scopeName = `CleanupDocs${++id}`;
		const onUnmount = vi.fn();
		document.body.innerHTML = `<div id="root" g-scope="${scopeName}">{count}</div>`;
		Gyos.scope(scopeName, { count: 0, onUnmount });
		Gyos.mountAll();
		const root = document.getElementById('root')!;
		const state = Gyos.mountedScopes().get(root);

		Gyos.cleanup();
		state.count = 1;
		await flush();

		expect(onUnmount).toHaveBeenCalledTimes(1);
		expect(root.textContent).toBe('0');
		expect(Gyos.mountedScopes().has(root)).toBe(false);
	});
});
