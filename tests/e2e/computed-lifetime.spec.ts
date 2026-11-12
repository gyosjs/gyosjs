import { expect, test } from '@playwright/test';

for (const build of ['standard', 'csp']) {
  test(`${build} survives cyclic watches, computed resubscription and initial cleanup`, async ({ page }) => {
    await page.goto('/router/layout-base.html');
    await page.addScriptTag({ path: `dist/gyos.${build === 'csp' ? 'csp.' : ''}auto.min.js` });
    const result = await page.evaluate(async () => {
      const Gyos = (window as any).Gyos;
      const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
      const source = Gyos.signal(1), doubled = Gyos.computed(() => source() * 2);
      const reads: number[] = [];
      const stop = Gyos.effect(() => { reads.push(doubled()); });
      stop(); source(2); const peek = doubled.peek;
      const resume = Gyos.effect(() => { reads.push(doubled()); });
      source(3); await flush(); resume();
      const root = document.createElement('main'); root.setAttribute('g-scope', 'LifetimeBrowser'); document.body.append(root);
      const value: any = { count: 0, map: new Map([['a', 1]]) }; value.self = value;
      const snapshots: any[] = [];
      Gyos.scope('LifetimeBrowser', () => ({ value, onMount() {
        this.$watch('value', (next: any, previous: any) => snapshots.push([next.count, previous.count, next.self === next, next.map.get('a')]), { deep: true });
      } }));
      Gyos.mount(root);
      const state = Gyos.mountedScopes().get(root);
      state.value.count = 1; await flush(); state.value.map = new Map([['a', 2]]); await flush();
      Gyos.cleanup(root, true);
      const dead = document.createElement('main'); dead.setAttribute('g-scope', 'CleanupBrowser');
      dead.innerHTML = '<b g-text="stop()"></b><i g-text="later()"></i>'; document.body.append(dead);
      let mounted = 0, unmounted = 0, evaluated = 0;
      Gyos.scope('CleanupBrowser', () => ({
        stop() { source(); evaluated++; Gyos.cleanup(dead); return 'done'; },
        later() { evaluated++; return source(); },
        onMount() { mounted++; }, onUnmount() { unmounted++; },
      }));
      Gyos.mount(dead); source(4); await flush();
      return { reads, peek, snapshots, mounted, unmounted, evaluated, retained: Gyos.mountedScopes().has(dead) };
    });
    expect(result).toEqual({ reads: [2, 4, 6], peek: 4, snapshots: [[1, 0, true, 1], [1, 1, true, 2]],
      mounted: 0, unmounted: 1, evaluated: 1, retained: false });
  });

  test(`${build} releases unused computed closures while the source remains alive`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Explicit GC uses Chromium DevTools; behavior tests run on all browsers.');
    await page.goto('/router/layout-base.html');
    await page.addScriptTag({ path: `dist/gyos.${build === 'csp' ? 'csp.' : ''}auto.min.js` });
    await page.evaluate(() => {
      const Gyos = (window as any).Gyos;
      const source = Gyos.signal(0), refs: any[] = [];
      const make = () => {
        const payload = { offset: 1 };
        refs.push(new (globalThis as any).WeakRef(payload));
        return Gyos.computed(() => source() + payload.offset);
      };
      for (let i = 0; i < 20; i++) {
        make()(); // A one-off read must not pin its closure to the source.
        const derived = make();
        const chain = Gyos.computed(() => derived() * 2);
        const stop = Gyos.effect(() => { chain(); });
        stop(); // Cascades through the chain when its last consumer disappears.
      }
      const active = make();
      const stopActive = Gyos.effect(() => { (window as any).__lastValue = active(); });
      (window as any).__lifetime = { source, refs, stopActive };
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    const collected = await page.evaluate(() => {
      const { source, refs } = (window as any).__lifetime;
      source(2);
      return refs.map((ref: any) => ref.deref() === undefined);
    });
    expect(collected.slice(0, 40)).toEqual(Array(40).fill(true));
    expect(collected[40]).toBe(false);
    await expect.poll(() => page.evaluate(() => (window as any).__lastValue)).toBe(3);
    await page.evaluate(() => { (window as any).__lifetime.stopActive(); delete (window as any).__lifetime.stopActive; });
    await cdp.send('HeapProfiler.collectGarbage');
    expect(await page.evaluate(() => (window as any).__lifetime.refs[40].deref() === undefined)).toBe(true);
  });
}
