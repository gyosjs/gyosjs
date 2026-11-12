import { afterEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';
import { clone, deepEqual } from '../src/utils/helpers';

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
let serial = 0;
function mount(definition: any, template = '') {
  const root = document.createElement('main');
  const name = `Lifetime${++serial}`;
  root.setAttribute('g-scope', name);
  root.innerHTML = template;
  document.body.append(root);
  Gyos.scope(name, definition);
  Gyos.mount(root);
  return { root, state: Gyos.mountedScopes().get(root) };
}
afterEach(() => { Gyos.cleanup(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('deep watch snapshots', () => {
  it('preserves sparse array lengths and own data keys without prototype mutation', () => {
    const original = JSON.parse('{"__proto__":{"label":"data"}}');
    original.items = new Array(3);
    const snapshot = clone(original);
    expect(Object.getPrototypeOf(snapshot)).toBe(Object.prototype);
    expect(Object.hasOwn(snapshot, '__proto__')).toBe(true);
    expect(snapshot.__proto__.label).toBe('data');
    expect(snapshot.items.length).toBe(3);
    expect(0 in snapshot.items).toBe(false);
    expect(deepEqual(snapshot, clone(original))).toBe(true);
    original.items.length = 2;
    expect(deepEqual(snapshot, clone(original))).toBe(false);
  });

  it('detects changed cyclic topology and collection iteration order', () => {
    const first: any = { label: 'same' }; first.self = first;
    const second: any = { label: 'same' }; second.self = { label: 'same', self: second };
    expect(deepEqual(clone(first), clone(first))).toBe(true);
    expect(deepEqual(clone(first), clone(second))).toBe(false);
    expect(deepEqual(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(false);
    expect(deepEqual(new Map([['a', 1], ['b', 2]]), new Map([['b', 2], ['a', 1]]))).toBe(false);
  });
  it('handles cycles and shared references without losing nested changes', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const changed = vi.fn();
    const value: any = { count: 0, child: { label: 'first' } };
    value.self = value;
    value.other = value.child;
    const { state } = mount(() => ({ value, onMount() { this.$watch('value', changed, { deep: true, immediate: true }); } }));
    expect(errors).not.toHaveBeenCalled();
    const initial = changed.mock.calls[0][0];
    expect(initial.self).toBe(initial);
    expect(initial.other).toBe(initial.child);
    state.value.child.label = 'next'; await flush();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(changed.mock.calls[1][1].child.label).toBe('first');
    state.value.count = 1; await flush();
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('compares Map/Set replacements and preserves snapshots including collection cycles', async () => {
    const changed = vi.fn();
    const { state } = mount(() => ({ value: { map: new Map([['a', { count: 1 }]]), set: new Set(['a']) },
      onMount() { this.$watch('value', changed, { deep: true }); } }));
    state.value.map = new Map([['a', { count: 2 }]]); await flush();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls[0][1].map.get('a')).toEqual({ count: 1 });
    state.value.map = new Map([['a', { count: 2 }]]); await flush();
    expect(changed).toHaveBeenCalledTimes(1);
    state.value.set = new Set(['b']); await flush();
    expect(changed).toHaveBeenCalledTimes(2);
    const map = new Map(); map.set('self', map);
    const set = new Set(); set.add(set);
    state.value = { map, set }; await flush();
    const next = changed.mock.calls[2][0];
    expect(next.map.get('self')).toBe(next.map);
    expect([...next.set][0]).toBe(next.set);
  });

  it('keeps native collection mutation non-reactive until the collection is replaced', async () => {
    const changed = vi.fn();
    const { state } = mount(() => ({ items: new Set(['a']), onMount() { this.$watch('items', changed, { deep: true }); } }));
    state.items.add('b'); await flush(); expect(changed).not.toHaveBeenCalled();
    state.items = new Set(state.items); await flush();
    expect(changed).toHaveBeenCalledTimes(1);
    expect([...changed.mock.calls[0][0]]).toEqual(['a', 'b']);
    expect([...changed.mock.calls[0][1]]).toEqual(['a']);
  });
});

describe('computed observation lifetimes', () => {
  it('keeps other consumers live and refreshes reads and subscriptions after a dormant interval', async () => {
    const source = Gyos.signal(1), useLeft = Gyos.signal(true), right = Gyos.signal(10);
    const calculate = vi.fn(() => useLeft() ? source() : right());
    const selected = Gyos.computed(calculate);
    const doubled = Gyos.computed(() => selected() * 2);
    const first = vi.fn(() => doubled()), second = vi.fn(() => doubled());
    const stopFirst = Gyos.effect(first), stopSecond = Gyos.effect(second);
    stopFirst(); source(2); await flush();
    expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveLastReturnedWith(4);
    stopSecond(); useLeft(false); right(11); await flush();
    expect(calculate).toHaveBeenCalledTimes(2);
    expect(doubled.peek).toBe(22);
    const resumed = vi.fn(); const stop = doubled.subscribe(resumed);
    source(3); await flush(); expect(resumed).not.toHaveBeenCalled();
    right(12); await flush(); expect(resumed).toHaveBeenCalledTimes(1);
    stop(); right(13); expect(doubled()).toBe(26);
  });
});

describe('cleanup during initial execution', () => {
  it('allows a fresh mount on the same element without reviving the old context', async () => {
    const oldRan = vi.fn(), freshRan = vi.fn();
    const { root, state: old } = mount(() => ({ count: 0 }));
    Gyos.cleanup(root);
    Gyos.mount(root);
    const fresh = Gyos.mountedScopes().get(root);
    expect(fresh).not.toBe(old);
    old.$effect(oldRan);
    fresh.$watch('count', freshRan);
    fresh.count = 1; await flush();
    expect(oldRan).not.toHaveBeenCalled();
    expect(freshRan).toHaveBeenCalledWith(1, 0);
  });

  it('does not create a portal after its initial template cleans up the owner', () => {
    const root = document.createElement('main'); root.setAttribute('g-scope', 'CleanupPortal');
    root.setAttribute('g-portal', 'body'); root.innerHTML = '<b g-text="stop()"></b>';
    document.body.append(root);
    Gyos.scope('CleanupPortal', () => ({ stop() { Gyos.cleanup(root, true); return 'done'; } }));
    Gyos.mount(root);
    expect(root.isConnected).toBe(false);
    expect((root as any).__gyos_portal__).toBeUndefined();
    expect(Gyos.mountedScopes().has(root)).toBe(false);
  });

  it.each([false, true])('does not resurrect a scope disposed during template evaluation (remove=%s)', async remove => {
    const value = Gyos.signal(0), evaluated = vi.fn(), mounted = vi.fn(), unmounted = vi.fn();
    let root!: HTMLElement;
    Gyos.scope('InitialCleanup', () => ({
      stop() { evaluated(value()); Gyos.cleanup(root, remove); return 'stopped'; },
      later() { evaluated('later'); return value(); }, onMount: mounted, onUnmount: unmounted,
    }));
    root = document.createElement('main'); root.setAttribute('g-scope', 'InitialCleanup');
    root.innerHTML = '<b g-text="stop()"></b><i g-text="later()"></i>';
    document.body.append(root); Gyos.mount(root);
    expect(Gyos.mountedScopes().has(root)).toBe(false);
    expect(mounted).not.toHaveBeenCalled();
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(evaluated.mock.calls).toEqual([[0]]);
    value(1); await flush(); expect(evaluated.mock.calls).toEqual([[0]]);
  });

  it.each(['effect', 'watch'])('disposes an observer whose first %s callback unmounts its scope', async kind => {
    const value = Gyos.signal(0), ran = vi.fn(), disposed = vi.fn();
    const { root, state } = mount(() => ({ count: 0 }));
    if (kind === 'effect') state.$effect(() => { ran(value()); Gyos.cleanup(root); value(); return disposed; });
    else state.$watch('count', () => { ran(value()); Gyos.cleanup(root); }, { immediate: true });
    expect(Gyos.mountedScopes().has(root)).toBe(false);
    if (kind === 'effect') expect(disposed).toHaveBeenCalledTimes(1);
    state.count = 1; value(1); await flush(); expect(ran).toHaveBeenCalledTimes(1);
    state.$effect(() => ran('late'));
    state.$watch('count', () => ran('late'), { immediate: true });
    expect(ran).toHaveBeenCalledTimes(1);
  });
});
