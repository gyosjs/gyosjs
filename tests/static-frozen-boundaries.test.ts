import { afterEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';
import { reactive } from '../src/core/reactive';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
let serial = 0;
function mount(template: string, definition: any, staticRoot = false) {
  const name = `StaticFrozen${++serial}`;
  Gyos.scope(name, definition);
  document.body.innerHTML = `<main g-scope="${name}" ${staticRoot ? 'g-static' : ''}>${template}</main>`;
  Gyos.mountAll();
  const root = document.querySelector('main')!;
  return { root, state: Gyos.mountedScopes().get(root) };
}
afterEach(() => { Gyos.cleanup(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('proxy invariants for locked data', () => {
  it('reads frozen object/array/function fields without changing their identity', () => {
    const child = { count: 1 }, fn = () => 1;
    const frozen = Object.freeze({ child, fn, items: Object.freeze([child]) });
    const state = reactive({ frozen });
    expect(state.frozen.child).toBe(child);
    expect(state.frozen.fn).toBe(fn);
    expect(state.frozen.items).toBe(frozen.items);
    expect(state.frozen.items[0]).toBe(child);
  });

  it('respects locked properties on otherwise mutable objects and tracks replacement of their container', async () => {
    const child = { count: 1 };
    const frozen = Object.defineProperty({}, 'child', { value: child, enumerable: true }) as { child: typeof child };
    const state = reactive({ frozen }); const seen: number[] = [];
    const stop = Gyos.effect(() => { seen.push(state.frozen.child.count); });
    try {
      expect(seen).toEqual([1]);
      state.frozen = Object.freeze({ child: { count: 2 } }); await flush();
      expect(seen).toEqual([1, 2]);
      expect(Reflect.set(state.frozen, 'child', { count: 3 })).toBe(false);
      await flush(); expect(seen).toEqual([1, 2]);
    } finally { stop(); }
  });

  it.each([Object.seal, Object.preventExtensions, Object.freeze])('enumerates required reserved keys on a restricted target (%s)', restrict => {
    const raw = restrict({ $label: 'metadata', onMount: () => {}, value: 1 });
    const state = reactive(raw);
    expect(Reflect.ownKeys(state)).toEqual(Reflect.ownKeys(raw));
    expect(Object.keys(state)).toEqual(Object.keys(raw));
    expect(Object.getOwnPropertyDescriptor(state, '$label')).toEqual(Object.getOwnPropertyDescriptor(raw, '$label'));
  });

  it('keeps configurable reserved fields hidden until the target requires their visibility', () => {
    const raw = { $label: 'metadata', value: 1 }; const state = reactive(raw);
    expect(Object.keys(state)).toEqual(['value']);
    Object.preventExtensions(raw);
    expect(Object.keys(state)).toEqual(['$label', 'value']);
  });

  it('returns undefined for a locked getterless accessor even after its data field was cached', () => {
    const raw = { value: 1 }; const state = reactive(raw);
    const stop = Gyos.effect(() => { state.value; });
    stop();
    Object.defineProperty(raw, 'value', { get: undefined, set() {}, configurable: false });
    expect(state.value).toBeUndefined();
  });

  it('allows sealed writable nested fields to keep updating', async () => {
    const state = reactive({ item: Object.seal({ count: 1 }) });
    const seen: number[] = [];
    const stop = Gyos.effect(() => { seen.push(state.item.count); });
    state.item.count = 2; await flush(); expect(seen).toEqual([1, 2]);
    stop();
  });
});

describe('static branch initial rendering', () => {
  it.each([false, true])('renders nested condition/list/switch once, including bindings (static root=%s)', async staticRoot => {
    const markup = `<b *if="show" :title="label">{label}</b><i *else>hidden</i>
      <p *for="item in items" :title="item.name">{item.name}</p>
      <div *switch="choice"><em *case="'a'">{label}</em><em *default>other</em></div>`;
    const { root, state } = mount(staticRoot ? markup : `<section g-static>${markup}</section><aside>{label}</aside>`,
      () => ({ show: true, label: 'initial', items: [{ name: 'one' }, { name: 'two' }], choice: 'a' }), staticRoot);
    expect(root.querySelector('b')?.textContent).toBe('initial');
    expect([...root.querySelectorAll('p')].map(el => [el.textContent, el.title])).toEqual([['one', 'one'], ['two', 'two']]);
    expect(root.querySelector('em')?.textContent).toBe('initial');
    state.show = false; state.label = 'next'; state.items[0].name = 'changed'; state.items.push({ name: 'three' }); state.choice = 'b';
    await flush();
    expect(root.querySelector('b')?.textContent).toBe('initial');
    expect(root.querySelector('b')?.title).toBe('initial');
    expect([...root.querySelectorAll('p')].map(el => el.textContent)).toEqual(['one', 'two']);
    expect(root.querySelector('em')?.textContent).toBe('initial');
    if (!staticRoot) expect(root.querySelector('aside')?.textContent).toBe('next');
  });

  it('preserves nested scope ownership while freezing its template and skipping interaction bindings', async () => {
    const mounted = vi.fn(), unmounted = vi.fn();
    Gyos.scope('StaticChild', () => ({ label: 'child', count: 0, onMount: mounted, onUnmount: unmounted }));
    const { root, state } = mount(`<section g-static><div g-scope="StaticChild"><b g-text="label" :title="label"></b>
      <button @click="count++">click</button><input g-model="label"></div><span>{label}</span><i g-ignore>{label}</i></section>`,
      () => ({ label: 'parent' }));
    const child = root.querySelector('[g-scope]') as HTMLElement;
    const childState = Gyos.mountedScopes().get(child);
    expect(root.querySelector('b')?.textContent).toBe('child');
    expect(root.querySelector('b')?.title).toBe('child');
    expect(root.querySelector('span')?.textContent).toBe('parent');
    expect(root.querySelector('i')?.textContent).toBe('{label}');
    child.querySelector('button')!.click();
    const input = child.querySelector('input')!; input.value = 'typed'; input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(childState.count).toBe(0); expect(childState.label).toBe('child');
    childState.label = 'changed'; state.label = 'changed'; await flush();
    expect(root.querySelector('b')?.textContent).toBe('child'); expect(root.querySelector('span')?.textContent).toBe('parent');
    expect(mounted).toHaveBeenCalledTimes(1);
    Gyos.cleanup(root); expect(unmounted).toHaveBeenCalledTimes(1);
  });

  it('keeps the static marker effective when g-static shares a structural root', async () => {
    const { root, state } = mount('<section *if="show" g-static><b>{label}</b></section>', () => ({ show: true, label: 'first' }));
    state.show = false; state.label = 'next'; await flush();
    expect(root.querySelector('b')?.textContent).toBe('first');
  });

  it('freezes the chosen else branch when the initial if owns the static boundary', async () => {
    const { root, state } = mount('<b *if="show" g-static>yes</b><i *else :title="label">{label}</i>', () => ({ show: false, label: 'first' }));
    expect(root.querySelector('i')?.textContent).toBe('first');
    state.label = 'next'; state.show = true; await flush();
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('i')?.textContent).toBe('first');
    expect(root.querySelector('i')?.title).toBe('first');
  });

  it('renders every static loop root once and allows an outer reactive condition to remove/recreate it', async () => {
    const { root, state } = mount('<section *if="show"><p *for="item in items" g-static :title="item">{item}</p></section>',
      () => ({ show: true, items: ['a', 'b'] }));
    expect([...root.querySelectorAll('p')].map(el => [el.textContent, el.title])).toEqual([['a', 'a'], ['b', 'b']]);
    state.items = ['c']; await flush(); expect(root.querySelectorAll('p')).toHaveLength(2);
    state.show = false; await flush(); expect(root.querySelector('section')).toBeNull();
    state.show = true; await flush(); expect(root.querySelector('p')?.textContent).toBe('c');
  });

  it('disposes nested scopes replaced by a static content binding', () => {
    const unmounted = vi.fn(); Gyos.scope('StaticReplaced', () => ({ onUnmount: unmounted }));
    const { root } = mount('<section g-static g-text="label"><div g-scope="StaticReplaced"></div></section>', () => ({ label: 'replacement' }));
    expect(root.textContent).toBe('replacement'); expect(unmounted).toHaveBeenCalledTimes(1);
    expect([...Gyos.mountedScopes().keys()]).toEqual([root]);
  });

  it('settles only the initial await promise and cancels it when cleaned up', async () => {
    let resolve!: (value: string) => void;
    const { root, state } = mount('<section g-static><article *await="request"><b *pending>pending</b><i *then="value">{value}</i></article></section>',
      () => ({ request: new Promise<string>(done => { resolve = done; }) }));
    expect(root.querySelector('b')?.textContent).toBe('pending');
    state.request = Promise.resolve('replacement'); await flush();
    expect(root.querySelector('b')?.textContent).toBe('pending');
    resolve('initial'); await flush(); expect(root.querySelector('i')?.textContent).toBe('initial');
    Gyos.cleanup(root);
    let late!: (value: string) => void;
    const second = mount('<section g-static><article *await="request"><b *pending>pending</b><i *then="value">{value}</i></article></section>',
      () => ({ request: new Promise<string>(done => { late = done; }) }));
    Gyos.cleanup(second.root); const html = second.root.innerHTML;
    late('late'); await flush(); expect(second.root.innerHTML).toBe(html);
  });
});
