import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';
import { __routerTest } from '../src/core/router/router';

const templateGuide = readFileSync('docs/en/template-syntax.md', 'utf8');
const bestPractices = readFileSync('docs/en/best-practices.md', 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
afterEach(() => {
  __routerTest.resetRouterState(); Gyos.cleanup(); document.body.innerHTML = '';
  document.body.removeAttribute('g-boost'); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('executable documentation examples', () => {
  it('renders the dynamic class name described by the binding example', async () => {
    // Select the binding section; earlier sections may have their own examples.
    const bindingSection = templateGuide.split('### Data Binding Syntax')[1]?.split(/\r?\n### /)[0];
    const example = bindingSection?.match(/```html\s*([\s\S]*?)```/)?.[1];
    expect(example, 'Data Binding Syntax must contain its executable HTML example').toBeTruthy();
    document.body.innerHTML = example!;
    Gyos.mountAll();
    const root = document.querySelector('div')!;
    const state = Gyos.mountedScopes().get(root);
    expect(root.querySelector('img')!.classList.contains('highlight')).toBe(true);
    state.otherClass = 'selected'; await flush();
    expect(root.querySelector('img')!.classList.contains('highlight')).toBe(false);
    expect(root.querySelector('img')!.classList.contains('selected')).toBe(true);
  });

  it.each([...bestPractices.matchAll(/<button\b[^>]*g-router-params[^>]*>/g)].map(match => [match[0]]))(
    'requests page two on the first click in the load-more example (%#)', async tag => {
      document.body.setAttribute('g-boost', '');
      document.body.innerHTML = `<main g-scope="{page: 1}">${tag}More</button><div id="results" g-outlet></div></main>`;
      const button = document.querySelector('button')!;
      // Layout-specific target names are irrelevant to the documented params/event order.
      button.setAttribute('g-target', '#results');
      button.setAttribute('g-noscroll', '');
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true, status: 200, url: new URL('/items?page=2', location.href).href,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<div id="results" g-outlet>Next page</div>'
      })));
      Gyos.mountAll(); Gyos.startRouter({ showProgress: false });
      const finished = new Promise<void>(resolve => Gyos.onNavigationEnd(() => resolve()));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await finished;
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
      expect(new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams.get('page')).toBe('2');
    }
  );
});
