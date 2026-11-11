import { afterEach, describe, expect, it } from 'vitest';
import Gyos from '../src/index';
import { makeReactive } from '../src/core/reactive';
import { computed, effect, isComputed, isSignal, signal } from '../src/reactivity/signal';
import { setExpressionRuntime } from '../src/runtime/evaluator';
import { cspExpressionRuntime } from '../src/runtime/csp-evaluator';
import { standardExpressionRuntime } from '../src/runtime/standard-evaluator';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
afterEach(() => {
	for (const root of Gyos.mountedScopes().keys()) Gyos.cleanup(root);
	document.body.innerHTML = '';
	setExpressionRuntime(standardExpressionRuntime);
});

describe('signals exposed through reactive scopes', () => {
	it('preserves identity and public signal/computed properties at every nesting level', () => {
		const count = signal(2), doubled = computed(() => count() * 2);
		const scope = makeReactive({ count, doubled, nested: { count }, items: [count] });
		expect(scope.count).toBe(count);
		expect(scope.nested.count).toBe(count);
		expect(scope.items[0]).toBe(count);
		expect(scope.doubled).toBe(doubled);
		expect(isSignal(scope.count)).toBe(true);
		expect(isComputed(scope.doubled)).toBe(true);
		expect(scope.count.peek).toBe(2);
		scope.count.value = 3;
		expect(scope.doubled.value).toBe(6);
		scope.count.update(value => value + 1);
		expect(scope.count()).toBe(4);
		expect(scope.doubled.peek).toBe(8);
		expect(Object.getOwnPropertyDescriptor(scope.doubled, 'value')?.set).toBeUndefined();
	});

	it('keeps ordinary methods bound and accessor setters connected to their signal', () => {
		const count = signal(1);
		const scope = makeReactive({ count,
			increment() { this.count(this.count() + 1); },
			get model() { return count(); }, set model(value: number) { count(value); }
		});
		const increment = scope.increment;
		increment(); expect(count()).toBe(2);
		scope.model = 7; expect(scope.count.value).toBe(7);
	});

	it('resubscribes when a signal or computed field is replaced, and disposes old dependencies', async () => {
		const first = signal(1), second = signal(10), other = signal(100);
		const scope = makeReactive({ nested: { value: first }, derived: computed(() => first() * 2) });
		const seen: number[][] = [];
		const stop = effect(() => seen.push([scope.nested.value.value, scope.derived()]));
		scope.nested.value = second; scope.derived = computed(() => other() * 2); await flush();
		expect(seen).toEqual([[1, 2], [10, 200]]);
		first(3); await flush(); expect(seen).toHaveLength(2);
		second(11); other(101); await flush(); expect(seen.at(-1)).toEqual([11, 202]);
		stop(); second(12); await flush(); expect(seen).toHaveLength(3);
	});
});

for (const [name, runtime] of [['standard', standardExpressionRuntime], ['csp', cspExpressionRuntime]] as const) {
	describe(`${name} signal model integration`, () => {
		it('binds nested boolean signals without treating the callable itself as checked', async () => {
			setExpressionRuntime(runtime);
			const accepted = signal(false), age = signal(2), choice = signal('a');
			const scopeName = `SignalControls${name}`;
			document.body.innerHTML = `<div g-scope="${scopeName}"><input id="flag" type="checkbox" g-model="form.accepted"><input id="age" g-model.number="form.age"><select g-model="form.choice"><option value="a">A</option><option value="b">B</option></select></div>`;
			Gyos.scope(scopeName, () => ({ form: { accepted, age, choice } })); Gyos.mountAll(); await flush();
			const checkbox = document.getElementById('flag') as HTMLInputElement;
			expect(checkbox.checked).toBe(false);
			checkbox.checked = true; checkbox.dispatchEvent(new Event('input', { bubbles: true })); await flush(); expect(accepted()).toBe(true);
			accepted(false); await flush(); expect(checkbox.checked).toBe(false);
			const number = document.getElementById('age') as HTMLInputElement;
			number.value = '7'; number.dispatchEvent(new Event('input', { bubbles: true })); await flush(); expect(age()).toBe(7);
			const select = document.querySelector('select')!;
			select.value = 'b'; select.dispatchEvent(new Event('input', { bubbles: true })); await flush(); expect(choice()).toBe('b');
			choice('a'); await flush(); expect(select.value).toBe('a');
		});

		it('updates the closure signal on input and renders later programmatic changes', async () => {
			setExpressionRuntime(runtime);
			const text = signal('initial'), length = computed(() => text().length);
			const scopeName = `SignalModel${name}`;
			document.body.innerHTML = `<div g-scope="${scopeName}"><input g-model="text"><output>{text()} / {length.value}</output></div>`;
			Gyos.scope(scopeName, () => ({ text, length })); Gyos.mountAll(); await flush();
			const root = document.querySelector('div')!, input = root.querySelector('input')!, output = root.querySelector('output')!;
			expect(input.value).toBe('initial'); expect(output.textContent).toBe('initial / 7');
			input.value = 'typed'; input.dispatchEvent(new Event('input', { bubbles: true })); await flush();
			expect(text()).toBe('typed'); expect(output.textContent).toBe('typed / 5');
			text('reset'); await flush(); expect(input.value).toBe('reset'); expect(output.textContent).toBe('reset / 5');
			Gyos.cleanup(root); text('after cleanup'); await flush(); expect(input.value).toBe('reset');
		});

		it('shares explicitly supplied signal models with child scopes, nested fields and keyed rows', async () => {
			setExpressionRuntime(runtime);
			const text = signal('initial'), rowText = signal('row');
			const scopeName = `NestedSignalModel${name}`;
			document.body.innerHTML = `<div g-scope="${scopeName}"><section g-scope="${scopeName}Child"><input id="shared" g-model="text"></section><input id="nested" g-model="form.text"><div *for="item in items" g-key="item.id"><input class="row" g-model="item.text"></div></div>`;
			Gyos.scope(scopeName, () => ({ text, form: { text }, items: [{ id: 1, text: rowText }] }));
			Gyos.scope(`${scopeName}Child`, () => ({ text })); Gyos.mountAll(); await flush();
			for (const id of ['shared', 'nested']) {
				const input = document.getElementById(id) as HTMLInputElement;
				input.value = id; input.dispatchEvent(new Event('input', { bubbles: true })); await flush();
				expect(text()).toBe(id);
			}
			const row = document.querySelector('.row') as HTMLInputElement;
			row.value = 'edited row'; row.dispatchEvent(new Event('input', { bubbles: true })); await flush();
			expect(rowText()).toBe('edited row');
			text('programmatic'); rowText('restored row'); await flush();
			expect((document.getElementById('shared') as HTMLInputElement).value).toBe('programmatic');
			expect((document.getElementById('nested') as HTMLInputElement).value).toBe('programmatic');
			expect(row.value).toBe('restored row');
		});
	});
}
