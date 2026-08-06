import { expect, test } from '@playwright/test';

function silentWav(durationSeconds = 1): Buffer {
	const sampleRate = 8_000;
	const dataLength = sampleRate * durationSeconds;
	const buffer = Buffer.alloc(44 + dataLength);
	buffer.write('RIFF', 0);
	buffer.writeUInt32LE(36 + dataLength, 4);
	buffer.write('WAVEfmt ', 8);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20);
	buffer.writeUInt16LE(1, 22);
	buffer.writeUInt32LE(sampleRate, 24);
	buffer.writeUInt32LE(sampleRate, 28);
	buffer.writeUInt16LE(1, 32);
	buffer.writeUInt16LE(8, 34);
	buffer.write('data', 36);
	buffer.writeUInt32LE(dataLength, 40);
	buffer.fill(128, 44);
	return buffer;
}

test.beforeEach(async ({ page }) => {
	page.on('dialog', dialog => dialog.dismiss());
	await page.route('https://cdn.notegpt.io/**', route => route.fulfill({
		body: silentWav(),
		contentType: 'audio/wav'
	}));
});

test('boosted navigation creates usable media and preserves the player', async ({ page }) => {
	await page.goto('/router/layout-base.html');
	await page.evaluate(() => ((window as any).__gyosE2EPageIdentity = 'layout-base'));

	await page.locator('nav a[href="/router/home.html"]').click();
	await expect(page).toHaveURL(/\/router\/home\.html$/);
	await expect(page.getByRole('heading', { name: 'Welcome to GyosJs Router Demo!' })).toBeVisible();
	expect(await page.evaluate(() => (window as any).__gyosE2EPageIdentity)).toBe('layout-base');

	const player = page.locator('[g-persist="player"]');
	const audio = player.locator('audio');
	await expect(audio).toHaveCount(1);
	await audio.evaluate((element: HTMLAudioElement) => {
		element.dataset.e2eIdentity = 'original-player';
		element.load();
	});
	await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThan(0);
	expect(await audio.evaluate((element: HTMLAudioElement) => element.error)).toBeNull();

	await page.locator('nav a[href="/router/posts.html"]').click();
	await expect(page).toHaveURL(/\/router\/posts\.html$/);
	await expect(page.locator('audio[data-e2e-identity="original-player"]')).toHaveCount(1);

	await page.locator('nav a[href="/router/persist-player.html"]').click();
	await expect(page).toHaveURL(/\/router\/persist-player\.html$/);
	await expect(page.locator('audio[data-e2e-identity="original-player"]')).toHaveCount(1);
});

test('partial morph and repeated prepend preserve existing page state', async ({ page }) => {
	await page.goto('/router/profile-with-sidebar.html');
	const title = await page.title();
	const sidebar = page.locator('#sidebar');
	await sidebar.evaluate(element => ((element as any).__gyosE2EIdentity = 'sidebar'));

	await page.getByRole('button', { name: 'Load sidebar details (by partial)' }).click();
	await expect(page).toHaveURL(/\/router\/profile-with-sidebar\.html$/);
	expect(await page.title()).toBe(title);
	expect(await page.locator('#sidebar').evaluate(element => (element as any).__gyosE2EIdentity)).toBe('sidebar');

	await page.getByPlaceholder('Search...').fill('reactivity');
	const loadMore = page.getByRole('button', { name: 'Load more posts' });
	await loadMore.click();
	await expect(page.locator('#items > p')).toHaveCount(1);
	await page.locator('#items > p').evaluate(element => ((element as any).__gyosE2EIdentity = 'first-item'));

	await loadMore.click();
	await expect(page.locator('#items > p')).toHaveCount(2);
	const itemIdentities = await page.locator('#items > p').evaluateAll(elements =>
		elements.map(element => (element as any).__gyosE2EIdentity)
	);
	expect(itemIdentities).toContain('first-item');
	await expect(page.getByPlaceholder('Search...')).toHaveValue('reactivity');
});

