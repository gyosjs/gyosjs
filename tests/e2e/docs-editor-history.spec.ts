import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Execute the published recipe itself so the prose cannot drift from a fixture.
const recipe = readFileSync('docs/en/editor-history.md', 'utf8').replace(/\r\n/g, '\n');
const html = recipe.match(/```html\n([\s\S]*?)\n```/)![1]
	.replace('<script type="module" src="/src/editor.js"></script>', '');
const script = recipe.match(/```js\n([\s\S]*?)\n```/)![1]
	.replace("import Gyos from 'gyosjs/csp';", 'const Gyos = window.Gyos;');

for (const build of ['standard', 'csp']) {
	test(`${build}: documented editor validates snapshots, isolates instances and cleans up`, async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		await page.setContent('<!doctype html><html><body></body></html>');
		await page.addScriptTag({ path: `dist/gyos.${build === 'csp' ? 'csp.' : ''}auto.min.js` });
		await page.evaluate(markup => { document.body.innerHTML = markup + markup; }, html);
		await page.addScriptTag({ content: `{\n${script}\n}` });
		const editors = page.locator('[g-scope="CostEditor"]');
		const first = editors.nth(0), second = editors.nth(1);
		const room = first.getByRole('textbox', { name: 'Room' });
		const total = first.locator('output');
		const undo = first.getByRole('button', { name: 'Undo', exact: true });
		const redo = first.getByRole('button', { name: 'Redo', exact: true });
		await expect(total).toHaveText('150000');
		await expect(undo).toBeDisabled();
		await room.fill('200000');
		await room.press('Enter');
		await expect(total).toHaveText('250000');
		await expect(second.locator('output')).toHaveText('150000');
		await undo.click();
		await expect(total).toHaveText('150000');
		await redo.click();
		await expect(room).toHaveValue('200000');
		await undo.click();
		for (const value of ['12abc', '', '-1', '1000000001']) {
			await room.fill(value);
			await room.press('Enter');
			await expect(room).toHaveValue('100000');
			await expect(first.getByRole('alert')).not.toBeEmpty();
			await expect(undo).toBeDisabled();
			await expect(redo).toBeEnabled();
		}
		await room.fill('99');
		await room.press('Escape');
		await expect(room).toHaveValue('100000');
		await room.fill('0100000'); // Canonicalized no-op leaves the redo branch intact.
		await room.press('Enter');
		await expect(undo).toBeDisabled();
		await expect(redo).toBeEnabled();
		await room.fill('300000');
		await room.press('Tab');
		await expect(total).toHaveText('350000');
		await expect(redo).toBeDisabled();
		const keyboard = first.locator('[g-ref="keyboard"]');
		await keyboard.focus();
		await page.keyboard.press('Control+z');
		await expect(total).toHaveText('150000');
		await page.keyboard.press('Control+Shift+z');
		await expect(total).toHaveText('350000');
		expect(await room.evaluate(element => {
			const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
			element.dispatchEvent(event);
			return event.defaultPrevented;
		})).toBe(false); // Native input undo is not intercepted.
		await first.evaluate(element => (window as any).Gyos.cleanup(element));
		expect(await keyboard.evaluate(element => {
			const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
			element.dispatchEvent(event);
			return event.defaultPrevented;
		})).toBe(false); // Listener is removed even while the old DOM is retained.
		await first.evaluate(element => element.remove());
		await page.evaluate(markup => {
			const template = document.createElement('template');
			template.innerHTML = markup;
			const root = template.content.firstElementChild!;
			document.body.appendChild(root);
			(window as any).Gyos.mount(root);
		}, html);
		await expect(editors.nth(1).locator('output')).toHaveText('150000');
		await expect(editors.nth(1).getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
		expect(errors).toEqual([]);
	});
}
