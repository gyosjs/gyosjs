import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleScroll } from '../src/core/router/scroll';

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('router fragment boundaries', () => {
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
