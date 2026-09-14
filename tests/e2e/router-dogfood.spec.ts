import { expect, test, type Page } from '@playwright/test';

function html(content: string, nonce: string, head = '', locale = 'lang="en" dir="ltr"', bodyOutlet = false) {
	return `<!doctype html><html ${locale}><head><meta name="csp-nonce" content="${nonce}"><title>Dogfood</title>
	<link rel="stylesheet" nonce="${nonce}" href="/gyos-dist/gyos.css">
	<script nonce="${nonce}" src="/gyos-dist/gyos.csp.auto.min.js"></script>${head}</head>
	<body g-boost ${bodyOutlet ? 'g-outlet g-snapshot' : ''}>${bodyOutlet ? content : `<main g-outlet g-snapshot>${content}</main>`}</body></html>`;
}

async function observe(page: Page) {
	await page.addInitScript(() => {
		(window as any).__violations = [];
		document.addEventListener('securitypolicyviolation', event => (window as any).__violations.push(event.effectiveDirective));
	});
}

function headers(nonce: string) {
	return { 'Content-Security-Policy': `default-src 'self'; script-src 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'nonce-${nonce}'; object-src 'none'; base-uri 'self'` };
}

async function registerHooks(page: Page) {
	await page.waitForFunction(() => !!(window as any).Gyos);
	await page.evaluate(() => {
		const w = window as any;
		w.__outcomes = []; w.__forms = []; w.__swaps = 0; w.__after = 0;
		w.Gyos.onBeforeSwap(() => w.__swaps++);
		w.Gyos.onAfterNavigate(() => w.__after++);
		w.Gyos.onNavigationEnd((ctx: any) => w.__outcomes.push({ outcome: ctx.outcome, status: ctx.status, committed: ctx.committed }));
		document.addEventListener('gyos:form-start', () => w.__forms.push('start'));
		document.addEventListener('gyos:form-end', () => w.__forms.push('end'));
	});
}

for (const mode of ['relative', 'base', 'runtime-persist']) {
	test(`retains a pending ${mode} head provider through boost and history`, async ({ page }) => {
		await observe(page);
		let release!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; });
		let sequence = 0;
		await page.route('**/dogfood/**', async route => {
			const url = new URL(route.request().url());
			if (url.pathname.endsWith('/provider.js')) {
				await gate;
				return route.fulfill({ contentType: 'text/javascript', body: 'window.__providerRuns = (window.__providerRuns || 0) + 1;' });
			}
			const nonce = `page-${++sequence}`;
			const initialBase = mode === 'base' && url.pathname.endsWith('/a');
			const base = initialBase ? '<base href="/dogfood/assets/">' : '';
			const src = initialBase ? 'provider.js' : mode === 'base' ? '/dogfood/assets/provider.js' : '/dogfood/provider.js';
			const provider = mode === 'runtime-persist' ? '' : `<script id="provider" async nonce="${nonce}" src="${src}"></script>`;
			await route.fulfill({ contentType: 'text/html', headers: headers(nonce), body: html('<a href="/dogfood/b">B</a><a href="/dogfood/c">C</a>', nonce, base + provider) });
		});
		try {
			await page.goto('/dogfood/a', { waitUntil: 'domcontentloaded' });
			await registerHooks(page);
			await page.evaluate(runtime => {
				if (runtime) {
					const script = document.createElement('script'); script.id = 'provider'; script.src = '/dogfood/provider.js';
					script.setAttribute('g-head-persist', 'analytics'); document.head.appendChild(script);
				}
				(window as any).__originalProvider = document.getElementById('provider');
			}, mode === 'runtime-persist');
			await page.getByRole('link', { name: 'B', exact: true }).click();
			await expect.poll(() => page.evaluate(() => (window as any).__after)).toBe(1);
			expect(await page.evaluate(() => document.getElementById('provider') === (window as any).__originalProvider)).toBe(true);
			release();
			await expect.poll(() => page.evaluate(() => (window as any).__providerRuns)).toBe(1);
			await page.getByRole('link', { name: 'C', exact: true }).click();
			await expect.poll(() => page.evaluate(() => (window as any).__after)).toBe(2);
			await page.goBack();
			await expect.poll(() => page.evaluate(() => (window as any).__after)).toBe(3);
			expect(await page.evaluate(() => (window as any).__providerRuns)).toBe(1);
			expect(await page.evaluate(() => (window as any).__violations)).toEqual([]);
		} finally { release(); }
	});
}

