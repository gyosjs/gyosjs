import { expect, test } from '@playwright/test';

for (const build of ['standard', 'csp']) {
  test(`${build} partial history restores working reactive controls`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const bundle = build === 'csp' ? 'gyos.csp.auto.js' : 'gyos.auto.js';
    await page.route('**/audit-bundle.js', route => route.fulfill({ contentType: 'text/javascript; charset=utf-8', path: `dist/${bundle}` }));
    await page.route('**/audit-history/*', route => {
      const count = new URL(route.request().url()).pathname.endsWith('/next') ? 10 : 1;
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8">
        <script src="/audit-bundle.js"></script></head><body g-boost>
        <main g-outlet><a href="/audit-history/next" g-target="#panel" g-noscroll>Next</a>
        <section id="panel"><div g-scope="{ count: ${count} }"><button @click="count++">Increment</button><output>{count}</output></div></section>
        </main></body></html>` });
    });
    await page.goto('/audit-history/start');
    expect(errors).toEqual([]);
    await expect(page.locator('#panel output')).toHaveText('1');
    await page.locator('main').evaluate(el => (el as any).__auditIdentity = 'retained');
    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page.locator('#panel output')).toHaveText('10');
    expect(await page.locator('main').evaluate(el => (el as any).__auditIdentity), 'shell after Next').toBe('retained');
    await page.goBack();
    await expect(page.locator('#panel output')).toHaveText('1');
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.locator('#panel output')).toHaveText('2');
    expect(errors).toEqual([]);
    expect(await page.locator('main').evaluate(el => (el as any).__auditIdentity), 'shell after Back').toBe('retained');
    await page.goForward();
    await expect(page.locator('#panel output')).toHaveText('10');
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.locator('#panel output')).toHaveText('11');
    expect(await page.locator('main').evaluate(el => (el as any).__auditIdentity)).toBe('retained');
    expect(errors).toEqual([]);
  });

  test(`${build} bundle respects structural ownership and async cleanup`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    if (build === 'csp') await page.goto('/csp.html');
    else {
      await page.setContent('<!doctype html><html><body></body></html>');
      await page.addScriptTag({ path: 'dist/gyos.auto.min.js' });
    }
    const result = await page.evaluate(async () => {
      const Gyos = (window as any).Gyos;
      const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
      const root = document.createElement('main');
      root.setAttribute('g-scope', 'AuditBrowser');
      root.innerHTML = `<b *for="item in items">{item}</b><footer>Keep</footer>
        <section *if="show" g-scope="AuditChild"><i>{label}</i></section>
        <article *await="request"><output *then="result">{label}: {result}</output></article>`;
      document.body.append(root);
      Gyos.scope('AuditChild', () => ({ label: 'child' }));
      Gyos.scope('AuditBrowser', () => ({ items: [1], show: true, label: 'before', request: Promise.resolve('first') }));
      Gyos.mountAll(root);
      await flush();
      const state = Gyos.mountedScopes().get(root);
      const first = root.querySelector('output')?.textContent;
      state.items = [2, 3]; state.label = 'after'; state.request = Promise.resolve('second');
      await flush();
      const updated = { rows: [...root.querySelectorAll('b')].map(el => el.textContent), footer: root.querySelector('footer')?.textContent,
        child: root.querySelector('i')?.textContent, result: root.querySelector('output')?.textContent };
      let resolve!: (value: string) => void;
      state.request = new Promise<string>(done => { resolve = done; });
      await flush(); Gyos.cleanup(root);
      const snapshot = root.innerHTML;
      state.items = []; state.show = false; resolve('late'); await flush();
      return { first, updated, unchanged: root.innerHTML === snapshot };
    });
    expect(result).toEqual({ first: 'before: first', updated: { rows: ['2', '3'], footer: 'Keep', child: 'child', result: 'after: second' }, unchanged: true });
    expect(errors).toEqual([]);
  });
}
