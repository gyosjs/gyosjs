import { beforeEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';

interface ObserverHarness {
	callback: IntersectionObserverCallback;
	disconnect: ReturnType<typeof vi.fn>;
	observe: ReturnType<typeof vi.fn>;
	options?: IntersectionObserverInit;
	unobserve: ReturnType<typeof vi.fn>;
}

const observers: ObserverHarness[] = [];
let scopeId = 0;

function mount(markup: string): HTMLElement {
	const name = `RevealScope${++scopeId}`;
	document.body.innerHTML = `<main id="root" g-scope="${name}">${markup}</main>`;
	Gyos.scope(name, {});
	Gyos.mountAll();
	return document.getElementById('root')!;
}

function intersect(observer: ObserverHarness, target: Element, isIntersecting: boolean): void {
	observer.callback([{ target, isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
}

describe('g-reveal', () => {
	beforeEach(() => {
		for (const element of Array.from(Gyos.mountedScopes().keys())) Gyos.cleanup(element);
		document.body.innerHTML = '';
		document.documentElement.classList.remove('gyos-reveal-ready');
		observers.splice(0);
		vi.restoreAllMocks();
		vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
		vi.stubGlobal('IntersectionObserver', class {
			callback: IntersectionObserverCallback;
			disconnect = vi.fn();
			observe = vi.fn();
			unobserve = vi.fn();

			constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
				this.callback = callback;
				observers.push(this as unknown as ObserverHarness);
				(observers.at(-1) as ObserverHarness).options = options;
			}
		});
	});

	it('shares a one-shot observer and exposes CSS state when elements intersect', () => {
		const root = mount('<section class="first" g-reveal>First</section><section class="second" g-reveal>Second</section>');
		const first = root.querySelector('.first')!;
		const second = root.querySelector('.second')!;

		expect(document.documentElement.classList.contains('gyos-reveal-ready')).toBe(true);
		expect(observers).toHaveLength(1);
		expect(observers[0].options).toMatchObject({ rootMargin: '0px', threshold: 0.1 });
		expect(observers[0].observe).toHaveBeenCalledTimes(2);

		intersect(observers[0], first, true);
		expect(first.hasAttribute('data-gyos-revealed')).toBe(true);
		expect(first.classList.contains('is-revealed')).toBe(true);
		expect(observers[0].unobserve).toHaveBeenCalledWith(first);
		expect(second.hasAttribute('data-gyos-revealed')).toBe(false);

		Gyos.cleanup(root);
		expect(observers[0].unobserve).toHaveBeenCalledWith(second);
		expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
	});

	it('supports parent observation and repeat visibility', () => {
		const root = mount('<div class="clip-parent"><img class="clip" g-reveal:parent:repeat></div>');
		const parent = root.querySelector('.clip-parent')!;
		const image = root.querySelector('.clip')!;
		expect(observers[0].observe).toHaveBeenCalledWith(parent);

		intersect(observers[0], parent, true);
		expect(image.hasAttribute('data-gyos-revealed')).toBe(true);
		intersect(observers[0], parent, false);
		expect(image.hasAttribute('data-gyos-revealed')).toBe(false);

		Gyos.cleanup(root);
		expect(observers[0].unobserve).toHaveBeenCalledWith(parent);
		expect(image.hasAttribute('data-gyos-revealed')).toBe(false);
	});

	it('reveals immediately for reduced motion or unavailable observers', () => {
		vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
		const reducedRoot = mount('<section class="reduced" g-reveal>Reduced</section>');
		expect(reducedRoot.querySelector('.reduced')!.hasAttribute('data-gyos-revealed')).toBe(true);
		expect(observers).toHaveLength(0);
		Gyos.cleanup(reducedRoot);

		vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
		vi.stubGlobal('IntersectionObserver', undefined);
		const fallbackRoot = mount('<section class="fallback" g-reveal>Fallback</section>');
		expect(fallbackRoot.querySelector('.fallback')!.classList.contains('is-revealed')).toBe(true);
	});
});
