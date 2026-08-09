import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => localStorage.clear());
	page.on('dialog', dialog => dialog.dismiss());
});

test('conditional demo mounts inline parent scope with Gyos injection', async ({ page }) => {
	const consoleErrors: string[] = [];
	await page.addInitScript(() => ((window as any).GYOS_DEBUG = true));
	page.on('console', message => {
		if (message.type() === 'error') consoleErrors.push(message.text());
	});

	await page.goto('/conditional.html');
	const parent = page.locator('.demo-section').first();

	expect(consoleErrors).toEqual([]);
	await expect(parent.getByRole('heading', { level: 3 })).toHaveText('GyosJS Scope & DI Demo App');
	await expect(parent).toContainText('Parent count: 0');
	await parent.getByRole('button', { name: 'Increment', exact: true }).click();
	await expect(parent).toContainText('Parent count: 1');
	expect(consoleErrors).toEqual([]);
});

test('advanced modal portals and closes by outside click and Escape', async ({ page }) => {
	await page.goto('/advanced.html');
	const portalSection = page.locator('[g-scope="PortalDemo"]');
	await portalSection.getByRole('button', { name: 'Open Modal' }).click();

	const modalRoot = page.locator('#modal-root');
	await expect(modalRoot.locator('.modal-overlay')).toBeVisible();
	await expect(modalRoot.locator('.modal-content')).toContainText('Teleported Modal');
	await modalRoot.locator('.modal-overlay').click({ position: { x: 5, y: 5 } });
	await expect(modalRoot.locator('.modal-overlay')).toHaveCount(0);

	await portalSection.getByRole('button', { name: 'Open Modal' }).click();
	await expect(modalRoot.locator('.modal-overlay')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(modalRoot.locator('.modal-overlay')).toHaveCount(0);
});

test('form demo blocks invalid submit and accepts valid values', async ({ page }) => {
	await page.goto('/form-validation.html');
	const form = page.locator('form');
	const submit = form.getByRole('button', { name: 'Submit Form' });

	await submit.click();
	await expect(form.locator('[g-errors="email"], .error-message').first()).toHaveText('This field is required');
	await expect(form.getByRole('button', { name: 'Please Fix Errors' })).toBeDisabled();

	await form.locator('#email').fill('dev@gyos.test');
	await form.locator('#password').fill('Strong123');
	await form.locator('#confirmPassword').fill('Strong123');
	await form.locator('#age').fill('25');
	await form.locator('#phone').fill('0912345678');
	await form.locator('#message').fill('GyosJS documentation contract');

	const validSubmit = form.getByRole('button', { name: 'Submit Form' });
	await expect(validSubmit).toBeEnabled();
	await validSubmit.click();
	await expect(form.locator('.success-message')).toContainText('Form submitted successfully');
});

test('todo demo adds, toggles, counts, and removes an item', async ({ page }) => {
	await page.goto('/todo.html');
	const newTodo = page.getByPlaceholder('What needs to be done?');
	await newTodo.fill('Document contract');
	await page.waitForTimeout(110);
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	const todo = page.locator('.todo-item').filter({ hasText: 'Document contract' });
	await expect(todo).toHaveCount(1);
	await expect(page.locator('.stats .stat-value').nth(0)).toHaveText('1');
	await expect(page.locator('.stats .stat-value').nth(1)).toHaveText('1');

	await todo.locator('input[type="checkbox"]').check();
	await expect(todo).toHaveClass(/done/);
	await expect(page.locator('.stats .stat-value').nth(2)).toHaveText('1');

	await todo.locator('.btn-delete').click();
	await expect(todo).toHaveCount(0);
	await expect(page.locator('.stats .stat-value').nth(0)).toHaveText('0');
});

test('nested transitions keep their DOM until the configured leave finishes', async ({ page }) => {
	await page.setContent(`
		<div g-scope="%7B%20open%3A%20true%20%7D">
			<button @click="open = false">Hide panel</button>
			<section class="transition-panel" *if="open" g-transition.1000="fade">
				<span g-transition.1000="scale">Panel</span>
			</section>
		</div>
	`);
	await page.addScriptTag({ path: 'dist/gyos.auto.min.js' });
	const panel = page.locator('.transition-panel');
	await expect(panel).toBeVisible();
	await page.waitForTimeout(1100);

	const samples = await page.evaluate(async () => {
		(document.querySelector('button') as HTMLButtonElement).click();
		const immediate = document.querySelector('.transition-panel') !== null;
		await new Promise(resolve => setTimeout(resolve, 50));
		return {
			immediate,
			shortlyAfter: document.querySelector('.transition-panel') !== null
		};
	});
	expect(samples).toEqual({ immediate: true, shortlyAfter: true });
	await expect(panel).toHaveCount(0, { timeout: 3000 });
});

test('passive event modifiers preserve native non-cancelable listener behavior', async ({ page }) => {
	await page.setContent(`
		<div g-scope="%7B%20count%3A%200%20%7D">
			<div class="passive-target" @wheel.passive.prevent="count++">{count}</div>
		</div>
	`);
	await page.addScriptTag({ path: 'dist/gyos.auto.min.js' });
	await expect(page.locator('.passive-target')).toHaveText('0');

	const defaultPrevented = await page.locator('.passive-target').evaluate(element => {
		const event = new WheelEvent('wheel', { bubbles: true, cancelable: true });
		element.dispatchEvent(event);
		return event.defaultPrevented;
	});

	expect(defaultPrevented).toBe(false);
	await expect(page.locator('.passive-target')).toHaveText('1');
});

test('generic bindings and g-show transitions work together in the browser', async ({ page }) => {
	await page.setContent(`
		<div g-scope="%7B%20open%3A%20false%2C%20required%3A%20true%2C%20fieldName%3A%20'options%5Bpaper%5D'%20%7D">
			<style id="consumer-style">.consumer-panel { display: grid; }</style>
			<button
				class="consumer-toggle"
				@click="open = !open"
				:aria-expanded="open"
				:data-state="open ? 'open' : 'closed'"
				:custom-state="open ? 'visible' : null"
			>Toggle</button>
			<input class="consumer-input" :name="fieldName" :required="required">
			<section class="consumer-panel" g-show="open" g-transition.80="fade">Panel</section>
		</div>
	`);
	await page.addScriptTag({ path: 'dist/gyos.auto.min.js' });

	const toggle = page.locator('.consumer-toggle');
	const panel = page.locator('.consumer-panel');
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(toggle).toHaveAttribute('data-state', 'closed');
	await expect(toggle).not.toHaveAttribute('custom-state');
	await expect(page.locator('.consumer-input')).toHaveAttribute('name', 'options[paper]');
	await expect(page.locator('.consumer-input')).toHaveAttribute('required', '');
	await expect(panel).toBeHidden();
	expect(await page.locator('#consumer-style').textContent()).toContain('{ display: grid; }');

	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(toggle).toHaveAttribute('custom-state', 'visible');
	await expect(panel).toBeVisible();

	await toggle.click();
	await expect(panel).toHaveCount(1);
	await expect(panel).toBeHidden({ timeout: 2000 });
	await expect(panel).toHaveCount(1);
});
