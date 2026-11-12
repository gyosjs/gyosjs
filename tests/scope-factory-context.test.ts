import { afterEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';
import { setExpressionRuntime } from '../src/runtime/evaluator';
import { cspExpressionRuntime } from '../src/runtime/csp-evaluator';
import { standardExpressionRuntime } from '../src/runtime/standard-evaluator';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
afterEach(() => {
	Gyos.cleanup();
	document.body.innerHTML = '';
	setExpressionRuntime(standardExpressionRuntime);
});

for (const [name, runtime] of [['standard', standardExpressionRuntime], ['csp', cspExpressionRuntime]] as const) {
	describe(`${name} factory context lifecycle`, () => {
		it('attaches captured context and instance observers to each mount and disposes only that mount', async () => {
			setExpressionRuntime(runtime);
			const records: any[] = [];
			Gyos.scope(`FactoryContext${name}`, context => {
				const record = { watch: vi.fn(), contextWatch: vi.fn(), effect: vi.fn(), contextEffect: vi.fn(), cleanup: vi.fn() };
				records.push(record);
				return {
					count: 0,
					onMount() {
						this.$watch('count', record.watch);
						context.$watch('count', record.contextWatch, { immediate: true });
						this.$effect(() => { record.effect(this.count); return record.cleanup; });
						context.$effect(() => record.contextEffect(this.count));
					}
				};
			});
			document.body.innerHTML = `<div id="a" g-scope="FactoryContext${name}" gd-count="2"><button @click="count++">{count}</button></div><div id="b" g-scope="FactoryContext${name}" gd-count="8">{count}</div>`;
			Gyos.mountAll(); await flush();
			const a = document.getElementById('a')!, b = document.getElementById('b')!;
			const first = Gyos.mountedScopes().get(a), second = Gyos.mountedScopes().get(b);
			expect(records[0].effect.mock.calls).toEqual([[2]]);
			expect(records[1].effect.mock.calls).toEqual([[8]]);
			expect(records[0].contextWatch).toHaveBeenCalledWith(2, undefined);
			a.querySelector('button')!.click(); await flush();
			expect(records[0].watch).toHaveBeenCalledWith(3, 2);
			expect(records[0].contextWatch).toHaveBeenLastCalledWith(3, 2);
			expect(records[0].effect.mock.calls).toEqual([[2], [3]]);
			expect(records[0].contextEffect.mock.calls).toEqual([[2], [3]]);
			expect(records[0].cleanup).toHaveBeenCalledTimes(1);
			expect(records[1].watch).not.toHaveBeenCalled();
			first.count = 4; // Cleanup must also cancel queued work.
			Gyos.cleanup(a); await flush();
			expect(records[0].cleanup).toHaveBeenCalledTimes(2);
			expect(records[0].effect).toHaveBeenCalledTimes(2);
			expect(records[0].watch).toHaveBeenCalledTimes(1);
			expect(records[0].contextWatch).toHaveBeenCalledTimes(2);
			expect(records[0].contextEffect).toHaveBeenCalledTimes(2);
			second.count = 9; await flush();
			expect(records[1].watch).toHaveBeenCalledWith(9, 8);
			expect(records[1].contextEffect).toHaveBeenLastCalledWith(9);
			Gyos.mount(a); await flush();
			expect(Gyos.mountedScopes().get(a)).not.toBe(first);
			expect(records[2].effect).toHaveBeenCalledWith(0);
		});

		it('watches array dot paths and deep changes while shallow watch tracks replacement', async () => {
			setExpressionRuntime(runtime);
			const field = vi.fn(), deep = vi.fn(), shallow = vi.fn();
			Gyos.scope(`ArrayWatch${name}`, () => ({
				items: [{ count: 0 }],
				onMount() {
					this.$watch('items.0.count', field);
					this.$watch('items', deep, { deep: true });
					this.$watch('items', shallow);
				}
			}));
			document.body.innerHTML = `<div g-scope="ArrayWatch${name}"></div>`;
			Gyos.mountAll(); await flush();
			const state = Gyos.mountedScopes().get(document.querySelector('div')!);
			state.items[0].count = 1; await flush();
			expect(field).toHaveBeenCalledWith(1, 0);
			expect(deep).toHaveBeenLastCalledWith([{ count: 1 }], [{ count: 0 }]);
			state.items.push({ count: 2 }); await flush();
			expect(deep).toHaveBeenCalledTimes(2);
			expect(shallow).not.toHaveBeenCalled();
			state.items = [{ count: 5 }]; await flush();
			expect(field).toHaveBeenLastCalledWith(5, 1);
			expect(shallow).toHaveBeenCalledTimes(1);
		});
	});
}