test('morph navigation keeps compatible input identity and value', async ({ page }) => {
	await page.goto('/router/morph-a.html');
	const input = page.getByPlaceholder('Try typing...');
	await input.fill('kept by morph');
	await input.evaluate(element => ((element as any).__gyosE2EIdentity = 'morph-input'));

	await page.getByRole('link', { name: 'Morph B' }).click();
	await expect(page).toHaveURL(/\/router\/morph-b\.html\?v=kept(?:\+|%20)by(?:\+|%20)morph$/);
	const morphedInput = page.getByPlaceholder('Still here...');
	expect(await morphedInput.evaluate(element => (element as any).__gyosE2EIdentity)).toBe('morph-input');
	await expect(morphedInput).toHaveValue('kept by morph');
	await expect(page.getByRole('heading', { name: 'Card B1' })).toBeVisible();
});

test('snapshot back and forward restore scroll and persist state without refetching', async ({ page }) => {
	const dialogs: string[] = [];
	const boostedRequests: string[] = [];
	page.on('dialog', dialog => dialogs.push(dialog.message()));
	page.on('request', request => {
		if (request.resourceType() !== 'fetch') return;
		const pathname = new URL(request.url()).pathname;
		if (pathname === '/router/home.html' || pathname === '/router/posts.html') {
			boostedRequests.push(pathname);
		}
	});

	await page.goto('/router/layout-base.html');
	await page.locator('nav a[href="/router/home.html"]').click();
	await expect(page).toHaveURL(/\/router\/home\.html$/);
	const player = page.locator('[g-persist="player"]');
	await player.evaluate(element => ((element as HTMLElement).dataset.e2eIdentity = 'snapshot-player'));
	const homeScroll = await page.evaluate(() => {
		document.body.style.minHeight = '3000px';
		window.scrollTo(0, 640);
		return window.scrollY;
	});
	expect(homeScroll).toBeGreaterThan(500);

	let releasePosts!: () => void;
	const postsGate = new Promise<void>(resolve => { releasePosts = resolve; });
	await page.route('**/router/posts.html', async route => {
		await postsGate;
		await route.continue();
	});
	await page.locator('nav a[href="/router/posts.html"]').evaluate(element => (element as HTMLElement).click());
	await expect.poll(() => page.evaluate(() => history.state?.scroll?.y)).toBeGreaterThan(500);
	const savedHomeScroll = await page.evaluate(() => history.state.scroll.y as number);
	expect(Math.abs(savedHomeScroll - homeScroll)).toBeLessThanOrEqual(5);
	releasePosts();
	await expect(page).toHaveURL(/\/router\/posts\.html$/);
	await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible();
	await expect(page.locator('[g-persist="player"][data-e2e-identity="snapshot-player"]')).toHaveCount(1);
	await page.evaluate(() => window.scrollTo(0, 920));
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(800);

	await page.goBack();
	await expect(page).toHaveURL(/\/router\/home\.html$/);
	await expect(page.getByRole('heading', { name: 'Welcome to GyosJs Router Demo!' })).toBeVisible();
	expect(await page.evaluate(() => history.state)).toEqual(
		expect.objectContaining({ scroll: { x: 0, y: savedHomeScroll } })
	);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(savedHomeScroll);
	await expect(page.locator('[g-persist="player"][data-e2e-identity="snapshot-player"]')).toHaveCount(1);

	await page.goForward();
	await expect(page).toHaveURL(/\/router\/posts\.html$/);
	await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible();
	await expect(page.locator('[g-persist="player"][data-e2e-identity="snapshot-player"]')).toHaveCount(1);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(800);

	expect(boostedRequests.filter(path => path === '/router/home.html')).toHaveLength(1);
	expect(boostedRequests.filter(path => path === '/router/posts.html')).toHaveLength(1);
	expect(dialogs).toEqual([
		"I'm Home.html, I'll show only once!",
		"I'm Posts.html, I'll show only once!"
	]);
});

