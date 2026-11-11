import { expect, test } from '@playwright/test';

for (const build of ['standard', 'csp']) {
	test(`${build} keyed placement minimizes moves and preserves focused nested scopes`, async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		await page.setContent('<!doctype html><html><body></body></html>');
		await page.addScriptTag({ path: build === 'csp' ? 'dist/gyos.csp.auto.min.js' : 'dist/gyos.auto.min.js' });
		const result = await page.evaluate(async () => {
			const G = (window as any).Gyos;
			let mounts = 0,
				unmounts = 0;
			G.scope('PlacementChild', () => ({
				onMount() {
					mounts++;
				},
				onUnmount() {
					unmounts++;
				}
			}));
			const items = G.signal(Array.from({ length: 64 }, (_, id) => ({ id, label: `value-${id}` })));
			const root = document.createElement('section');
			root.setAttribute('g-scope', 'Placement');
			root.innerHTML =
				'<b id="before">before</b><div class="row" *for="item, index in items()" g-key="item.id" :data-id="item.id"><input :value="item.label"><span>{index}:{item.label}</span><aside g-scope="PlacementChild"></aside></div><b id="after">after</b>';
			document.body.append(root);
			G.scope('Placement', { items });
			G.mount(root);
			const original = new Map(
				[...root.querySelectorAll<HTMLElement>('.row')].map((el) => [Number(el.dataset.id), el])
			);
			const input = root.querySelector<HTMLInputElement>('[data-id="62"] input')!;
			input.focus();
			input.setSelectionRange(1, 5, 'backward');
			const observer = new MutationObserver(() => {});
			observer.observe(root, { childList: true });
			const next = items().slice();
			[next[1], next[62]] = [next[62], next[1]];
			G.batch(() => items(next));
			const moves = observer
				.takeRecords()
				.flatMap((r) => [...r.addedNodes])
				.filter((n) => original.get(Number((n as HTMLElement).dataset?.id)) === n).length;
			observer.disconnect();
			await Promise.resolve();
			await Promise.resolve();
			const afterMove = {
				moves,
				focused: document.activeElement === input,
				selection: [input.selectionStart, input.selectionEnd, input.selectionDirection],
				mounts,
				unmounts,
				order: [...root.querySelectorAll<HTMLElement>('.row')].map((el) => Number(el.dataset.id)),
				identity: [...root.querySelectorAll<HTMLElement>('.row')].every(
					(el) => original.get(Number(el.dataset.id)) === el
				),
				label: root.querySelector('[data-id="62"] span')!.textContent
			};
			items(items().filter((item: any) => item.id !== 62));
			await Promise.resolve();
			await Promise.resolve();
			const afterRemove = { mounts, unmounts, removed: !input.isConnected, focused: document.activeElement === input };
			G.cleanup(root);
			root.remove();
			return { afterMove, afterRemove, afterCleanup: { mounts, unmounts } };
		});
		const order = Array.from({ length: 64 }, (_, i) => i);
		[order[1], order[62]] = [order[62], order[1]];
		expect(result.afterMove).toEqual({
			moves: 2,
			focused: true,
			selection: [1, 5, 'backward'],
			mounts: 64,
			unmounts: 0,
			order,
			identity: true,
			label: '1:value-62'
		});
		expect(result.afterRemove).toEqual({ mounts: 64, unmounts: 1, removed: true, focused: false });
		expect(result.afterCleanup).toEqual({ mounts: 64, unmounts: 64 });
		expect(errors).toEqual([]);
	});

	test(`${build} keyed reorder coexists with leaving and re-added rows`, async ({ page }) => {
		await page.setContent('<!doctype html><html><body></body></html>');
		await page.addScriptTag({ path: build === 'csp' ? 'dist/gyos.csp.auto.min.js' : 'dist/gyos.auto.min.js' });
		await page.evaluate(() => {
			const G = (window as any).Gyos;
			G.registerTransition('placement-fade', {
				enterFrom: 'enter',
				enterTo: 'entered',
				leaveFrom: 'visible',
				leaveTo: 'leaving',
				duration: 300
			});
			const items = G.signal([0, 1, 2, 3].map((id) => ({ id })));
			const root = document.createElement('section');
			root.setAttribute('g-scope', 'LeavingPlacement');
			root.innerHTML =
				'<div class="row" *for="item in items()" g-key="item.id" :data-id="item.id" g-transition="placement-fade">{item.id}</div><b id="after">after</b>';
			document.body.append(root);
			G.scope('LeavingPlacement', { items });
			G.mount(root);
			(window as any).placement = { G, root, items };
		});
		await page.waitForTimeout(400);
		const immediate = await page.evaluate(async () => {
			const { items, root } = (window as any).placement;
			const old = root.querySelector('[data-id="1"]');
			items([3, 2, 0].map((id) => ({ id })));
			await Promise.resolve();
			await Promise.resolve();
			const leaving = old.isConnected && old.style.pointerEvents === 'none';
			items([2, 1, 0, 3].map((id) => ({ id })));
			await Promise.resolve();
			await Promise.resolve();
			const active = [...root.querySelectorAll('.row')].filter(
				(el: any) => el.style.pointerEvents !== 'none'
			) as HTMLElement[];
			return { leaving, order: active.map((el) => Number(el.dataset.id)), newIdentity: active[1] !== old };
		});
		expect(immediate).toEqual({ leaving: true, order: [2, 1, 0, 3], newIdentity: true });
		await expect(page.locator('.row')).toHaveCount(4);
		expect(
			await page.locator('.row').evaluateAll((rows) => rows.map((el) => Number((el as HTMLElement).dataset.id)))
		).toEqual([2, 1, 0, 3]);
		await page.evaluate(() => {
			const { G, root } = (window as any).placement;
			G.cleanup(root);
			root.remove();
			delete (window as any).placement;
		});
	});
}
