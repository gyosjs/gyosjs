import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const section = readFileSync('docs/en/template-syntax.md', 'utf8').replace(/\r\n/g, '\n')
  .split('### HTML formatters and quoted strings')[1].split('### Data Binding Syntax')[0];
const html = [...section.matchAll(/```html\n([\s\S]*?)\n```/g)].map(match => match[1]);
const js = section.match(/```js\n([\s\S]*?)\n```/)![1];
const sentence = 'Your changes have been saved successfully and you can continue editing this document whenever you are ready.';

for (const build of ['standard', 'csp']) {
  test(`${build}: documented formatter damage and safe authoring choices`, async ({ page }) => {
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ path: `dist/gyos.${build === 'csp' ? 'csp.' : ''}auto.min.js` });
    // Four independent scopes: original, invalid wrapped string, attribute,
    // and ignore comment. An object-scope getter is exercised separately.
    await page.evaluate(html => {
      document.body.innerHTML = [0, 1, 3, 4].map(index =>
        `<section data-case="${index}" g-scope="{ ready: true }">${html[index]}</section>`).join('') + html[2];
    }, html);
    await page.addScriptTag({ content: js + '\nGyos.mountAll();' });
    for (const index of [0, 3, 4]) await expect(page.locator(`[data-case="${index}"] p`)).toHaveText(sentence);
    await expect(page.locator('[data-case="1"] p')).toHaveText('');
    const getter = page.locator('[g-scope="SaveNotice"]');
    await expect(getter.locator('p')).toHaveText(sentence);
    await getter.getByRole('button').click();
    await expect(getter.locator('p')).toHaveText('Waiting');
    await getter.getByRole('button').click();
    await expect(getter.locator('p')).toHaveText(sentence);
  });
}
