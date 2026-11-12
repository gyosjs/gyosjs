import { afterEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';

let id = 0;
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function mount(template: string, definition: any) {
  const name = `TemplateAudit${++id}`;
  Gyos.scope(name, definition);
  document.body.innerHTML = `<main g-scope="${name}">${template}</main>`;
  Gyos.mountAll();
  const root = document.querySelector('main')!;
  return { root, state: Gyos.mountedScopes().get(root) };
}
afterEach(() => { Gyos.cleanup(); document.body.innerHTML = ''; vi.useRealTimers(); });

describe('template ownership boundaries', () => {
  it.each(['g-html', 'g-text'])('disposes child scopes replaced by %s', async directive => {
    const unmounted = vi.fn(); const observed = vi.fn(); const value = Gyos.signal(0);
    Gyos.scope('ReplacedChild', () => ({ onMount() { this.$effect(() => observed(value())); }, onUnmount: unmounted }));
    const { root } = mount(`<section ${directive}="content"><b g-scope="ReplacedChild">old</b></section>`, { content: 'replacement' });
    expect(root.textContent).toBe('replacement'); expect(unmounted).toHaveBeenCalledTimes(1);
    const before = observed.mock.calls.length;
    value(1); await flush(); expect(observed).toHaveBeenCalledTimes(before);
  });

  it('mounts a child scope on the structural branch root exactly once', async () => {
    const mounted = vi.fn(); const unmounted = vi.fn();
    Gyos.scope('BranchRoot', () => ({ label: 'child', onMount: mounted, onUnmount: unmounted }));
    const { root, state } = mount('<section *if="show" g-scope="BranchRoot"><b>{label}</b></section>', { show: true, label: 'parent' });
    expect(root.querySelector('b')?.textContent).toBe('child');
    expect(mounted).toHaveBeenCalledTimes(1);
    state.show = false; await flush(); expect(unmounted).toHaveBeenCalledTimes(1);
    state.show = true; await flush(); expect(mounted).toHaveBeenCalledTimes(2);
  });

  it('cleans a portal when its owning scope is removed', async () => {
    const count = Gyos.signal(1);
    const { root } = mount('<section *if="true" g-portal="body"><b>{count()}</b></section>', { count });
    const portal = document.querySelector('section')!;
    expect(root.contains(portal)).toBe(false);
    Gyos.cleanup(root, true);
    expect(document.body.contains(portal)).toBe(false);
    count(2); await flush(); expect(portal.textContent).toBe('1');
  });

  it('prevents and stops events synchronously while debouncing only the callback', async () => {
    vi.useFakeTimers();
    const { root, state } = mount('<button @click.prevent.stop.debounce.20="count++">Run</button>', { count: 0 });
    const bubble = vi.fn(); root.addEventListener('click', bubble);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    root.querySelector('button')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); expect(bubble).not.toHaveBeenCalled();
    expect(state.count).toBe(0);
    await vi.advanceTimersByTimeAsync(20); expect(state.count).toBe(1);
  });

  it('keeps refs confined to their nearest declared scope', () => {
    Gyos.scope('RefChild', () => ({}));
    const { state } = mount('<b g-ref="label">parent</b><section g-scope="RefChild"><b g-ref="label">child</b></section>', {});
    expect(state.$refs.label.textContent).toBe('parent');
  });

  it('renders a static scope and its root bindings once', async () => {
    Gyos.scope('StaticRoot', { label: 'first' });
    document.body.innerHTML = '<main g-scope="StaticRoot" g-static :title="label" g-text="label"></main>';
    Gyos.mountAll(); const root = document.querySelector('main')!;
    expect(root.textContent).toBe('first'); expect(root.title).toBe('first');
    const state = Gyos.mountedScopes().get(root); state.label = 'next'; await flush();
    expect(root.textContent).toBe('first'); expect(root.title).toBe('first');
  });

  it('keeps ordinary siblings and adjacent unkeyed lists during rerenders', async () => {
    const { root, state } = mount('<b *for="item in items">{item}</b><footer>Keep</footer><i *for="item in others">{item}</i><aside>End</aside>', { items: [1, 2], others: ['a'] });
    expect(root.querySelector('footer')?.textContent).toBe('Keep');
    expect(root.querySelector('aside')?.textContent).toBe('End');
    state.items = [3]; await flush();
    expect(root.querySelector('footer')?.textContent).toBe('Keep');
    expect(root.querySelector('i')?.textContent).toBe('a');
    expect(root.querySelectorAll('b')).toHaveLength(1);
    state.others = []; await flush();
    expect(root.querySelector('aside')?.textContent).toBe('End');
  });

  it.each(['', ' g-key="item"'])('stops structural effects when their root is cleaned up (%s)', async key => {
    const { root, state } = mount(`<section *if="show"><b *for="item in items"${key}>{item}</b></section>`, { show: true, items: [1] });
    await flush();
    Gyos.cleanup(root);
    const snapshot = root.innerHTML;
    state.items = [2, 3]; state.show = false; await flush();
    expect(root.innerHTML).toBe(snapshot);
  });

  it('resolves a second await request without a pending template', async () => {
    const { root, state } = mount('<section *await="request"><b *then="result">{result}</b></section>', { request: Promise.resolve('first') });
    await flush(); expect(root.querySelector('b')?.textContent).toBe('first');
    state.request = Promise.resolve('second'); await flush();
    expect(root.querySelector('b')?.textContent).toBe('second');
  });

  it('does not render a pending await result after cleanup', async () => {
    let resolve!: (value: string) => void;
    const { root } = mount('<section *await="request"><b *then="result">{result}</b></section>', { request: new Promise<string>(done => { resolve = done; }) });
    Gyos.cleanup(root); const snapshot = root.innerHTML;
    resolve('late'); await flush();
    expect(root.innerHTML).toBe(snapshot);
  });

  it('keeps parent fields live in await alias scopes', async () => {
    const { root, state } = mount('<section *await="request"><div *then="result"><b>{label}: {result}</b><button @click="label = \'clicked\'">Update</button></div></section>', { label: 'before', request: Promise.resolve('ok') });
    await flush(); state.label = 'after'; await flush();
    expect(root.querySelector('b')?.textContent).toBe('after: ok');
    root.querySelector('button')!.click(); await flush();
    expect(state.label).toBe('clicked');
  });

  it('uses switch default only if no case matches, regardless of its position', async () => {
    const { root, state } = mount('<section *switch="status"><b *default>fallback</b><b *case="1">one</b></section>', { status: 1 });
    expect(root.querySelector('b')?.textContent).toBe('one');
    state.status = 2; await flush(); expect(root.querySelector('b')?.textContent).toBe('fallback');
  });
});
