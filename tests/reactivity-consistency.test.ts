import { describe, expect, it, vi } from 'vitest';
import { batch, computed, effect, signal, untrack } from '../src/reactivity/signal';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe('reactivity consistency', () => {
	it('preserves immediate initial effects, deferred writes and synchronous outer batch completion', async () => {
		const source = signal(0);
		const seen: number[] = [];
		const stop = effect(() => { seen.push(source()); });
		expect(seen).toEqual([0]);
		source(1); source(2);
		expect(seen).toEqual([0]);
		await flush();
		expect(seen).toEqual([0, 2]);
		batch(() => {
			source(3);
			batch(() => { source(4); });
			expect(seen).toEqual([0, 2]);
		});
		expect(seen).toEqual([0, 2, 4]);
		stop();
	});

	it('settles a batch even when its callback throws and isolates effect errors', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const source = signal(0);
		const stopBad = effect(() => { if (source()) throw new Error('effect'); });
		const good = vi.fn(() => source());
		const stopGood = effect(good);
		expect(() => batch(() => { source(1); throw new Error('batch'); })).toThrow('batch');
		expect(good).toHaveBeenCalledTimes(2);
		source(2); await flush();
		expect(good).toHaveBeenCalledTimes(3);
		stopBad(); stopGood(); log.mockRestore();
	});

	it('cleans conditional effect dependencies and never tracks cleanup reads', async () => {
		const choose = signal(true), a = signal(1), b = signal(2), ignored = signal(0);
		const cleanup = vi.fn(() => { ignored(); });
		const render = vi.fn(() => { choose() ? a() : b(); return cleanup; });
		const stop = effect(render);
		choose(false); await flush();
		expect(cleanup).toHaveBeenCalledTimes(1);
		a(3); ignored(1); await flush();
		expect(render).toHaveBeenCalledTimes(2);
		b(4); await flush();
		expect(render).toHaveBeenCalledTimes(3);
		stop(); stop();
		expect(cleanup).toHaveBeenCalledTimes(3);
	});

	it('keeps subscription callbacks untracked when a batch runs inside an effect', async () => {
		const trigger = signal(0), written = signal(0), unrelated = signal(0);
		const unsubscribe = written.subscribe(() => { unrelated(); });
		const render = vi.fn(() => { const n = trigger(); batch(() => written(n)); });
		const stop = effect(render);
		trigger(1); await flush();
		unrelated(1); await flush();
		expect(render).toHaveBeenCalledTimes(2);
		stop(); unsubscribe();
	});

	it('refreshes after each write/read pair while batching notifications once', async () => {
		const source = signal(1);
		const doubled = computed(() => source() * 2);
		const values: number[] = [];
		const stop = doubled.subscribe(() => { values.push(doubled()); });
		batch(() => {
			source(2); expect(doubled()).toBe(4);
			source(3); expect(doubled()).toBe(6);
		});
		await flush();
		expect(values).toEqual([6]);
		stop();
	});

	it('flushes writes queued by a plain subscriber in a subsequent microtask', async () => {
		const a = signal(0), b = signal(0);
		const first = a.subscribe(() => b(a()));
		const callback = vi.fn();
		const second = b.subscribe(callback);
		a(1); await flush();
		expect(callback).toHaveBeenCalledTimes(1);
		first(); second();
	});
	it('refreshes cached computed reads immediately, including inside a batch', () => {
		const source = signal(2);
		const doubled = computed(() => source() * 2);
		expect(doubled()).toBe(4);
		source(3);
		expect(doubled.value).toBe(6);
		batch(() => { source(4); expect(doubled.peek).toBe(8); });
	});

	it('stays lazy after the first read and caches actual computations', async () => {
		const source = signal(1);
		const calculate = vi.fn(() => source() * 2);
		const doubled = computed(calculate);
		expect(calculate).not.toHaveBeenCalled();
		expect(doubled()).toBe(2);
		expect(doubled()).toBe(2);
		source(2);
		await flush();
		expect(calculate).toHaveBeenCalledTimes(1);
		expect(doubled()).toBe(4);
		expect(calculate).toHaveBeenCalledTimes(2);
	});

	it.each([false, true])('never exposes mixed source/derived values (batch=%s)', async batched => {
		const source = signal(1);
		const doubled = computed(() => source() * 2);
		const seen: number[][] = [];
		const stop = effect(() => { seen.push([source(), doubled()]); });
		if (batched) batch(() => source(2)); else source(2);
		await flush();
		expect(seen).toEqual([[1, 2], [2, 4]]);
		stop();
	});

	it('settles a diamond graph once with the final values', async () => {
		const source = signal(1);
		const left = computed(() => source() + 1);
		const right = computed(() => source() * 2);
		const sum = computed(() => left() + right());
		const seen: number[] = [];
		const stop = effect(() => { seen.push(sum()); });
		batch(() => { source(2); batch(() => source(3)); });
		await flush();
		expect(seen).toEqual([4, 10]);
		stop();
	});

	it('does not rerun consumers when a computed result stays equal', async () => {
		const source = signal(1);
		const parity = computed(() => source() % 2);
		const calculate = vi.fn(() => parity() === 1);
		const odd = computed(calculate);
		const consumer = vi.fn(() => odd());
		const stop = effect(consumer);
		source(3);
		await flush();
		expect(calculate).toHaveBeenCalledTimes(1);
		expect(consumer).toHaveBeenCalledTimes(1);
		source(4);
		await flush();
		expect(consumer).toHaveBeenCalledTimes(2);
		stop();
	});

	it('replaces conditional dependencies and tracks chained computed reads', async () => {
		const useLeft = signal(true), left = signal(1), right = signal(10);
		const selected = computed(() => useLeft() ? left() : right());
		const calculate = vi.fn(() => selected() * 2);
		const doubled = computed(calculate);
		expect(doubled()).toBe(2);
		useLeft(false);
		expect(doubled()).toBe(20);
		left(2);
		await flush();
		expect(doubled()).toBe(20);
		expect(calculate).toHaveBeenCalledTimes(2);
		right(11);
		expect(doubled()).toBe(22);
	});

	it('subscribes before the first read and cancels already queued callbacks', async () => {
		const source = signal(1);
		const derived = computed(() => source() * 2);
		const seen: number[] = [];
		const stop = derived.subscribe(() => { seen.push(derived()); });
		expect(seen).toEqual([]);
		source(2);
		await flush();
		expect(seen).toEqual([4]);
		source(3);
		stop();
		await flush();
		expect(seen).toEqual([4]);
		const callback = vi.fn();
		const unsubscribe = source.subscribe(callback);
		source(4);
		unsubscribe();
		await flush();
		expect(callback).not.toHaveBeenCalled();
	});

	it('uses Object.is equality for NaN and signed zero', async () => {
		const source = signal(1);
		const result = computed(() => source() < 3 ? NaN : source() === 3 ? 0 : -0);
		const changed = vi.fn();
		const stop = result.subscribe(changed);
		source(2); await flush();
		expect(changed).not.toHaveBeenCalled();
		source(3); await flush();
		source(4); await flush();
		expect(changed).toHaveBeenCalledTimes(2);
		stop();
	});

	it('does not track peek/untrack reads in the surrounding effect', async () => {
		const source = signal(1), trigger = signal(0);
		const derived = computed(() => source() * 2);
		const consumer = vi.fn(() => { trigger(); derived.peek; untrack(() => derived()); });
		const stop = effect(consumer);
		source(2); await flush();
		expect(consumer).toHaveBeenCalledTimes(1);
		trigger(1); await flush();
		expect(consumer).toHaveBeenCalledTimes(2);
		stop();
	});

	it('does not rerun an effect twice when a pending write joins a batch', async () => {
		const source = signal(0);
		const consumer = vi.fn(() => source());
		const stop = effect(consumer);
		source(1);
		batch(() => source(2));
		await flush();
		expect(consumer).toHaveBeenCalledTimes(2);
		stop();
	});

	it('settles already dirty computed consumers synchronously when a later write joins a batch', async () => {
		const source = signal(1);
		const doubled = computed(() => source() * 2);
		const chained = computed(() => doubled() + 1);
		const seen: number[] = [];
		const stop = effect(() => { seen.push(chained()); });
		source(2);
		batch(() => source(3));
		expect(seen).toEqual([3, 7]);
		await flush();
		expect(seen).toEqual([3, 7]);
		stop();
	});

	it('preserves error isolation and recovers after dependency changes', () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const valid = signal(true);
		const result = computed(() => { if (!valid()) throw new Error('invalid'); return 42; });
		expect(result()).toBe(42);
		valid(false);
		expect(result()).toBe(42);
		expect(log).toHaveBeenCalled();
		valid(true);
		expect(result()).toBe(42);
		log.mockRestore();
	});
});
