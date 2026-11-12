import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleScroll } from '../src/core/router/scroll';
import { performSwap } from '../src/core/router/swap';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('router fragment boundaries', () => {
  it('morphs parsed directive attributes without XML name validation', async () => {
    document.body.innerHTML = '<section><button>Old</button></section>';
    const target = document.body.firstElementChild as HTMLElement;
    const incoming = new DOMParser().parseFromString(
      '<section><button @click="count++" :title="count" *if="show">New</button></section>', 'text/html'
    ).body.firstElementChild as HTMLElement;
    await performSwap(target, incoming, 'morph');
    const button = target.querySelector('button')!;
    expect(button.getAttribute('@click')).toBe('count++');
    expect(button.getAttribute(':title')).toBe('count');
    expect(button.getAttribute('*if')).toBe('show');
    expect(button.textContent).toBe('New');
  });

  it.each(['123', 'a:b', 'hello world', 'tiếng Việt', 'rate%'])('scrolls to the fragment id %s', id => {
    const target = document.createElement('section'); target.id = id;
    const scroll = vi.fn(); target.scrollIntoView = scroll;
    document.body.append(target);
    handleScroll(`https://example.test/#${encodeURIComponent(id)}`);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('tolerates an invalid percent sequence and preserves scroll fallback', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    expect(() => handleScroll('https://example.test/#%', undefined, { x: 2, y: 3 })).not.toThrow();
    expect(scroll).toHaveBeenCalledWith(2, 3);
  });
});
