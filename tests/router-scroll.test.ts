import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleScroll, saveScrollPosition } from '../src/core/router/scroll';

describe('router scroll contracts', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	it('preserves scroll when the trigger uses g-noscroll', () => {
		const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
		const trigger = document.createElement('a');
		trigger.setAttribute('g-noscroll', '');

		handleScroll('http://localhost/next', trigger);

		expect(scrollTo).not.toHaveBeenCalled();
	});

	it('prefers a hash target over saved or default positions', () => {
		const target = document.createElement('section');
		target.id = 'details';
		target.scrollIntoView = vi.fn();
		document.body.appendChild(target);
		const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

		handleScroll('http://localhost/next#details', null, { x: 10, y: 20 });

		expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
		expect(scrollTo).not.toHaveBeenCalled();
	});

	it('restores saved popstate coordinates and otherwise scrolls to top', () => {
		const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

		handleScroll('http://localhost/back', null, { x: 12, y: 34 });
		handleScroll('http://localhost/next');

		expect(scrollTo).toHaveBeenNthCalledWith(1, 12, 34);
		expect(scrollTo).toHaveBeenNthCalledWith(2, { top: 0, behavior: 'smooth' });
	});

	it('stores current coordinates without discarding existing history state', () => {
		Object.defineProperty(window, 'scrollX', { configurable: true, value: 4 });
		Object.defineProperty(window, 'scrollY', { configurable: true, value: 9 });
		vi.spyOn(history, 'replaceState').mockImplementation(() => undefined);
		vi.spyOn(history, 'state', 'get').mockReturnValue({ gyos: true });

		saveScrollPosition();

		expect(history.replaceState).toHaveBeenCalledWith({
			gyos: true,
			scroll: { x: 4, y: 9 }
		}, '');
	});
});
