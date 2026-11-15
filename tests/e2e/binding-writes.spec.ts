import { expect, test } from '@playwright/test';

for (const build of ['standard', 'csp']) {
  test(`${build}: keyed binding refresh avoids no-op writes and repairs live controls`, async ({ page }) => {
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ path: `dist/gyos.${build === 'csp' ? 'csp.' : ''}auto.min.js` });
    await page.evaluate(() => {
      const Gyos = (window as any).Gyos;
      const rows = Gyos.signal([{ id: 1, text: 'first', checked: true }, { id: 2, text: 'second', checked: false }]);
      (window as any).__rows = rows;
      Gyos.scope('WriteProbe', { rows });
      document.body.innerHTML = `<main g-scope="WriteProbe"><div *for="row in rows()" g-key="row.id"><input :value="row.text" :aria-label="row.text"><input type="checkbox" :checked="row.checked"></div></main>`;
      Gyos.mountAll();
      const input = document.querySelector('input')!;
      input.focus(); input.setSelectionRange(1, 3);
      const probe = { valueWrites: 0, checkedWrites: 0, records: 0 };
      (window as any).__probe = probe;
      for (const property of ['value', 'checked']) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, property)!;
        Object.defineProperty(HTMLInputElement.prototype, property, { ...descriptor, set(value) {
          if (property === 'value') probe.valueWrites++; else probe.checkedWrites++;
          descriptor.set!.call(this, value);
        } });
      }
      new MutationObserver(records => { probe.records += records.filter(r => r.type === 'attributes').length; })
        .observe(document.querySelector('main')!, { subtree: true, attributes: true });
      rows(rows.peek.map((row: any) => ({ ...row })));
    });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    expect(await page.evaluate(() => (window as any).__probe)).toEqual({ valueWrites: 0, checkedWrites: 0, records: 0 });
    expect(await page.locator('input').first().evaluate((input: HTMLInputElement) =>
      [document.activeElement === input, input.selectionStart, input.selectionEnd])).toEqual([true, 1, 3]);
    await page.evaluate(() => {
      const input = document.querySelector('input')!;
      input.value = 'draft'; input.setAttribute('value', 'bad default'); input.setAttribute('aria-label', 'bad label');
      document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked = false;
      const rows = (window as any).__rows; rows([...rows.peek]);
    });
    await expect(page.locator('input').first()).toHaveValue('first');
    await expect(page.locator('input').first()).toHaveAttribute('value', 'first');
    await expect(page.locator('input').first()).toHaveAttribute('aria-label', 'first');
    await expect(page.locator('input[type="checkbox"]').first()).toBeChecked();
    await page.evaluate(() => {
      const rows = (window as any).__rows;
      rows([{ ...rows.peek[0], text: 'updated', checked: false }, rows.peek[1]]);
    });
    await expect(page.locator('input').first()).toHaveValue('updated');
    await expect(page.locator('input[type="checkbox"]').first()).not.toBeChecked();
  });
}
