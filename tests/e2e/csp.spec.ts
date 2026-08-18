import { expect, test } from '@playwright/test';

test('CSP build runs directives, forms, transitions, and boosted scripts without violations', async ({ page }) => {
	const runtimeErrors: string[] = [];
	page.on('console', message => {
		if (message.type() === 'error') runtimeErrors.push(message.text());
	});
	page.on('pageerror', error => runtimeErrors.push(error.message));
	await page.addInitScript(() => {
		(window as any).__gyosCspViolations = [];
		document.addEventListener('securitypolicyviolation', event => {
			(window as any).__gyosCspViolations.push({
				blockedURI: event.blockedURI,
				directive: event.effectiveDirective
			});
		});
	});

	await page.goto('/csp.html');
	expect(await page.locator('script[src*="gyos.csp.auto"]').evaluate(script => (script as HTMLScriptElement).nonce)).toBe('gyos-e2e');
	expect(await page.evaluate(() => typeof (window as any).Gyos), runtimeErrors.join('\n')).toBe('object');

	await page.locator('#increment').click();
	await expect(page.locator('#count')).toHaveText('1');
	await expect(page.locator('#items li')).toHaveText(['alpha', 'beta']);

	await page.locator('#toggle').click();
	await expect(page.locator('#transition-panel')).toBeHidden();
	await page.locator('#toggle').click();
	await expect(page.locator('#transition-panel')).toBeVisible();

	await page.getByRole('button', { name: 'Submit' }).click();
	await expect(page).toHaveURL(/\/csp\.html$/);
	await expect(page.locator('#name-error')).toHaveText('This field is required');
	await page.locator('input[name="name"]').fill(' Gyos CSP ');
	await page.getByRole('button', { name: 'Check form' }).click();
	await expect(page.locator('#submitted')).toHaveText('submitted');
	await expect(page.locator('input[name="name"]')).toHaveValue('Gyos CSP');

	await page.locator('#csp-next').click();
	await expect(page).toHaveURL(/\/csp-next\.html$/);
	await expect(page.locator('#csp-result')).toHaveText('boosted');
	await expect.poll(() => page.evaluate(() => (window as any).__gyosCspNavigated)).toBe(1);
	const navigatedNonce = await page.locator('#csp-app script').evaluate(script => (script as HTMLScriptElement).nonce);
	expect(navigatedNonce).toBe('gyos-e2e');
	expect(await page.evaluate(() => (window as any).__gyosCspViolations)).toEqual([]);
});
