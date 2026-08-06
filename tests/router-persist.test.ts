import { beforeEach, describe, expect, it } from 'vitest';
import {
	detachPersist,
	mergePersistIntoLive,
	resetPersistState
} from '../src/core/router/persist';

describe('router persisted islands', () => {
	beforeEach(() => {
		resetPersistState();
		document.body.innerHTML = '';
	});

	it('only detaches persisted islands inside the swapped target', () => {
		document.body.innerHTML = `
			<div id="shell" g-persist="shell">shell</div>
			<div id="partial"><div id="local" g-persist="local">local</div></div>
		`;
		const shell = document.getElementById('shell')!;
		const local = document.getElementById('local')!;

		detachPersist(document.getElementById('partial')!);

		expect(shell.isConnected).toBe(true);
		expect(local.isConnected).toBe(true);
		expect(document.getElementById('partial')!.contains(local)).toBe(false);
	});

	it('keeps an unmatched island parked until a later page provides its placeholder', () => {
		document.body.innerHTML = `
			<div id="outlet"><div id="player" g-persist="player">playing</div></div>
		`;
		const player = document.getElementById('player')!;
		const firstOutlet = document.getElementById('outlet')!;

		detachPersist(firstOutlet);
		firstOutlet.replaceChildren(document.createElement('p'));
		mergePersistIntoLive(firstOutlet);
		expect(firstOutlet.contains(player)).toBe(false);

		const nextOutlet = document.createElement('div');
		nextOutlet.innerHTML = `<div g-persist="player">placeholder</div>`;
		document.body.appendChild(nextOutlet);
		mergePersistIntoLive(nextOutlet);

		expect(nextOutlet.firstElementChild).toBe(player);
		expect(player.textContent).toBe('playing');
	});

	it('restores a single anonymous persisted island into an anonymous placeholder', () => {
		document.body.innerHTML = `
			<div id="outlet"><div g-persist>anonymous state</div></div>
		`;
		const outlet = document.getElementById('outlet')!;
		const island = outlet.firstElementChild as HTMLElement;

		detachPersist(outlet);
		outlet.innerHTML = '<div g-persist>placeholder</div>';
		mergePersistIntoLive(outlet);

		expect(outlet.firstElementChild).toBe(island);
		expect(island.dataset.gyosPersistId).toMatch(/^gyos-persist-\d+$/);
	});

	it('uses the element id as a stable key when g-persist is empty', () => {
		document.body.innerHTML = `
			<div id="outlet"><div id="player" g-persist>playing</div></div>
		`;
		const outlet = document.getElementById('outlet')!;
		const player = document.getElementById('player')!;

		detachPersist(outlet);
		outlet.innerHTML = '<div id="player" g-persist>placeholder</div>';
		mergePersistIntoLive(outlet);

		expect(document.getElementById('player')).toBe(player);
		expect((player as HTMLElement).dataset.gyosPersistId).toBe('id:player');
	});

	it('keeps a nested persisted island alive with its parent island', () => {
		document.body.innerHTML = `
			<div id="outlet">
				<section g-persist="shell"><audio g-persist="player"></audio></section>
			</div>
		`;
		const outlet = document.getElementById('outlet')!;
		const shell = outlet.querySelector('section')!;
		const player = outlet.querySelector('audio')!;

		detachPersist(outlet);
		outlet.innerHTML = '<section g-persist="shell"><span>placeholder</span></section>';
		mergePersistIntoLive(outlet);

		expect(outlet.firstElementChild).toBe(shell);
		expect(outlet.querySelector('audio')).toBe(player);
	});
});
