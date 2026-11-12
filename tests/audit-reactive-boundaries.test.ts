import { afterEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';
import { makeReactive } from '../src/core/reactive';

const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
afterEach(() => {
  // Keep a failing cleanup regression from contaminating later cases.
  for (const scope of Gyos.mountedScopes().values()) scope.onUnmount = undefined;
  Gyos.cleanup(); Gyos.clearAllEvents(); document.body.innerHTML = '';
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('reactive boundary audit', () => {
  it('allows an onMount hook to clean its own scope without resurrecting it', async () => {
    const value = Gyos.signal(0); const observed = vi.fn(); const unmounted = vi.fn();
    Gyos.scope('SelfCleanupAudit', () => ({
      onMount() {
        this.$effect(() => observed(value()));
        Gyos.cleanup(document.querySelector('main')!, true);
      }, onUnmount: unmounted
    }));
    document.body.innerHTML = '<main g-scope="SelfCleanupAudit"></main>';
    Gyos.mountAll();
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(Gyos.mountedScopes().size).toBe(0);
    value(1); await flush(); expect(observed).toHaveBeenCalledTimes(1);
  });

  it('disposes cleanup returned by an effect that stops itself while running', async () => {
    const value = Gyos.signal(0); const cleanup = vi.fn(); const runs = vi.fn();
    const stop = Gyos.effect(() => {
      const current = value(); runs();
      if (current === 1) stop();
      value(); // Reads after stop must not leave a live dependency behind.
      return cleanup;
    });
    value(1); await flush();
    expect(cleanup).toHaveBeenCalledTimes(2);
    value(2); await flush(); expect(runs).toHaveBeenCalledTimes(2);
    stop(); expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it('does not rerun an effect if its previous cleanup stops it', async () => {
    const value = Gyos.signal(0); const runs = vi.fn();
    const stop = Gyos.effect(() => { value(); runs(); return () => stop(); });
    value(1); await flush();
    expect(runs).toHaveBeenCalledTimes(1);
    stop();
  });

  it('contains synchronous onMount errors and leaves the scope cleanable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const unmounted = vi.fn();
    Gyos.scope('ThrowMountAudit', () => ({ onMount() { throw new Error('expected'); }, onUnmount: unmounted }));
    document.body.innerHTML = '<main g-scope="ThrowMountAudit"></main>';
    expect(() => Gyos.mountAll()).not.toThrow();
    expect(Gyos.mountedScopes().has(document.querySelector('main')!)).toBe(true);
    Gyos.cleanup(); expect(unmounted).toHaveBeenCalledTimes(1); await flush();
  });

  it('accepts null-prototype data and a field named hasOwnProperty', async () => {
    const data = Object.assign(Object.create(null), { count: 1, hasOwnProperty: 'data' });
    const state = makeReactive(data);
    const seen: number[] = [];
    const stop = Gyos.effect(() => { seen.push(state.count); });
    try {
      state.count = 2; await flush(); expect(seen).toEqual([1, 2]);
      expect(Gyos.markRaw(Object.create(null))).toBeDefined();
      expect(Gyos.shallow(Object.create(null))).toBeDefined();
    } finally { stop(); }
  });

  it('detects changed Date values and changed undefined keys in deep watches', async () => {
    const changed = vi.fn();
    Gyos.scope('DeepValuesAudit', () => ({ value: { when: new Date(0), a: undefined }, onMount() {
      this.$watch('value', changed, { deep: true });
    }}));
    document.body.innerHTML = '<main g-scope="DeepValuesAudit"></main>'; Gyos.mountAll();
    const state = Gyos.mountedScopes().get(document.querySelector('main')!);
    state.value.when = new Date(1000); await flush(); expect(changed).toHaveBeenCalledTimes(1);
    state.value = { when: new Date(1000), b: undefined }; await flush(); expect(changed).toHaveBeenCalledTimes(2);
  });

  it('updates length consumers when an array grows through an index and push', async () => {
    const state = makeReactive({ items: ['a'] });
    const lengths: number[] = [];
    const stop = Gyos.effect(() => { lengths.push(state.items.length); });
    try {
      state.items.push('b'); await flush();
      expect(state.items.length).toBe(2);
      expect(lengths).toEqual([1, 2]);
      state.items[4] = 'e'; await flush();
      expect(state.items.length).toBe(5);
      expect(lengths).toEqual([1, 2, 5]);
    } finally { stop(); }
  });

  it('invalidates removed array indices when length is shortened', async () => {
    const state = makeReactive({ items: ['a', 'b', 'c'] });
    const values: Array<string | undefined> = [];
    const stop = Gyos.effect(() => { values.push(state.items[2]); });
    try {
      state.items.length = 1; await flush();
      expect(state.items[2]).toBeUndefined();
      expect(values).toEqual(['c', undefined]);
    } finally { stop(); }
  });

  it('tracks replacing a store reference exposed through a scope field', async () => {
    const first = Gyos.store('audit-first', { count: 1 });
    const second = Gyos.store('audit-second', { count: 9 });
    const state = makeReactive({ selected: first });
    const values: number[] = [];
    const stop = Gyos.effect(() => { values.push(state.selected.count); });
    try {
      state.selected = second; await flush();
      expect(values).toEqual([1, 9]);
      first.count = 2; await flush();
      expect(values).toEqual([1, 9]);
      second.count = 10; await flush();
      expect(values).toEqual([1, 9, 10]);
    } finally { stop(); Gyos.removeStore('audit-first'); Gyos.removeStore('audit-second'); }
  });

  it('preserves this in a debounced watcher and cancels it on stop/unmount', async () => {
    vi.useFakeTimers();
    const seen = vi.fn();
    Gyos.scope('AuditDebounce', () => ({ count: 0, onMount() {
      this.stopWatch = this.$watch('count', function (this: any, next: number) { seen(this, next); }, { debounce: 20 });
    }}));
    document.body.innerHTML = '<div g-scope="AuditDebounce"></div>';
    Gyos.mountAll(); await flush();
    const el = document.querySelector('div')!;
    const state = Gyos.mountedScopes().get(el);
    state.count = 1; await flush(); await vi.advanceTimersByTimeAsync(20);
    expect(seen).toHaveBeenLastCalledWith(state, 1);
    state.count = 2; await flush(); state.stopWatch(); await vi.advanceTimersByTimeAsync(20);
    expect(seen).toHaveBeenCalledTimes(1);
    state.$watch('count', seen, { immediate: true, debounce: 20 });
    Gyos.cleanup(el); await vi.advanceTimersByTimeAsync(20);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('removes once listeners before a reentrant emit or throwing callback', () => {
    const seen = vi.fn(() => { if (seen.mock.calls.length === 1) Gyos.emit('recursive'); });
    Gyos.once('recursive', seen); Gyos.emit('recursive');
    expect(seen).toHaveBeenCalledTimes(1);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const throwing = vi.fn(() => { throw new Error('expected'); });
    Gyos.once('throwing', throwing); Gyos.emit('throwing'); Gyos.emit('throwing');
    expect(throwing).toHaveBeenCalledTimes(1);
  });

  it('always releases scope and template effects when onUnmount throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const value = Gyos.signal(0);
    Gyos.scope('ThrowUnmount', () => ({ value, onUnmount() { throw new Error('expected'); } }));
    document.body.innerHTML = '<div g-scope="ThrowUnmount"><span>{value()}</span></div>';
    Gyos.mountAll(); await flush();
    const el = document.querySelector('div')!;
    expect(() => Gyos.cleanup(el)).not.toThrow();
    expect(Gyos.mountedScopes().has(el)).toBe(false);
    value(1); await flush();
    expect(el.textContent).toBe('0');
  });

  it('ignores stale async responses and keeps loading tied to the latest execution', async () => {
    const pending: Array<(value: string) => void> = [];
    const state = Gyos.useAsync(() => new Promise<string>(resolve => pending.push(resolve)), false);
    const first = state.execute(); const second = state.execute();
    pending[0]('stale'); await first;
    expect(state.loading()).toBe(true);
    expect(state.data()).toBeNull();
    pending[1]('current'); await second;
    expect(state.data()).toBe('current');
    expect(state.loading()).toBe(false);
  });

  it('ignores stale fetch errors and pending results after unmount, then supports remount', async () => {
    const pending: Array<{ resolve: (value: Response) => void; reject: (error: Error) => void }> = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve, reject) => pending.push({ resolve, reject })));
    vi.stubGlobal('fetch', fetchMock);
    const state = Gyos.useFetch('/audit');
    const first = state.onMount(); const second = state.refetch();
    pending[1].resolve({ ok: true, json: async () => 'current' } as Response); await second;
    pending[0].reject(new Error('stale')); await first;
    expect(state.data()).toBe('current'); expect(state.error()).toBeNull();
    const third = state.refetch(); state.onUnmount();
    pending[2].resolve({ ok: true, json: async () => 'unmounted' } as Response); await third;
    expect(state.data()).toBeNull(); expect(state.loading()).toBe(false);
    await state.refetch(); expect(fetchMock).toHaveBeenCalledTimes(3);
    const remount = state.onMount();
    pending[3].resolve({ ok: true, json: async () => 'remounted' } as Response); await remount;
    expect(state.data()).toBe('remounted');
  });
});