test('partial snapshot history replays each edge into its original target', async ({ page }) => {
	const requests: string[] = [];
	page.on('request', request => {
		if (request.resourceType() === 'fetch') requests.push(new URL(request.url()).pathname);
	});
	const pageHtml = (label: 'A' | 'B' | 'C') => `
		<!doctype html><html><head><title>Partial ${label}</title></head><body g-boost>
			<div id="app" g-outlet>
				<header id="stable-shell">Stable shell</header>
				<div id="panel" g-snapshot>
					<strong>Panel ${label}</strong>
					${label === 'B' ? '<a id="partial-third" href="/router/fixtures/partial-c.html" g-target="#sidebar" g-swap="prepend" g-change-state>Partial C</a>' : ''}
				</div>
				<aside id="sidebar" g-snapshot>Sidebar ${label === 'C' ? 'C' : 'A'}</aside>
				${label === 'A' ? '<a id="partial-next" href="/router/fixtures/partial-b.html" g-target="#panel" g-swap="morph" g-change-state g-router-spin>Partial B</a>' : ''}
			</div>
		</body></html>
	`;
	await page.route('**/router/fixtures/partial-a.html', route => route.fulfill({
		contentType: 'text/html',
		body: pageHtml('A')
	}));
	await page.route('**/router/fixtures/partial-b.html', route => route.fulfill({
		contentType: 'text/html',
		body: pageHtml('B')
	}));
	await page.route('**/router/fixtures/partial-c.html', route => route.fulfill({
		contentType: 'text/html',
		body: pageHtml('C')
	}));

	await page.goto('/router/layout-base.html');
	await page.locator('#app').evaluate(outlet => {
		outlet.innerHTML = '<a id="partial-a" href="/router/fixtures/partial-a.html">Partial A</a>';
	});
	await page.locator('#partial-a').click();
	await expect(page).toHaveURL(/\/router\/fixtures\/partial-a\.html$/);
	const shell = page.locator('#stable-shell');
	await shell.evaluate(element => ((element as any).__gyosE2EIdentity = 'stable-shell'));

	await page.locator('#partial-next').click();
	await expect(page).toHaveURL(/\/router\/fixtures\/partial-b\.html$/);
	await expect(page.locator('#panel')).toContainText('Panel B');
	expect(await shell.evaluate(element => (element as any).__gyosE2EIdentity)).toBe('stable-shell');
	await page.locator('#partial-third').click();
	await expect(page).toHaveURL(/\/router\/fixtures\/partial-c\.html$/);
	await expect(page.locator('#sidebar')).toContainText('Sidebar C');

	await page.goBack();
	await expect(page).toHaveURL(/\/router\/fixtures\/partial-b\.html$/);
	await expect(page.locator('#sidebar')).toHaveText('Sidebar A');
	await expect(page.locator('#panel')).toContainText('Panel B');

	await page.goBack();
	await expect(page).toHaveURL(/\/router\/fixtures\/partial-a\.html$/);
	await expect(page.locator('#panel')).toHaveText('Panel A');
	await expect(page.locator('.gyos-target-spinner')).toHaveCount(0);
	expect(await shell.evaluate(element => (element as any).__gyosE2EIdentity)).toBe('stable-shell');

	await page.goForward();
	await expect(page).toHaveURL(/\/router\/fixtures\/partial-b\.html$/);
	await expect(page.locator('#panel')).toContainText('Panel B');
	expect(await shell.evaluate(element => (element as any).__gyosE2EIdentity)).toBe('stable-shell');
	await page.goForward();
	await expect(page).toHaveURL(/\/router\/fixtures\/partial-c\.html$/);
	await expect(page.locator('#sidebar')).toContainText('Sidebar C');
	expect(requests.filter(path => path === '/router/fixtures/partial-a.html')).toHaveLength(1);
	expect(requests.filter(path => path === '/router/fixtures/partial-b.html')).toHaveLength(1);
	expect(requests.filter(path => path === '/router/fixtures/partial-c.html')).toHaveLength(1);
});