for (const policy of ["'none'", "'self'"]) {
	test(`leaves incoming base handling to native CSP base-uri ${policy}`, async ({ page }) => {
		await page.route('https://untrusted.invalid/**', route => {
			return route.fulfill({ contentType: 'text/javascript', body: 'window.__wrongBase = true;' });
		});
		await page.route('**/dogfood/**', route => {
			const path = new URL(route.request().url()).pathname;
			if (path.endsWith('/app.js')) {
				return route.fulfill({ contentType: 'text/javascript', body: path === '/dogfood/next/app.js'
					? 'window.__nativeScript = true;' : 'window.__wrongBase = true;' });
			}
			const next = path.endsWith('/next/page');
			const base = policy === "'none'" ? '/dogfood/other/' : 'https://untrusted.invalid/';
			return route.fulfill({ contentType: 'text/html', headers: {
				'Content-Security-Policy': headers('active')['Content-Security-Policy'].replace("base-uri 'self'", `base-uri ${policy}`)
			}, body: html(next ? '<p>Destination</p>' : '<a href="/dogfood/next/page">Next</a>', 'active',
				next ? `<base href="${base}"><script nonce="active" src="app.js"></script>` : '') });
		});
		await page.goto('/dogfood/start');
		await page.evaluate(() => { (window as any).__initialDocument = true; });
		await page.getByRole('link', { name: 'Next', exact: true }).click();
		await page.waitForURL('**/dogfood/next/page', { waitUntil: 'load' });
		await expect.poll(() => page.evaluate(() => (window as any).__nativeScript)).toBe(true);
		expect(await page.evaluate(() => (window as any).__initialDocument)).toBeUndefined();
		// Native speculative preloads may fetch a blocked base; they must not execute.
		expect(await page.evaluate(() => (window as any).__wrongBase)).toBeUndefined();
	});
}

test('body outlet keeps progress and restores language through snapshot back/forward', async ({ page }) => {
	await observe(page); let sequence = 0;
	await page.route('**/dogfood/**', route => {
		const path = new URL(route.request().url()).pathname;
		const attrs = path.endsWith('/b') ? 'lang="ar" dir="rtl"' : path.endsWith('/c') ? '' : 'lang="en" dir="ltr"';
		const nonce = `page-${++sequence}`;
		return route.fulfill({ contentType: 'text/html', headers: headers(nonce), body: html('<a href="/dogfood/b">B</a><a href="/dogfood/c">C</a>', nonce, '', attrs, true) });
	});
	await page.goto('/dogfood/a'); await registerHooks(page);
	await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
	await page.getByRole('link', { name: 'B', exact: true }).click();
	await expect.poll(() => page.evaluate(() => (window as any).__after)).toBe(1);
	await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
	await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
	await expect(page.locator('#gyos-progress-bar')).toHaveCount(1);
	await page.getByRole('link', { name: 'C', exact: true }).click();
	await expect.poll(() => page.evaluate(() => (window as any).__after)).toBe(2);
	await expect(page.locator('html')).not.toHaveAttribute('lang');
	await page.goBack(); await expect.poll(() => page.evaluate(() => (window as any).__after)).toBe(3);
	await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
	await page.goForward(); await expect.poll(() => page.evaluate(() => (window as any).__after)).toBe(4);
	await expect(page.locator('html')).not.toHaveAttribute('dir');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await expect(page.locator('#gyos-progress-bar')).toHaveCount(1);
	expect(await page.evaluate(() => (window as any).__violations)).toEqual([]);
});

test('g-form preserves submitter through validation and renders only opted-in HTML errors', async ({ page }) => {
	await observe(page); const submissions: string[] = [];
	await page.route('**/dogfood/**', async route => {
		if (route.request().method() === 'POST') {
			submissions.push(route.request().postData() || '');
			return route.fulfill({ status: 422, contentType: 'text/html', body: html('<p role="alert">Title already exists</p>', 'next') });
		}
		return route.fulfill({ contentType: 'text/html', headers: headers('active'), body: html(`<section g-scope="{ title: 'Draft' }">
		<form g-form="editor" action="/dogfood/save" method="post"><input name="title" g-model="title" g-validate="required">
		<button name="action" value="draft">Draft</button><button name="action" value="publish">Publish</button></form></section>`, 'active') });
	});
	await page.goto('/dogfood/form'); await registerHooks(page);
	await page.getByRole('button', { name: 'Publish', exact: true }).click();
	await expect.poll(() => page.evaluate(() => (window as any).__outcomes.length)).toBe(1);
	await expect(page.locator('input')).toHaveValue('Draft');
	expect(await page.evaluate(() => (window as any).__swaps)).toBe(0);
	await page.locator('form').evaluate(form => form.setAttribute('g-boost-errors', '422'));
	await page.getByRole('button', { name: 'Publish', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveText('Title already exists');
	await expect.poll(() => page.evaluate(() => (window as any).__outcomes.length)).toBe(2);
	await expect(page).toHaveURL(/\/dogfood\/form$/);
	expect(submissions).toHaveLength(2);
	for (const body of submissions) { expect(body).toContain('name="action"'); expect(body).toContain('publish'); }
	expect(await page.evaluate(() => (window as any).__forms)).toEqual(['start', 'end', 'start', 'end']);
	expect(await page.evaluate(() => (window as any).__outcomes)).toEqual([
		{ outcome: 'http-error', status: 422, committed: false }, { outcome: 'http-error', status: 422, committed: true }
	]);
	expect(await page.evaluate(() => (window as any).__violations)).toEqual([]);
});
