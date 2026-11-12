import { expect, test } from '@playwright/test';

for (const build of ['standard', 'csp']) {
  test(`${build} renders static structures once and reads frozen nested data`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/router/layout-base.html');
    await page.addScriptTag({ path: `dist/gyos.${build === 'csp' ? 'csp.' : ''}auto.min.js` });
    const result = await page.evaluate(async () => {
      const Gyos = (window as any).Gyos;
      const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
      const root = document.createElement('main'); root.setAttribute('g-scope', 'StaticBrowser');
      root.innerHTML = `<section g-static><b *if="show">yes</b><i *else :title="label">{label}</i>
        <p *for="item in items" :title="item.name">{item.name}</p>
        <div g-scope="StaticBrowserChild"><em g-text="label" :title="label"></em><button @click="label = 'clicked'">click</button></div>
        <article *await="request"><small *pending>pending</small><strong *then="value">{value}</strong></article></section>
        <aside>{config.child.label}</aside>`;
      document.body.append(root);
      let resolve!: (value: string) => void;
      let disposed = 0;
      Gyos.scope('StaticBrowserChild', () => ({ label: 'child', onUnmount() { disposed++; } }));
      Gyos.scope('StaticBrowser', () => ({ show: false, label: 'parent', items: [{ name: 'one' }, { name: 'two' }],
        request: new Promise<string>(done => { resolve = done; }), config: Object.freeze({ child: { label: 'frozen' } }) }));
      Gyos.mountAll(root);
      const state = Gyos.mountedScopes().get(root);
      const child = Gyos.mountedScopes().get(root.querySelector('[g-scope]'));
      const initial = { selected: root.querySelector('i')?.textContent, child: root.querySelector('em')?.textContent,
        rows: [...root.querySelectorAll('p')].map(el => [el.textContent, el.title]), frozen: root.querySelector('aside')?.textContent };
      root.querySelector('button')!.click();
      const clicked = child.label;
      child.label = 'next child'; state.label = 'next parent'; state.show = true; state.items.push({ name: 'three' });
      state.request = Promise.resolve('replacement'); state.config = Object.freeze({ child: { label: 'replaced' } });
      await flush(); const pending = root.querySelector('small')?.textContent;
      resolve('initial request'); await flush();
      const updated = { selected: root.querySelector('i')?.textContent, child: root.querySelector('em')?.textContent,
        rows: [...root.querySelectorAll('p')].map(el => [el.textContent, el.title]), frozen: root.querySelector('aside')?.textContent,
        request: root.querySelector('strong')?.textContent };
      Gyos.cleanup(root, true);
      return { initial, clicked, pending, updated, disposed };
    });
    expect(result).toEqual({
      initial: { selected: 'parent', child: 'child', rows: [['one', 'one'], ['two', 'two']], frozen: 'frozen' },
      clicked: 'child', pending: 'pending',
      updated: { selected: 'parent', child: 'child', rows: [['one', 'one'], ['two', 'two']], frozen: 'replaced', request: 'initial request' },
      disposed: 1,
    });
    expect(errors).toEqual([]);
  });
}