test('same-URL history entries restore their own scroll positions', async ({ page }) => {
	let requestCount = 0;
	const fixture = (label: string) => `
		<!doctype html><html><head><title>Same URL</title></head><body g-boost style="min-height: 3000px">
			<div id="app" g-outlet>
				<div id="same-panel" g-snapshot>Panel ${label}</div>
				<a id="same-next" href="/router/fixtures/same-url.html" g-target="#same-panel" g-change-state>Same URL next</a>
			</div>
		</body></html>
	`;
	await page.route('**/router/fixtures/same-url.html', route => {
		requestCount += 1;
		return route.fulfill({
			contentType: 'text/html',
			body: fixture(requestCount === 1 ? 'A' : 'B')
		});
	});

	await page.goto('/router/layout-base.html');
	await page.locator('#app').evaluate(outlet => {
		outlet.innerHTML = '<a id="same-start" href="/router/fixtures/same-url.html">Same URL fixture</a>';
	});
	await page.locator('#same-start').click();
	await expect(page.locator('#same-panel')).toHaveText('Panel A');
	await page.evaluate(() => {
		document.body.style.minHeight = '3000px';
		window.scrollTo(0, 620);
	});
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
	const firstEntryId = await page.evaluate(() => history.state?.gyosEntryId);
	await page.locator('#same-next').evaluate(element => (element as HTMLElement).click());
	await expect(page.locator('#same-panel')).toHaveText('Panel B');
	const secondEntryId = await page.evaluate(() => history.state?.gyosEntryId);
	expect(secondEntryId).not.toBe(firstEntryId);
	await page.evaluate(() => window.scrollTo(0, 940));
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(800);

	await page.goBack();
	await expect(page.locator('#same-panel')).toHaveText('Panel A');
	expect(await page.evaluate(() => history.state?.scroll?.y)).toBe(620);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
	await page.goForward();
	await expect(page.locator('#same-panel')).toHaveText('Panel B');
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(800);
	expect(requestCount).toBe(2);
});

test('head and outlet scripts follow lifecycle rules across snapshot history', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', error => pageErrors.push(error.message));

	const fixture = (name: 'A' | 'B', next: 'a' | 'b') => `
		<!doctype html>
		<html>
		<head>
			<title>Script ${name}</title>
			${name === 'A' ? '<script src="./external-once.js" g-script-once><\/script>' : ''}
		</head>
		<body g-boost>
			<div id="app" g-outlet g-snapshot>
				<h1>Script ${name}</h1>
				<a href="/router/fixtures/script-fixture-${next}.html">Next</a>
				<script g-script-wrap>
					const localPageName = '${name}';
					if (localPageName === 'A') {
						window.__gyosHeadBeforeOutlet = window.__gyosExternalRuns === 1;
					}
					window['__gyosOutlet' + localPageName + 'Runs'] = (window['__gyosOutlet' + localPageName + 'Runs'] || 0) + 1;
				<\/script>
				${name === 'A' ? '<script g-script-once>window.__gyosOutletOnceRuns = (window.__gyosOutletOnceRuns || 0) + 1;<\/script>' : ''}
			</div>
		</body>
		</html>
	`;

	await page.route('**/router/fixtures/script-fixture-a.html', route => route.fulfill({
		contentType: 'text/html',
		body: fixture('A', 'b')
	}));
	await page.route('**/router/fixtures/script-fixture-b.html', route => route.fulfill({
		contentType: 'text/html',
		body: fixture('B', 'a')
	}));
	await page.route('**/router/fixtures/external-once.js', route => route.fulfill({
		contentType: 'text/javascript',
		body: 'window.__gyosExternalRuns = (window.__gyosExternalRuns || 0) + 1;'
	}));

	await page.goto('/router/layout-base.html');
	await page.locator('#app').evaluate(outlet => {
		outlet.innerHTML = '<a id="script-fixture" href="/router/fixtures/script-fixture-a.html">Script fixture</a>';
	});
	await page.locator('#script-fixture').click();
	await expect(page).toHaveURL(/\/router\/fixtures\/script-fixture-a\.html$/);
	await expect.poll(() => page.evaluate(() => (window as any).__gyosExternalRuns || 0)).toBe(1);
	await expect.poll(() => page.evaluate(() => (window as any).__gyosOutletARuns || 0)).toBe(1);
	expect(await page.evaluate(() => (window as any).__gyosHeadBeforeOutlet)).toBe(true);
	await expect.poll(() => page.evaluate(() => (window as any).__gyosOutletOnceRuns || 0)).toBe(1);

	await page.getByRole('link', { name: 'Next' }).click();
	await expect(page).toHaveURL(/\/router\/fixtures\/script-fixture-b\.html$/);
	await expect.poll(() => page.evaluate(() => (window as any).__gyosOutletBRuns || 0)).toBe(1);

	await page.goBack();
	await expect(page).toHaveURL(/\/router\/fixtures\/script-fixture-a\.html$/);
	await expect.poll(() => page.evaluate(() => (window as any).__gyosOutletARuns || 0)).toBe(2);
	await expect.poll(() => page.evaluate(() => (window as any).__gyosExternalRuns || 0)).toBe(1);
	await expect.poll(() => page.evaluate(() => (window as any).__gyosOutletOnceRuns || 0)).toBe(1);

	await page.goForward();
	await expect(page).toHaveURL(/\/router\/fixtures\/script-fixture-b\.html$/);
	await expect.poll(() => page.evaluate(() => (window as any).__gyosOutletBRuns || 0)).toBe(2);
	expect(pageErrors).toEqual([]);
});

