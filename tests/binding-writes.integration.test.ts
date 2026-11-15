import { afterEach, expect, it, vi } from 'vitest';
import Gyos from '../src/index';

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
afterEach(() => { Gyos.cleanup(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

it('avoids redundant value/attribute writes when keyed row contexts refresh', async () => {
  const items = Gyos.signal([{ id: 1, label: 'one', checked: true }, { id: 2, label: 'two', checked: false }]);
  Gyos.scope('BindingWrites', { items });
  document.body.innerHTML = `<main g-scope="BindingWrites"><div *for="item in items()" g-key="item.id" :data-id="item.id"><input :value="item.label" :aria-label="item.label"><input type="checkbox" :checked="item.checked"></div></main>`;
  Gyos.mountAll();
  const rows = [...document.querySelectorAll('main > div')];
  const input = rows[0].querySelector('input')!;
  const checkbox = rows[0].querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  const value = vi.spyOn(input, 'value', 'set');
  const checked = vi.spyOn(checkbox, 'checked', 'set');
  const attributes = vi.spyOn(input, 'setAttribute');
  items(items.peek.map(item => ({ ...item })));
  await flush();
  expect(value).not.toHaveBeenCalled();
  expect(checked).not.toHaveBeenCalled();
  expect(attributes).not.toHaveBeenCalled();
  expect([...document.querySelectorAll('main > div')]).toEqual(rows);

  // A previous-expression cache would wrongly skip these repairs. Compare the
  // live property and attribute independently, even when expression is unchanged.
  input.value = 'external draft';
  input.setAttribute('value', 'wrong default');
  input.setAttribute('aria-label', 'wrong label');
  checkbox.checked = false;
  items([...items.peek]);
  await flush();
  expect(input.value).toBe('one');
  expect(input.getAttribute('value')).toBe('one');
  expect(input.getAttribute('aria-label')).toBe('one');
  expect(checkbox.checked).toBe(true);
  items([{ id: 1, label: 'changed', checked: false }, items.peek[1]]);
  await flush();
  expect(input.value).toBe('changed');
  expect(input.getAttribute('value')).toBe('changed');
  expect(checkbox.checked).toBe(false);
  expect(checkbox.hasAttribute('checked')).toBe(false);
});

it('restores live select/textarea values and does not skip URL safety checks', async () => {
  const tick = Gyos.signal(0);
  Gyos.scope('BindingRepairs', { tick });
  document.body.innerHTML = `<main g-scope="BindingRepairs"><textarea :value="tick() >= 0 ? 'text' : ''"></textarea><select :value="tick() >= 0 ? 'b' : 'a'"><option value="a">A</option><option value="b">B</option></select><a :href="tick() >= 0 ? 'javascript:alert(1)' : '/'">link</a></main>`;
  Gyos.mountAll();
  const textarea = document.querySelector('textarea')!, select = document.querySelector('select')!, link = document.querySelector('a')!;
  textarea.value = 'draft'; select.value = 'a'; link.setAttribute('href', 'javascript:alert(1)');
  tick(1); await flush();
  expect(textarea.value).toBe('text'); expect(select.value).toBe('b'); expect(link.hasAttribute('href')).toBe(false);
});
