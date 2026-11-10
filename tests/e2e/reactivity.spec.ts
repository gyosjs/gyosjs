import { expect, test } from '@playwright/test';

for (const build of ['standard', 'csp']) {
	test(`${build} bundle keeps computed reads current and DOM effects scheduled`, async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
		if (build === 'csp') await page.goto('/csp.html');
		else {
			await page.setContent('<!doctype html><html><body></body></html>');
			await page.addScriptTag({ path: 'dist/gyos.auto.min.js' });
		}

		const snapshots = await page.evaluate(async () => {
			const Gyos = (window as any).Gyos;
			const count = Gyos.signal(2);
			const doubled = Gyos.computed(() => count() * 2);
			const root = document.createElement('section');
			root.setAttribute('g-scope', 'ComputedRegression');
			root.innerHTML = '<output>{count()} / {doubled()}</output>';
			document.body.appendChild(root);
			Gyos.scope('ComputedRegression', { count, doubled });
			Gyos.mount(root);
			const snapshot = () => ({ value: doubled(), text: root.querySelector('output')!.textContent });
			const initial = snapshot();
			count(3);
			const immediate = snapshot();
			await Promise.resolve();
			const deferred = snapshot();
			let insideBatch;
			Gyos.batch(() => { count(4); insideBatch = snapshot(); count(5); });
			const afterBatch = snapshot();
			Gyos.cleanup(root);
			count(6);
			await Promise.resolve();
			const disposed = snapshot();
			root.remove();
			return { initial, immediate, deferred, insideBatch, afterBatch, disposed };
		});
		expect(snapshots).toEqual({
			initial: { value: 4, text: '2 / 4' },
			immediate: { value: 6, text: '2 / 4' },
			deferred: { value: 6, text: '3 / 6' },
			insideBatch: { value: 8, text: '3 / 6' },
			afterBatch: { value: 10, text: '5 / 10' },
			disposed: { value: 12, text: '5 / 10' }
		});
		expect(errors).toEqual([]);
	});
}
