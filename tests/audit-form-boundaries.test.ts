import { afterEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';

let id = 0;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function mount(fields: string, definition = {}) {
  const name = `FormAudit${++id}`;
  Gyos.scope(name, definition);
  document.body.innerHTML = `<main g-scope="${name}"><form g-form="form">${fields}</form></main>`;
  Gyos.mountAll();
  return Gyos.mountedScopes().get(document.querySelector('main')!);
}
afterEach(() => { Gyos.cleanup(); document.body.innerHTML = ''; vi.useRealTimers(); });

describe('form lifecycle audit', () => {
  it('revalidates edits made while submission validation is awaiting a result', async () => {
    vi.useFakeTimers();
    const pending: Array<(value: true | string) => void> = [];
    Gyos.validator('auditEdited', () => new Promise<true | string>(resolve => pending.push(resolve)));
    const state = mount('<input name="email" value="old" g-validate="auditEdited">');
    let finished = false;
    const validation = state.form.validateAll().then((valid: boolean) => { finished = true; return valid; });
    const input = document.querySelector('input')!;
    input.value = 'new'; input.dispatchEvent(new Event('input'));
    pending[0](true); await flush();
    expect(finished).toBe(false);
    expect(pending).toHaveLength(2);
    pending[1]('new value is invalid'); expect(await validation).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(pending).toHaveLength(2);
  });

  it('ignores stale async errors and waits for the newest validation', async () => {
    const pending: Array<(value: true | string) => void> = [];
    Gyos.validator('auditAsync', () => new Promise<true | string>(resolve => pending.push(resolve)));
    const state = mount('<input name="email" g-validate="auditAsync">');
    const first = state.form.validateAll();
    const second = state.form.validateAll();
    pending[1](true); await second;
    pending[0]('old error'); await first;
    expect(state.form.errors().email).toBeNull();
    const third = state.form.validateAll(); const fourth = state.form.validateAll();
    let thirdFinished = false; void third.then(() => { thirdFinished = true; });
    pending[2](true); await flush(); expect(thirdFinished).toBe(false);
    pending[3]('current error'); expect(await fourth).toBe(false); expect(await third).toBe(false);
  });

  it('unregisters removed controls and ignores their pending responses', async () => {
    let resolve!: (value: string) => void;
    Gyos.validator('auditDisposed', () => new Promise<string>(done => { resolve = done; }));
    const state = mount('<input name="email" g-validate="auditDisposed">');
    const pending = state.form.validateAll();
    Gyos.cleanup(document.querySelector('input')!, true);
    resolve('late error'); await pending;
    expect(state.form.errors()).not.toHaveProperty('email');
    expect(await state.form.validateAll()).toBe(true);
  });

  it('registers and unregisters fields rendered by structural directives', async () => {
    const state = mount('<input *if="show" name="email" g-validate="required">', { show: true });
    expect(await state.form.validateAll()).toBe(false);
    state.show = false; await flush();
    expect(await state.form.validateAll()).toBe(true);
    state.show = true; await flush();
    expect(await state.form.validateAll()).toBe(false);
  });

  it('validates numeric zero, complete integers, and actual calendar dates', async () => {
    expect(await Gyos.validate(0, 'min(1)')).not.toBeNull();
    expect(await Gyos.validate('12abc', 'integer')).not.toBeNull();
    expect(await Gyos.validate('2025-02-30', 'date')).not.toBeNull();
    expect(await Gyos.validate('2024-02-29', 'date')).toBeNull();
  });
});
