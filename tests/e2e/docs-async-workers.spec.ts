import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';

// Serve the actual Markdown examples as modules, including a real Worker URL.
const recipe = readFileSync('docs/en/async-workers.md', 'utf8').replace(/\r\n/g, '\n');
const markup = recipe.match(/```html\n([\s\S]*?)\n```/)![1];
const scripts = [...recipe.matchAll(/```js\n([\s\S]*?)\n```/g)].map(match => match[1]);
const panel = markup.replace('<script type="module" src="/src/primes.js"></script>', '');
let server: Server, origin: string;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname;
    const build = path.split('/')[1];
    if (!['standard', 'csp'].includes(build)) { response.writeHead(404).end(); return; }
    let body: string, type = 'text/javascript';
    if (path === `/${build}/`) {
      type = 'text/html';
      body = `<!doctype html><html><body>${panel}${panel}<script type="module" src="/${build}/src/primes.js"></script></body></html>`;
      if (build === 'csp') response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; worker-src 'self'; object-src 'none'");
    } else if (path === `/${build}/src/primes.js`) {
      body = scripts[0].replace("'gyosjs/csp'", `'/${build}/gyos.js'`);
    } else if (path === `/${build}/src/primes.worker.js`) {
      body = scripts[1];
    } else if (path === `/${build}/gyos.js`) {
      body = readFileSync(`dist/gyos.${build === 'csp' ? 'csp.' : ''}esm.js`, 'utf8');
    } else { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }).end(body);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(async () => {
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
});

async function emit(page: Page, index: number, patch: Record<string, unknown> = {}) {
  await page.evaluate(({ index, patch }) => {
    const worker = (window as any).__asyncProbe.workers[index];
    worker.message({ data: { ...worker.request, type: 'result', count: 25, ...patch } });
  }, { index, patch });
}

