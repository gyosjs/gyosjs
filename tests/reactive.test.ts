import { describe, expect, it } from 'vitest';
import { makeReactive, reactive } from '../src/core/reactive';
import { effect } from '../src/reactivity/signal';

describe('reactive objects', () => {
	it('does not wrap an existing reactive proxy again', () => {
		const proxy = reactive({ value: 1 });

		expect(reactive(proxy)).toBe(proxy);
	});

	it('keeps aggregate getters in sync after filtering a reactive array', async () => {
		const state = makeReactive({
			lines: [
				{ id: 1, hours: 2, rate: 90 },
				{ id: 2, hours: 5, rate: 80 }
			],
			get subtotal() {
				return this.lines.reduce(
					(sum, line) => sum + line.hours * line.rate,
					0
				);
			}
		});
		const subtotals: number[] = [];
		const remainingLine = state.lines[0];
		const dispose = effect(() => {
			subtotals.push(state.subtotal);
		});

		state.lines = state.lines.filter(line => line.id !== 2);
		await Promise.resolve();

		expect(state.lines[0]).toBe(remainingLine);
		expect(subtotals[subtotals.length - 1]).toBe(180);

		// Existing keyed rows keep this item reference after the array is replaced.
		remainingLine.hours = 7;
		await Promise.resolve();

		expect(state.lines[0].hours).toBe(7);
		expect(state.subtotal).toBe(630);
		expect(subtotals[subtotals.length - 1]).toBe(630);

		dispose();
	});
});
