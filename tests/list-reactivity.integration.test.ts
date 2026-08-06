import { beforeEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';

type Line = {
	id: number;
	label: string;
	visible?: boolean;
};

let scopeId = 0;

const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

const input = (element: HTMLInputElement, value: string) => {
	element.value = value;
	element.dispatchEvent(new Event('input', { bubbles: true }));
};

function mountList(lines: Line[], keyed = true) {
	const name = `ListMatrix${++scopeId}`;
	document.body.innerHTML = `
		<div id="root" g-scope="${name}">
			<div class="row" *for="line, index in lines"${keyed ? ' g-key="line.id"' : ''}>
				<input class="label" g-model.trim="line.label" />
				<span class="snapshot">{index}|{line.id}|{line.label}</span>
			</div>
		</div>
	`;

	Gyos.scope(name, { lines });
	Gyos.mountAll();

	const root = document.getElementById('root')!;
	return Gyos.mountedScopes().get(root) as { lines: Line[] };
}

function expectRows(expected: string[]) {
	expect(Array.from(document.querySelectorAll('.snapshot'), el => el.textContent)).toEqual(
		expected.map((value, index) => `${index}|${value}`)
	);
	expect(Array.from(document.querySelectorAll<HTMLInputElement>('.label'), el => el.value)).toEqual(
		expected.map(value => value.split('|')[1])
	);
}

describe('list reactivity matrix', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('keeps keyed rows aligned across in-place array mutations', async () => {
		const state = mountList([
			{ id: 1, label: 'A' },
			{ id: 2, label: 'B' },
			{ id: 3, label: 'C' }
		]);

		state.lines.push({ id: 4, label: 'D' });
		await flush();
		expectRows(['1|A', '2|B', '3|C', '4|D']);

		state.lines.pop();
		await flush();
		expectRows(['1|A', '2|B', '3|C']);

		state.lines.unshift({ id: 0, label: 'Z' });
		await flush();
		expectRows(['0|Z', '1|A', '2|B', '3|C']);

		state.lines.shift();
		await flush();
		expectRows(['1|A', '2|B', '3|C']);

		state.lines.splice(1, 1, { id: 5, label: 'E' }, { id: 6, label: 'F' });
		await flush();
		expectRows(['1|A', '5|E', '6|F', '3|C']);

		state.lines.reverse();
		await flush();
		expectRows(['3|C', '6|F', '5|E', '1|A']);

		state.lines.sort((left, right) => left.id - right.id);
		await flush();
		expectRows(['1|A', '3|C', '5|E', '6|F']);
	});

	it('tracks keyed object and array replacement without retaining stale rows', async () => {
		const state = mountList([
			{ id: 1, label: 'A' },
			{ id: 2, label: 'B' },
			{ id: 3, label: 'C' }
		]);
		const replaced = state.lines[1];

		state.lines[1] = { id: 2, label: 'B2' };
		await flush();
		expectRows(['1|A', '2|B2', '3|C']);

		const labels = document.querySelectorAll<HTMLInputElement>('.label');
		input(labels[1], 'B3');
		await flush();
		expect(state.lines[1].label).toBe('B3');
		expect(replaced.label).toBe('B');

		state.lines = [state.lines[2], state.lines[0], state.lines[1]];
		await flush();
		expectRows(['3|C', '1|A', '2|B3']);
	});

	it('fully rerenders unkeyed rows for structural mutations', async () => {
		const state = mountList([
			{ id: 1, label: 'A' },
			{ id: 2, label: 'B' },
			{ id: 3, label: 'C' }
		], false);

		state.lines.splice(1, 1);
		await flush();
		expectRows(['1|A', '3|C']);

		state.lines.reverse();
		await flush();
		expectRows(['3|C', '1|A']);

		input(document.querySelector<HTMLInputElement>('.label')!, 'C2');
		await flush();
		expect(state.lines[0].label).toBe('C2');
		expectRows(['3|C2', '1|A']);
	});

	it('updates nested structural content after keyed rows move', async () => {
		const name = `NestedList${++scopeId}`;
		document.body.innerHTML = `
			<div id="root" g-scope="${name}">
				<div class="row" *for="line, index in lines" g-key="line.id">
					<button class="toggle" @click="line.visible = !line.visible">Toggle</button>
					<span class="identity">{index}|{line.id}</span>
					<strong class="detail" *if="line.visible">{line.label}</strong>
				</div>
			</div>
		`;
		Gyos.scope(name, {
			lines: [
				{ id: 1, label: 'A', visible: true },
				{ id: 2, label: 'B', visible: true },
				{ id: 3, label: 'C', visible: true }
			]
		});
		Gyos.mountAll();
		const state = Gyos.mountedScopes().get(document.getElementById('root')!) as { lines: Line[] };

		state.lines.reverse();
		await flush();
		expect(Array.from(document.querySelectorAll('.identity'), el => el.textContent)).toEqual([
			'0|3',
			'1|2',
			'2|1'
		]);
		expect(Array.from(document.querySelectorAll('.detail'), el => el.textContent)).toEqual(['C', 'B', 'A']);

		(document.querySelectorAll('.toggle')[0] as HTMLElement).click();
		await flush();
		expect(state.lines[0].visible).toBe(false);
		expect(Array.from(document.querySelectorAll('.detail'), el => el.textContent)).toEqual(['B', 'A']);
	});

	it('disposes bindings owned by a removed keyed row', async () => {
		const state = mountList([
			{ id: 1, label: 'A' },
			{ id: 2, label: 'B' }
		]);
		const removedLine = state.lines[0];
		const removedRow = document.querySelector('.row')!;

		state.lines.splice(0, 1);
		await flush();
		expect(document.body.contains(removedRow)).toBe(false);
		const detachedSnapshot = removedRow.querySelector('.snapshot')!.textContent;

		removedLine.label = 'Detached update';
		await flush();
		expect(removedRow.querySelector('.snapshot')!.textContent).toBe(detachedSnapshot);
	});
});
