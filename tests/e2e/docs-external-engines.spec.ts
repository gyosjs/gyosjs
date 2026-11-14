import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Run the Markdown recipe itself, including its real scheduler and cleanup.
const recipe = readFileSync('docs/en/external-engines.md', 'utf8').replace(/\r\n/g, '\n');
const html = recipe.match(/```html\n([\s\S]*?)\n```/)![1]
	.replace('<script type="module" src="/src/motion.js"></script>', '');
const script = recipe.match(/```js\n([\s\S]*?)\n```/)![1]
	.replace("import Gyos from 'gyosjs/csp';", 'const Gyos = window.Gyos;');

for (const build of ['standard', 'csp']) {
	test(`${build}: engine recipe isolates, pauses, completes and releases frames`, async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		await page.clock.install();
		await page.setContent('<!doctype html><html><body></body></html>');
		await page.addScriptTag({ path: `dist/gyos.${build === 'csp' ? 'csp.' : ''}auto.min.js` });
		await page.evaluate(markup => {
			document.body.innerHTML = markup + markup;
			const probe = { frames: new Set<number>(), draws: new Map<HTMLCanvasElement, number>(), aborts: 0 };
			(window as any).__motionProbe = probe;
			const request = window.requestAnimationFrame.bind(window);
			const cancel = window.cancelAnimationFrame.bind(window);
			window.requestAnimationFrame = callback => {
				const id = request(time => { probe.frames.delete(id); callback(time); });
				probe.frames.add(id);
				return id;
			};
			window.cancelAnimationFrame = id => { probe.frames.delete(id); cancel(id); };
			const clear = CanvasRenderingContext2D.prototype.clearRect;
			CanvasRenderingContext2D.prototype.clearRect = function (...args) {
				probe.draws.set(this.canvas, (probe.draws.get(this.canvas) || 0) + 1);
				return clear.apply(this, args);
			};
			const abort = AbortController.prototype.abort;
			AbortController.prototype.abort = function (...args) { probe.aborts++; return abort.apply(this, args); };
		}, html);
		await page.addScriptTag({ content: `{\n${script}\n}` });
		const panels = page.locator('[g-scope="Motion"]');
		const first = panels.nth(0), second = panels.nth(1);
		const pending = () => page.evaluate(() => (window as any).__motionProbe.frames.size);
		await expect(first.locator('output')).toHaveText('0');
		await first.getByRole('button', { name: 'Start', exact: true }).click();
		await page.clock.runFor(2300);
		await expect(first.locator('output')).toHaveText('2');
		await expect(second.locator('output')).toHaveText('0');
		expect(await pending()).toBe(1);
		await first.getByRole('button', { name: 'Pause', exact: true }).click();
		expect(await pending()).toBe(0);
		const paused = await first.locator('canvas').evaluate(canvas => canvas.toDataURL());
		await page.clock.runFor(1500);
		expect(await first.locator('canvas').evaluate(canvas => canvas.toDataURL())).toBe(paused);
		await first.getByRole('button', { name: 'Start', exact: true }).click();
		await second.getByRole('button', { name: 'Start', exact: true }).click();
		expect(await pending()).toBe(2);
		await page.evaluate(() => {
			Object.defineProperty(document, 'hidden', { configurable: true, value: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});
		expect(await pending()).toBe(0);
		await first.getByRole('button', { name: 'Start', exact: true }).click();
		expect(await pending()).toBe(0); // A hidden document cannot resume.
		await page.evaluate(() => {
			Object.defineProperty(document, 'hidden', { configurable: true, value: false });
			document.dispatchEvent(new Event('visibilitychange'));
		});
		expect(await pending()).toBe(0); // Returning does not auto-resume.
		await first.getByRole('button', { name: 'Start', exact: true }).click();
		await page.clock.runFor(11000);
		await expect(first.locator('output')).toHaveText('10');
		await expect(first.getByRole('button', { name: 'Pause', exact: true })).toBeDisabled();
		expect(await pending()).toBe(0);
		await first.getByRole('button', { name: 'Start', exact: true }).click();
		await expect(first.locator('output')).toHaveText('0');
		await page.clock.runFor(1300);
		await first.getByRole('button', { name: 'Reset', exact: true }).click();
		await expect(first.locator('output')).toHaveText('0');
		expect(await pending()).toBe(0);

		// Real cleanup/remount: retired canvases stop drawing and controllers abort.
		for (let cycle = 0; cycle < 3; cycle++) {
			await first.getByRole('button', { name: 'Start', exact: true }).click();
			await page.clock.runFor(1200);
			await page.evaluate(markup => {
				const root = document.querySelector('[g-scope="Motion"]')!;
				(window as any).Gyos.cleanup(root);
				root.outerHTML = markup;
				(window as any).Gyos.mountAll();
			}, html);
			expect(await pending()).toBe(0);
			await expect(first.locator('output')).toHaveText('0');
		}
		const retiredDraws = () => page.evaluate(() => [...(window as any).__motionProbe.draws]
			.filter(([canvas]: [HTMLCanvasElement]) => !canvas.isConnected).map(([, count]: [HTMLCanvasElement, number]) => count));
		const before = await retiredDraws();
		await page.clock.runFor(2000);
		expect(await retiredDraws()).toEqual(before);
		expect(before).toHaveLength(3);
		expect(await page.evaluate(() => (window as any).__motionProbe.aborts)).toBeGreaterThanOrEqual(3);
		await first.getByRole('button', { name: 'Start', exact: true }).click();
		await page.clock.runFor(1300);
		await expect(first.locator('output')).toHaveText('1');
		await expect(second.locator('output')).toHaveText('0');
		expect(await pending()).toBe(1);
		expect(errors).toEqual([]);
	});

	test(`${build}: engine recipe reports an unavailable Canvas`, async ({ page }) => {
		await page.setContent('<!doctype html><html><body></body></html>');
		await page.addScriptTag({ path: `dist/gyos.${build === 'csp' ? 'csp.' : ''}auto.min.js` });
		await page.evaluate(markup => {
			document.body.innerHTML = markup;
			HTMLCanvasElement.prototype.getContext = (() => null) as any;
		}, html);
		await page.addScriptTag({ content: `{\n${script}\n}` });
		await expect(page.getByRole('alert')).toHaveText('Canvas is unavailable in this browser.');
		await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled();
	});
}
