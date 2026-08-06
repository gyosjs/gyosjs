import { describe, it, expect, vi, beforeEach } from 'vitest';

const routerScripts = vi.hoisted(() => ({
	executeScripts: vi.fn(),
	executeScriptsInNodes: vi.fn()
}));
vi.mock('../src/core/router/script', () => routerScripts);

import { performSwap } from '../src/core/router/swap';

describe('router swap/morph', () => {
	beforeEach(() => {
		routerScripts.executeScripts.mockClear();
		routerScripts.executeScriptsInNodes.mockClear();
	});

	it('morphs attributes and text content', async () => {
		const target = document.createElement('div');
		target.innerHTML = `<span id="item" data-old="1">Old</span>`;

		const source = document.createElement('div');
		source.innerHTML = `<span id="item" data-new="1">New</span>`;

		await performSwap(target.firstElementChild as HTMLElement, source.firstElementChild as HTMLElement, 'morph');

		const span = target.querySelector('span')!;
		expect(span.getAttribute('data-old')).toBeNull();
		expect(span.getAttribute('data-new')).toBe('1');
		expect(span.textContent).toBe('New');
	});

	it('runs executeScripts after swap', async () => {
		const target = document.createElement('div');
		const source = document.createElement('div');
		source.innerHTML = `<script>window.__ran=true;</script>`;

		await performSwap(target, source, 'inner');
		expect(routerScripts.executeScripts).toHaveBeenCalled();
	});

	it('preserves persist islands during morph', async () => {
		const target = document.createElement('div');
		target.innerHTML = `<div g-persist id="persist"><span>keep</span></div><p id="old">old</p>`;

		const source = document.createElement('div');
		source.innerHTML = `<div g-persist id="persist"><span>keep</span></div><p id="old">new</p>`;

		await performSwap(target, source, 'morph');

		expect(target.querySelector('#persist')!.textContent).toContain('keep');
		expect(target.innerHTML).toContain('new');
	});

	it.each(['append', 'prepend'])('only executes incoming scripts for %s swaps', async mode => {
		const target = document.createElement('div');
		target.innerHTML = `<div id="existing"><script>window.existing = true</script></div>`;
		const existing = target.querySelector('#existing');
		const source = document.createElement('div');
		source.innerHTML = `<div id="incoming"><script>window.incoming = true</script></div>`;

		await performSwap(target, source, mode);

		expect(target.querySelector('#existing')).toBe(existing);
		expect(target.querySelector('#incoming')).not.toBeNull();
		expect(routerScripts.executeScripts).not.toHaveBeenCalled();
		expect(routerScripts.executeScriptsInNodes).toHaveBeenCalledTimes(1);
		const executedNodes = routerScripts.executeScriptsInNodes.mock.calls[0][0] as Node[];
		expect(executedNodes).toHaveLength(1);
		expect((executedNodes[0] as HTMLElement).id).toBe('incoming');
	});

	it('keeps compatible DOM identity and focus during morph', async () => {
		document.body.innerHTML = `
			<div id="target"><label for="name">Old</label><input id="name" value="typed"></div>
		`;
		const target = document.getElementById('target')!;
		const input = document.getElementById('name') as HTMLInputElement;
		input.focus();

		const source = document.createElement('div');
		source.id = 'target';
		source.innerHTML = `<label for="name">New</label><input id="name" value="server">`;

		await performSwap(target, source, 'morph');

		expect(document.getElementById('name')).toBe(input);
		expect(document.activeElement).toBe(input);
		expect(target.querySelector('label')!.textContent).toBe('New');
	});

	it('reorders keyed children without replacing their DOM identity', async () => {
		const target = document.createElement('div');
		target.innerHTML = `
			<article id="first">First old</article>
			<article id="second">Second old</article>
			<article id="third">Third old</article>
		`;
		const first = target.querySelector('#first')!;
		const second = target.querySelector('#second')!;
		const third = target.querySelector('#third')!;
		const source = document.createElement('div');
		source.innerHTML = `
			<article id="third">Third new</article>
			<article id="first">First new</article>
			<article id="second">Second new</article>
		`;

		await performSwap(target, source, 'morph');

		expect(target.children[0]).toBe(third);
		expect(target.children[1]).toBe(first);
		expect(target.children[2]).toBe(second);
		expect(third.textContent).toBe('Third new');
		expect(first.textContent).toBe('First new');
		expect(second.textContent).toBe('Second new');
	});

	it('inserts a new keyed child without replacing reusable siblings', async () => {
		const target = document.createElement('div');
		target.innerHTML = '<article id="a">A old</article><article id="b">B old</article>';
		const a = target.querySelector('#a')!;
		const b = target.querySelector('#b')!;
		const source = document.createElement('div');
		source.innerHTML = `
			<article id="x">X new</article>
			<article id="a">A new</article>
			<article id="b">B new</article>
		`;

		await performSwap(target, source, 'morph');

		expect(target.children[1]).toBe(a);
		expect(target.children[2]).toBe(b);
		expect(a.textContent).toBe('A new');
		expect(b.textContent).toBe('B new');
	});

	it('replaces a keyed node when its tag changes', async () => {
		const target = document.createElement('div');
		target.innerHTML = '<p id="status">Old</p>';
		const oldStatus = target.firstElementChild;
		const source = document.createElement('div');
		source.innerHTML = '<section id="status">New</section>';

		await performSwap(target, source, 'morph');

		expect(target.firstElementChild).not.toBe(oldStatus);
		expect(target.firstElementChild?.tagName).toBe('SECTION');
		expect(target.firstElementChild?.textContent).toBe('New');
	});

	it('returns the connected replacement when the morph root tag changes', async () => {
		document.body.innerHTML = '<main id="target">Old</main>';
		const target = document.getElementById('target')!;
		const source = document.createElement('section');
		source.id = 'target';
		source.textContent = 'New';

		const result = await performSwap(target, source, 'morph');

		expect(result).toBe(document.getElementById('target'));
		expect(result.isConnected).toBe(true);
		expect(result.tagName).toBe('SECTION');
	});

	it('keeps dirty checkbox and select state during morph', async () => {
		const target = document.createElement('div');
		target.innerHTML = `
			<input id="enabled" type="checkbox" checked>
			<select id="choice">
				<option value="a" selected>A</option>
				<option value="b">B</option>
				<option value="c">C</option>
			</select>
		`;
		const checkbox = target.querySelector<HTMLInputElement>('#enabled')!;
		const select = target.querySelector<HTMLSelectElement>('#choice')!;
		checkbox.checked = false;
		select.value = 'c';

		const source = document.createElement('div');
		source.innerHTML = `
			<input id="enabled" type="checkbox" checked>
			<select id="choice">
				<option value="a">A updated</option>
				<option value="b" selected>B updated</option>
				<option value="c">C updated</option>
			</select>
		`;

		await performSwap(target, source, 'morph');

		expect(target.querySelector('#enabled')).toBe(checkbox);
		expect(target.querySelector('#choice')).toBe(select);
		expect(checkbox.checked).toBe(false);
		expect(select.value).toBe('c');
		expect(select.options[2].textContent).toBe('C updated');
	});

	it('preserves an intentionally empty dirty multi-select', async () => {
		const target = document.createElement('div');
		target.innerHTML = `
			<select id="tags" multiple>
				<option value="a" selected>A</option>
				<option value="b">B</option>
			</select>
		`;
		const select = target.querySelector<HTMLSelectElement>('#tags')!;
		Array.from(select.options).forEach(option => { option.selected = false; });
		const source = document.createElement('div');
		source.innerHTML = `
			<select id="tags" multiple>
				<option value="a">A updated</option>
				<option value="b" selected>B updated</option>
			</select>
		`;

		await performSwap(target, source, 'morph');

		expect(Array.from(select.selectedOptions)).toHaveLength(0);
	});

	it('does not carry dirty text state into a different input type', async () => {
		const target = document.createElement('div');
		target.innerHTML = '<input id="mode" type="text" value="server">';
		const input = target.querySelector<HTMLInputElement>('#mode')!;
		input.value = 'user text';
		const source = document.createElement('div');
		source.innerHTML = '<input id="mode" type="checkbox" value="enabled" checked>';

		await performSwap(target, source, 'morph');

		expect(input.type).toBe('checkbox');
		expect(input.value).toBe('enabled');
		expect(input.checked).toBe(true);
	});

	it('imports media from an inert response document instead of adopting it', async () => {
		const responseDocument = new DOMParser().parseFromString(`
			<div id="app"><audio controls src="https://example.com/audio.mp3"></audio></div>
		`, 'text/html');
		const source = responseDocument.getElementById('app')!;
		const sourceAudio = source.querySelector('audio')!;
		const target = document.createElement('div');

		await performSwap(target, source, 'inner');

		expect(responseDocument.getElementById('app')).toBe(source);
		expect(source.querySelector('audio')).toBe(sourceAudio);
		expect(target.querySelector('audio')).not.toBe(sourceAudio);
		expect(target.querySelector('audio')!.ownerDocument).toBe(document);
	});
});
