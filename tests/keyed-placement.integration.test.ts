import { afterEach, describe, expect, it } from 'vitest';
import Gyos from '../src/index';

let serial = 0;
afterEach(() => {
	Gyos.cleanup();
	document.body.innerHTML = '';
});
const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

function mount(ids: number[]) {
	const name = `Placement${++serial}`;
	document.body.innerHTML = `<section g-scope="${name}"><b id="before">before</b><div class="row" *for="item in items()" g-key="item.id" :data-id="item.id"><input :value="item.label"><span>{item.label}</span></div><b id="after">after</b></section>`;
	const items = Gyos.signal(ids.map((id) => ({ id, label: String(id) })));
	Gyos.scope(name, { items });
	Gyos.mountAll();
	return { items, root: document.querySelector('section')! };
}

describe('keyed placement', () => {
	it('keeps order and identity across every permutation of five rows', async () => {
		const { items, root } = mount([0, 1, 2, 3, 4]);
		const original = [...root.querySelectorAll<HTMLElement>('.row')];
		function permutations(values: number[]): number[][] {
			return values.length
				? values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map((rest) => [value, ...rest]))
				: [[]];
		}
		for (const next of permutations([0, 1, 2, 3, 4])) {
			items(next.map((id) => ({ id, label: String(id) })));
			await flush();
			const rows = [...root.querySelectorAll<HTMLElement>('.row')];
			expect(rows.map((el) => Number(el.dataset.id))).toEqual(next);
			for (let i = 0; i < rows.length; i++) expect(rows[i]).toBe(original[next[i]]);
		}
	});
	it('retains the legacy placement around foreign siblings and mixed inserts', async () => {
		const { items, root } = mount([0, 1, 2, 3]);
		const marker = document.createElement('i');
		marker.textContent = 'foreign';
		root.insertBefore(marker, root.querySelector('[data-id="2"]'));
		items([3, 5, 1, 6, 0].map((id) => ({ id, label: String(id) })));
		await flush();
		expect([...root.querySelectorAll<HTMLElement>('.row')].map((el) => Number(el.dataset.id))).toEqual([3, 5, 1, 6, 0]);
		const rows = [...root.querySelectorAll('.row')];
		for (let i = 1; i < rows.length; i++) expect(rows[i - 1].nextSibling).toBe(rows[i]);
		expect(rows.at(-1)!.nextSibling).toBe(marker);
		expect(root.lastElementChild?.id).toBe('after');
	});
	it('keeps order and identity across every permutation of five rows', async () => {
		const { items, root } = mount([0, 1, 2, 3, 4]);
		const original = [...root.querySelectorAll<HTMLElement>('.row')];
		function permutations(values: number[]): number[][] {
			return values.length
				? values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map((rest) => [value, ...rest]))
				: [[]];
		}
		for (const next of permutations([0, 1, 2, 3, 4])) {
			items(next.map((id) => ({ id, label: String(id) })));
			await flush();
			const rows = [...root.querySelectorAll<HTMLElement>('.row')];
			expect(rows.map((el) => Number(el.dataset.id))).toEqual(next);
			for (let i = 0; i < rows.length; i++) expect(rows[i]).toBe(original[next[i]]);
		}
	});
	it('retains the legacy placement around foreign siblings and mixed inserts', async () => {
		const { items, root } = mount([0, 1, 2, 3]);
		const marker = document.createElement('i');
		marker.textContent = 'foreign';
		root.insertBefore(marker, root.querySelector('[data-id="2"]'));
		items([3, 5, 1, 6, 0].map((id) => ({ id, label: String(id) })));
		await flush();
		expect([...root.querySelectorAll<HTMLElement>('.row')].map((el) => Number(el.dataset.id))).toEqual([3, 5, 1, 6, 0]);
		const rows = [...root.querySelectorAll('.row')];
		for (let i = 1; i < rows.length; i++) expect(rows[i - 1].nextSibling).toBe(rows[i]);
		expect(rows.at(-1)!.nextSibling).toBe(marker);
		expect(root.lastElementChild?.id).toBe('after');
	});
	it.each([
		['same order', [0, 1, 2, 3, 4, 5], 0],
		['adjacent swap', [0, 1, 3, 2, 4, 5], 1],
		['distant swap', [0, 4, 2, 3, 1, 5], 2],
		['left rotation', [1, 2, 3, 4, 5, 0], 1],
		['right rotation', [5, 0, 1, 2, 3, 4], 1],
		['reverse', [5, 4, 3, 2, 1, 0], 5],
		['prepend', [6, 0, 1, 2, 3, 4, 5], 0],
		['remove', [0, 1, 3, 4, 5], 0]
	] as const)('%s avoids unnecessary moves and preserves identity', async (_, next, maxMoves) => {
		const { items, root } = mount([0, 1, 2, 3, 4, 5]);
		const before = new Map([...root.querySelectorAll<HTMLElement>('.row')].map((el) => [Number(el.dataset.id), el]));
		const observer = new MutationObserver(() => {});
		observer.observe(root, { childList: true });
		Gyos.batch(() => items(next.map((id) => ({ id, label: `new-${id}` }))));
		const moves = observer
			.takeRecords()
			.flatMap((record) => [...record.addedNodes])
			.filter((node) => before.get(Number((node as HTMLElement).dataset?.id)) === node).length;
		observer.disconnect();
		await flush();
		const rows = [...root.querySelectorAll<HTMLElement>('.row')];
		expect(rows.map((el) => Number(el.dataset.id))).toEqual(next);
		expect(rows.map((el) => el.textContent)).toEqual(next.map((id) => `new-${id}`));
		for (const row of rows)
			if (before.has(Number(row.dataset.id))) expect(row).toBe(before.get(Number(row.dataset.id)));
		expect(moves).toBeLessThanOrEqual(maxMoves);
		expect(root.firstElementChild?.id).toBe('before');
		expect(root.lastElementChild?.id).toBe('after');
	});

	it('preserves a moved input and its selection while updating its data', async () => {
		const { items, root } = mount([0, 1, 2, 3]);
		const input = root.querySelector<HTMLInputElement>('[data-id="0"] input')!;
		items()[0].label = 'editing';
		items([...items()]);
		await flush();
		input.focus();
		input.setSelectionRange(1, 4, 'backward');
		items([items()[1], items()[2], items()[3], items()[0]]);
		await flush();
		expect(document.activeElement).toBe(input);
		expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([1, 4, 'backward']);
	});
});