for (const build of ['standard', 'csp']) {
  test(`${build}: documented real module Worker computes and isolates scopes`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      (window as any).__violations = [];
      document.addEventListener('securitypolicyviolation', event => (window as any).__violations.push(event.violatedDirective));
    });
    await page.goto(`${origin}/${build}/`);
    const first = page.locator('section').nth(0), second = page.locator('section').nth(1);
    await expect(first.locator('[role="status"]')).toHaveText('Ready');
    await first.getByRole('spinbutton').fill('100');
    const created = page.waitForEvent('worker');
    await first.getByRole('button', { name: 'Count / Restart' }).click();
    const worker = await created;
    expect(worker.url()).toBe(`${origin}/${build}/src/primes.worker.js`);
    await expect(first.locator('output')).toHaveText('25 primes up to 100');
    await expect(first.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await expect(second.locator('output')).toHaveText('No result');
    await second.getByRole('spinbutton').fill('1000');
    await second.getByRole('button', { name: 'Count / Restart' }).click();
    await expect(second.locator('output')).toHaveText('168 primes up to 1000');
    await expect(first.locator('output')).toHaveText('25 primes up to 100');
    expect(await page.evaluate(() => (window as any).__violations)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`${build}: documented ownership rejects stale callbacks and releases resources`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    await page.addInitScript(() => {
      const probe = { workers: [] as any[], timers: new Set<number>(), mode: '' };
      (window as any).__asyncProbe = probe;
      const set = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
      window.setTimeout = ((callback: () => void, ms: number) => {
        const id = set(() => { probe.timers.delete(id); callback(); }, ms);
        if (ms === 5000) probe.timers.add(id);
        return id;
      }) as any;
      window.clearTimeout = id => { probe.timers.delete(id!); clear(id); };
      (window as any).Worker = class {
        onmessage: any; onerror: any; onmessageerror: any;
        message: any; error: any; messageerror: any; request: any; stopped = false;
        constructor() {
          if (probe.mode === 'construct') throw Error('Worker blocked');
          probe.workers.push(this);
        }
        postMessage(request: any) {
          this.request = structuredClone(request);
          // Keep captured callbacks even after handlers are removed: test guards,
          // not just whether a fake Worker honors terminate().
          this.message = this.onmessage; this.error = this.onerror; this.messageerror = this.onmessageerror;
          if (probe.mode === 'post') throw Error('Could not clone');
        }
        terminate() { this.stopped = true; }
      };
    });
    await page.goto(`${origin}/${build}/`);
    const first = page.locator('section').nth(0), second = page.locator('section').nth(1);
    const run = () => first.getByRole('button', { name: 'Count / Restart' }).click();
    const resources = () => page.evaluate(() => {
      const p = (window as any).__asyncProbe;
      return { live: p.workers.filter((w: any) => !w.stopped).length, timers: p.timers.size };
    });
    await expect(first.locator('[role="status"]')).toHaveText('Ready');
    await first.getByRole('spinbutton').fill('1'); await run();
    await expect(first.getByRole('alert')).toHaveText('Enter an integer from 2 to 1000000.');
    expect(await resources()).toEqual({ live: 0, timers: 0 });
    await first.getByRole('spinbutton').fill('100'); await run(); // 0
    await run(); // 1 supersedes 0, even with identical input.
    await emit(page, 0);
    await page.evaluate(() => (window as any).__asyncProbe.workers[0].error({ preventDefault() {} }));
    await expect(first.locator('[role="status"]')).toHaveText('Counting...');
    await expect(first.getByRole('alert')).toHaveText('');
    await emit(page, 1, { id: -1 }); await emit(page, 1, { limit: 101 });
    await expect(first.locator('output')).toHaveText('No result');
    expect(await resources()).toEqual({ live: 1, timers: 1 });
    await emit(page, 1);
    await emit(page, 1, { count: 99 }); // Duplicate must not change the answer.
    await expect(first.locator('output')).toHaveText('25 primes up to 100');
    expect(await resources()).toEqual({ live: 0, timers: 0 });

    await run(); // 2: input edit invalidates before next request.
    await first.getByRole('spinbutton').fill('200');
    await first.getByRole('spinbutton').fill('100');
    await emit(page, 2);
    await expect(first.locator('output')).toHaveText('No result');
    await run(); // 3: explicit cancellation.
    await first.getByRole('button', { name: 'Cancel', exact: true }).click();
    await emit(page, 3);
    expect(await resources()).toEqual({ live: 0, timers: 0 });
    await expect(first.locator('[role="status"]')).toHaveText('Ready');

    for (const mode of ['invalid', 'error', 'messageerror', 'reported', 'timeout', 'construct', 'post']) {
      const index = await page.evaluate(mode => {
        const p = (window as any).__asyncProbe; p.mode = mode; return p.workers.length;
      }, mode);
      await run();
      if (mode === 'invalid') await emit(page, index, { count: '25' });
      if (mode === 'reported') await emit(page, index, { type: 'error' });
      if (mode === 'error' || mode === 'messageerror') await page.evaluate(({ index, mode }) => {
        (window as any).__asyncProbe.workers[index][mode]({ preventDefault() {} });
      }, { index, mode });
      if (mode === 'timeout') await page.clock.runFor(5100);
      await expect(first.getByRole('alert')).toHaveText('Worker could not finish. Try again.');
      await expect(first.locator('[role="status"]')).toHaveText('Ready');
      expect(await resources()).toEqual({ live: 0, timers: 0 });
      if (mode !== 'construct') await emit(page, index);
      await expect(first.locator('output')).toHaveText('No result');
    }
    await page.evaluate(() => { (window as any).__asyncProbe.mode = ''; });
    // Fresh scopes after cleanup must work; old callbacks cannot update retired signals.
    for (let cycle = 0; cycle < 3; cycle++) {
      const index = await page.evaluate(() => (window as any).__asyncProbe.workers.length);
      await run();
      await page.evaluate(async ({ panel, build }) => {
        const { default: Gyos } = await import(`/${build}/gyos.js`);
        const root = document.querySelector('section')!;
        const state = Gyos.mountedScopes().get(root);
        (window as any).__retired = state;
        Gyos.cleanup(root);
        root.outerHTML = panel;
        Gyos.mountAll();
      }, { panel, build });
      await emit(page, index);
      await page.evaluate(index => (window as any).__asyncProbe.workers[index].error({ preventDefault() {} }), index);
      expect(await page.evaluate(() => {
        const state = (window as any).__retired;
        state.run(); // A retained method cannot resurrect its disposed scope.
        return [state.result(), state.error()];
      })).toEqual([null, '']);
      await expect(first.locator('output')).toHaveText('No result');
      expect(await resources()).toEqual({ live: 0, timers: 0 });
    }
    const index = await page.evaluate(() => (window as any).__asyncProbe.workers.length);
    await first.getByRole('spinbutton').fill('100'); await run();
    await emit(page, index);
    await expect(first.locator('output')).toHaveText('25 primes up to 100');
    await expect(second.locator('output')).toHaveText('No result');
    expect(await resources()).toEqual({ live: 0, timers: 0 });
    expect(errors).toEqual([]);
  });
}