test('module scripts register scopes before mount and after-navigation hooks', async ({ page }) => {
	const browserErrors: string[] = [];
	page.on('console', message => {
		if (message.type() === 'error') browserErrors.push(message.text());
	});
	page.on('requestfailed', request => browserErrors.push(
		`${request.url()}: ${request.failure()?.errorText || 'request failed'}`
	));
	await page.route('**/router/fixtures/module-register.js', route => route.fulfill({
		contentType: 'text/javascript',
		body: `
			window.Gyos.scope('LateBrowserScope', {
				message: 'module ready',
				onMount() {
					window.__gyosModuleOrder.push('mount');
				}
			});
		`
	}));
	await page.route('**/router/fixtures/module-scope.html', route => route.fulfill({
		contentType: 'text/html',
		body: `
			<!doctype html>
			<html><head><title>Module Scope</title></head><body g-boost>
				<div id="app" g-outlet>
					<section g-scope="LateBrowserScope"><span id="module-message">{message}</span></section>
					<script type="module" src="./module-register.js"><\/script>
				</div>
			</body></html>
		`
	}));

	await page.goto('/router/layout-base.html');
	await page.evaluate(() => {
		(window as any).__gyosModuleOrder = [];
		(window as any).Gyos.onAfterNavigate(() => (window as any).__gyosModuleOrder.push('after'));
	});
	await page.locator('#app').evaluate(outlet => {
		outlet.innerHTML = '<a id="module-fixture" href="/router/fixtures/module-scope.html">Module fixture</a>';
	});
	await page.locator('#module-fixture').click();

	await expect(page).toHaveURL(/\/router\/fixtures\/module-scope\.html$/);
	await expect.poll(() => page.evaluate(() => {
		const scopeElement = document.querySelector('[g-scope="LateBrowserScope"]') as any;
		return {
			order: (window as any).__gyosModuleOrder,
			scopeKeys: Object.keys(scopeElement?.__gyos_scope__ || {}),
			text: document.querySelector('#module-message')?.textContent
		};
	})).toEqual({
		order: ['mount', 'after'],
		scopeKeys: expect.arrayContaining(['message']),
		text: 'module ready'
	});
	expect(browserErrors).toEqual([]);
	await expect(page.locator('#module-message')).toHaveText('module ready');
	await expect.poll(() => page.evaluate(() => (window as any).__gyosModuleOrder)).toEqual(['mount', 'after']);
});

test('small MPA demo navigates without a full document reload and keeps ClockApp', async ({ page }) => {
	await page.goto('/mpa-demo/home.html');
	await expect(page.locator('[g-persist="timer-app"]')).toBeVisible();
	await page.locator('[g-persist="timer-app"]').evaluate(element => {
		(element as HTMLElement).dataset.e2eIdentity = 'clock';
		(window as any).__gyosE2EPageIdentity = 'mpa-home';
	});

	await page.getByRole('link', { name: 'About Us' }).click();
	await expect(page).toHaveURL(/\/mpa-demo\/about\.html$/);
	await expect(page.getByText('This is the about page.')).toBeVisible();
	await expect(page.locator('[g-persist="timer-app"][data-e2e-identity="clock"]')).toHaveCount(1);
	expect(await page.evaluate(() => (window as any).__gyosE2EPageIdentity)).toBe('mpa-home');
});

test('CDN bundle attaches window.Gyos and auto-mounts markup', async ({ page }) => {
	await page.setContent(`
		<div g-scope="{ count: 1 }">
			<button @click="count++">Increment</button>
			<span>{count}</span>
		</div>
	`);
	await page.addScriptTag({ path: 'dist/gyos.auto.min.js' });

	await expect.poll(() => page.evaluate(() => typeof (window as any).Gyos)).toBe('object');
	await expect(page.locator('span')).toHaveText('1');
	await page.getByRole('button', { name: 'Increment' }).click();
	await expect(page.locator('span')).toHaveText('2');
});
