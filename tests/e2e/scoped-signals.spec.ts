import { expect, test } from '@playwright/test';

for (const build of ['standard', 'csp']) {
	test(`${build} scope preserves signal models across user input and closure writes`, async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
		if (build === 'csp') await page.goto('/csp.html');
		else {
			await page.setContent('<!doctype html><html><body></body></html>');
			await page.addScriptTag({ path: 'dist/gyos.auto.min.js' });
		}
		await page.evaluate(() => {
			const Gyos = (window as any).Gyos;
			const text = Gyos.signal('initial'), length = Gyos.computed(() => text().length), accepted = Gyos.signal(false);
			const root = document.createElement('section');
			root.id = 'signal-model'; root.setAttribute('g-scope', 'SignalModelBrowser');
			root.innerHTML = '<input class="text" g-model="text"><input type="checkbox" g-model="form.accepted"><output>{text.value} / {length.value}</output><button @click="reset()">Reset signal</button>';
			document.body.appendChild(root);
			Gyos.scope('SignalModelBrowser', () => ({ text, length, form: { accepted }, reset() { this.text('reset'); } }));
			Gyos.mount(root);
			(window as any).__signalModel = { read: () => text(), write: (value: string) => text(value), flag: (value?: boolean) => value === undefined ? accepted() : accepted(value), cleanup: () => Gyos.cleanup(root), same: () => Gyos.mountedScopes().get(root).text === text };
		});
		const input = page.locator('#signal-model .text'), output = page.locator('#signal-model output'), checkbox = page.locator('#signal-model input[type=checkbox]');
		await expect(checkbox).not.toBeChecked(); await checkbox.check();
		expect(await page.evaluate(() => (window as any).__signalModel.flag())).toBe(true);
		await page.evaluate(() => (window as any).__signalModel.flag(false)); await expect(checkbox).not.toBeChecked();
		await expect(input).toHaveValue('initial'); await expect(output).toHaveText('initial / 7');
		expect(await page.evaluate(() => (window as any).__signalModel.same())).toBe(true);
		await input.fill('typed');
		expect(await page.evaluate(() => (window as any).__signalModel.read())).toBe('typed');
		await expect(output).toHaveText('typed / 5');
		await page.getByRole('button', { name: 'Reset signal', exact: true }).click();
		await expect(input).toHaveValue('reset');
		await page.evaluate(() => (window as any).__signalModel.write('from closure'));
		await expect(input).toHaveValue('from closure'); await expect(output).toHaveText('from closure / 12');
		await page.evaluate(async () => { (window as any).__signalModel.cleanup(); (window as any).__signalModel.write('after cleanup'); await Promise.resolve(); });
		await expect(input).toHaveValue('from closure');
		expect(errors).toEqual([]);
	});
}
