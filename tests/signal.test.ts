import { describe, it, expect, vi } from 'vitest';
import { signal, computed, effect } from '../src/reactivity/signal';

describe('signal reactivity', () => {
	it('updates value', () => {
		const count = signal(0);
		count.value = 1;
		count.value = 2;
		count.value = 3;
		expect(count.value).toBe(3);
	});

	it('supports callable getter/setter syntax', () => {
		const state = signal('a');
		expect(state()).toBe('a');
		state('b');
		expect(state.value).toBe('b');
	});

	it('computes derived values lazily and caches until invalidated', () => {
		const base = signal(2);
		const calculate = vi.fn(() => base.value * 2);
		const doubled = computed(calculate);

		base.value = 3;
		
		expect(doubled.value).toBe(6);

		// First read computes
		expect(doubled()).toBe(6);
		// Cached until dependency changes
		expect(doubled()).toBe(6);
		expect(calculate).toHaveBeenCalledTimes(1);
		base(4);
		expect(doubled()).toBe(8);
		expect(calculate).toHaveBeenCalledTimes(2);
	});

	it('cleans up effect subscriptions on unsubscribe', () => {
		const sig = signal(0);
		const spy = vi.fn();

		const dispose = effect(() => {
			sig.value;
			spy();
		});

		expect(spy).toHaveBeenCalledTimes(1);
		dispose(); // should remove from subscribers
		sig.value = 1;
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('does not run a queued effect after it is disposed', async () => {
		const source = signal(0);
		const spy = vi.fn();
		const dispose = effect(() => {
			source.value;
			spy();
		});

		source.value = 1;
		dispose();
		await Promise.resolve();

		expect(spy).toHaveBeenCalledTimes(1);
	});
});
