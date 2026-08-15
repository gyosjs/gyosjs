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

test('ignored controls do not disable later outside clicks', async ({ page }) => {
	await page.goto('/advanced.html');
	await page.evaluate(() => {
		const root = document.createElement('div');
		root.id = 'outside-regression';
		root.setAttribute('g-scope', 'OutsideRegression');
		root.innerHTML = `
			<img class="gallery" @click.outside="outsideCount++">
			<button g-ignore-outside-click><span class="next">Next</span></button>
			<output>{outsideCount}</output>
		`;
		(window as any).Gyos.scope('OutsideRegression', { outsideCount: 0 });
		document.body.append(root);
		(window as any).Gyos.mountTree(root);
	});

	await page.locator('#outside-regression .next').click();
	await page.locator('h1').click();
	await expect(page.locator('#outside-regression output')).toHaveText('1');
	await page.locator('h1').click();
	await expect(page.locator('#outside-regression output')).toHaveText('2');
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

test('g-form validates before MPA Boost fetches and swaps a POST response', async ({ page }) => {
	let requests = 0;
	let requestMethod = '';
	let requestResourceType = '';
	let submittedBody = '';
	await page.route('**/booking', async route => {
		requests++;
		requestMethod = route.request().method();
		requestResourceType = route.request().resourceType();
		submittedBody = route.request().postData() ?? '';
		await route.fulfill({
			contentType: 'text/html',
			body: '<!doctype html><html><head><title>Confirmed</title></head><body g-boost><div id="out" g-outlet>confirmed</div></body></html>'
		});
	});
	await page.goto('/form-validation.html');
	await page.evaluate(() => {
		const Gyos = (window as any).Gyos;
		(document.body as HTMLElement).setAttribute('g-boost', '');
		document.body.innerHTML = `
			<div id="out" g-outlet>
				<form id="booking" g-scope="E2EBooking" g-form="bookingForm" action="/booking" method="post">
					<input name="customer_name" g-model.trim="customerName" g-validate="required">
					<span g-errors="customerName"></span>
					<button type="submit">Book</button>
				</form>
			</div>
		`;
		(window as any).bookingSubmitEvents = 0;
		(window as any).bookingRuntimeMarker = 'preserved';
		Gyos.scope('E2EBooking', { customerName: '' });
		Gyos.mountAll();
		Gyos.startRouter();
		(window as any).bookingScope = Gyos.mountedScopes().get(document.getElementById('booking'));
		document.getElementById('booking')!.addEventListener('submit', () => {
			(window as any).bookingSubmitEvents++;
		});
	});

	await page.getByRole('button', { name: 'Book' }).click();
	await expect(page.locator('[g-errors="customerName"], #booking span').first()).toHaveText('This field is required');
	expect(requests).toBe(0);
	expect(await page.evaluate(() => (window as any).bookingSubmitEvents)).toBe(0);

	await page.locator('input[name="customer_name"]').fill('Gyos User');
	await page.getByRole('button', { name: 'Book' }).click();
	await expect.poll(() => page.evaluate(() => (window as any).bookingScope.bookingForm.$valid())).toBe(true);
	await expect.poll(() => page.evaluate(() => (window as any).bookingSubmitEvents)).toBe(1);
	await expect.poll(() => requests).toBe(1);
	expect(requestMethod).toBe('POST');
	expect(requestResourceType).toBe('fetch');
	expect(submittedBody).toContain('name="customer_name"');
	expect(submittedBody).toContain('Gyos User');
	await expect(page.locator('#out')).toHaveText('confirmed');
	expect(await page.evaluate(() => (window as any).bookingSubmitEvents)).toBe(1);
	expect(await page.evaluate(() => (window as any).bookingRuntimeMarker)).toBe('preserved');
});

test('MPA Boost honors canceled link and form events', async ({ page }) => {
	let requests = 0;
	await page.route('**/danger', async route => {
		requests++;
		await route.fulfill({
			contentType: 'text/html',
			body: '<div g-outlet>unexpected</div>',
		});
	});
	await page.goto('/form-validation.html');
	await page.evaluate(() => {
		const Gyos = (window as any).Gyos;
		document.body.setAttribute('g-boost', '');
		document.body.innerHTML = `
			<div id="out" g-outlet>
				<a href="/danger" onclick="return false">Cancel link</a>
				<form action="/danger" method="post" onsubmit="return false">
					<button type="submit">Cancel form</button>
				</form>
			</div>
		`;
		Gyos.startRouter();
	});

	await page.getByRole('link', { name: 'Cancel link' }).click();
	await page.getByRole('button', { name: 'Cancel form' }).click();

	expect(requests).toBe(0);
	await expect(page.locator('#out')).toContainText('Cancel form');
});

test('g-form replay honors cancellation without leaking Router approval', async ({ page }) => {
	let requests = 0;
	await page.route('**/danger', async route => {
		requests++;
		await route.fulfill({
			contentType: 'text/html',
			body: '<div id="out" g-outlet>submitted</div>',
		});
	});
	await page.goto('/form-validation.html');
	await page.evaluate(() => {
		const Gyos = (window as any).Gyos;
		document.body.setAttribute('g-boost', '');
		document.body.innerHTML = `
			<div id="out" g-outlet>
				<form id="danger-form" g-scope="E2EDanger" g-form="dangerForm"
					action="/danger" method="post"
					onsubmit="window.dangerSubmitEvents++; return window.allowDangerSubmit">
					<input name="confirmation" g-model="confirmation" g-validate="required">
					<button type="submit">Submit danger form</button>
				</form>
			</div>
		`;
		(window as any).allowDangerSubmit = false;
		(window as any).dangerSubmitEvents = 0;
		Gyos.scope('E2EDanger', { confirmation: 'confirmed' });
		Gyos.mountAll();
		Gyos.startRouter();
	});

	await page.getByRole('button', { name: 'Submit danger form' }).click();
	await expect.poll(() => page.evaluate(() => (window as any).dangerSubmitEvents)).toBe(1);
	expect(requests).toBe(0);
	await expect(page.locator('#danger-form')).toBeVisible();

	await page.evaluate(() => ((window as any).allowDangerSubmit = true));
	await page.getByRole('button', { name: 'Submit danger form' }).click();
	await expect.poll(() => page.evaluate(() => (window as any).dangerSubmitEvents)).toBe(2);
	await expect.poll(() => requests).toBe(1);
	await expect(page.locator('#out')).toHaveText('submitted');
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

test('g-reveal marks content after a real viewport intersection', async ({ page }) => {
	await page.goto('/advanced.html');
	await page.evaluate(() => {
		const root = document.createElement('div');
		root.id = 'reveal-browser-root';
		root.setAttribute('g-scope', 'RevealBrowserScope');
		root.innerHTML = '<div style="height: 200vh"></div><section class="browser-reveal" g-reveal>Reveal me</section>';
		(window as any).Gyos.scope('RevealBrowserScope', {});
		document.body.append(root);
		(window as any).Gyos.mountTree(root);
	});

	const target = page.locator('.browser-reveal');
	await expect(target).not.toHaveAttribute('data-gyos-revealed', '');
	await target.scrollIntoViewIfNeeded();
	await expect(target).toHaveAttribute('data-gyos-revealed', '');
	await expect(target).toHaveClass(/is-revealed/);
});
