import { DEBUG } from "../utils/helpers";

/**
 * Hydration Strategies System
 * Load scopes smartly to improve initial page load performance
 *  
 * Strategies:
 * - 'idle': Load when browser is idle (requestIdleCallback)
 * - 'visible': Load when scrolled into viewport (IntersectionObserver)
 * - 'interaction': Load on user interaction (mouseenter, touchstart, focus)
 * - 'media(query)': Load based on media query match
 *  
 * @example
 * // Lazy load on scroll
 * <div g-scope="HeavyScope" g-hydrate="visible">...</div>
 *  
 * @example
 * // Load on interaction
 * <div g-scope="TooltipScope" g-hydrate="interaction">...</div>
 *  
 * @example
 * // Load on mobile only
 * <div g-scope="MobileMenu" g-hydrate="media(max-width: 768px)">...</div>
 */
import { HydrationStrategy } from "../types";

/**
 * Hydration manager - Singleton class managing scope hydration
 */
class HydrationManager {
	private observers = new Map<HTMLElement, () => void>();
	private intersectionObserver?: IntersectionObserver;
	private pending = new WeakSet<HTMLElement>();

	/**
	 * Setup hydration for element based on strategy
	 * 
	 * @param el - Element to hydrate
	 * @param strategy - Hydration strategy ('idle', 'visible', 'interaction', or 'media(query)')
	 * @param callback - Function to call when hydration should occur
	 * 
	 * @example
	 * hydrationManager.setup(el, 'visible', () => {
	 *   mountScope(el);
	 * });
	 */
	setup(el: HTMLElement, strategy: HydrationStrategy, callback: () => void): void {
		if (this.pending.has(el)) return;
		this.pending.add(el);
		const hydrate = () => {
			this.pending.delete(el);
			callback();
		};

		switch (strategy) {
			case 'idle':
				this.hydrateOnIdle(el, hydrate);
				break;
			case 'visible':
				this.hydrateOnVisible(el, hydrate);
				break;
			case 'interaction':
				this.hydrateOnInteraction(el, hydrate);
				break;
			default:
				if (strategy.startsWith('media(')) {
					const mediaQuery = `(${strategy.slice(6, -1)})`;
					this.hydrateOnMedia(el, mediaQuery, hydrate);
				} else {
					// Unknown strategy, hydrate immediately
					hydrate();
				}
		}
	}

	/**
	 * Hydrate when browser is idle (uses requestIdleCallback)
	 * Falls back to setTimeout if requestIdleCallback not available
	 * 
	 * @param callback - Function to call when browser is idle
	 */
	private hydrateOnIdle(el: HTMLElement, callback: () => void): void {
		let active = true;
		const hydrate = () => {
			if (!active) return;
			active = false;
			callback();
		};

		if ('requestIdleCallback' in window) {
			const idleId = (window as any).requestIdleCallback(hydrate, { timeout: 2000 });
			this.trackCleanup(el, () => {
				active = false;
				(window as any).cancelIdleCallback?.(idleId);
			});
		} else {
			// Fallback for browsers without requestIdleCallback
			const timeoutId = setTimeout(hydrate, 1);
			this.trackCleanup(el, () => {
				active = false;
				clearTimeout(timeoutId);
			});
		}
	}

	/**
	 * Hydrate when element becomes visible in viewport
	 * Uses IntersectionObserver with 50px rootMargin for preloading
	 * 
	 * @param el - Element to observe
	 * @param callback - Function to call when element becomes visible
	 */
	private hydrateOnVisible(el: HTMLElement, callback: () => void): void {
		DEBUG() && console.log('[Hydrate] Setting up visible observer for:', el.className);

		if (!('IntersectionObserver' in window)) {
			// Fallback if no IntersectionObserver
			DEBUG() && console.log('[Hydrate] No IntersectionObserver, calling callback immediately');
			callback();
			return;
		}

		if (!this.intersectionObserver) {
			DEBUG() && console.log('[Hydrate] Creating new IntersectionObserver');
			this.intersectionObserver = new IntersectionObserver((entries) => {
				DEBUG() && console.log('[Hydrate] IntersectionObserver triggered, entries:', entries.length);
				entries.forEach(entry => {
					DEBUG() && console.log('[Hydrate] Entry:', entry.target.className, 'isIntersecting:', entry.isIntersecting);
					if (entry.isIntersecting) {
						const element = entry.target as HTMLElement;
						const cb = this.observers.get(element);
						if (cb) {
							DEBUG() && console.log('[Hydrate] Calling callback for:', element.className);
							cb();
							this.observers.delete(element);
							this.intersectionObserver?.unobserve(element);
						}
					}
				});
			}, {
				rootMargin: '50px' // Start loading 50px before visible
			});
		}

		this.observers.set(el, callback);
		this.intersectionObserver.observe(el);
		this.trackCleanup(el, () => this.cleanup(el));
		DEBUG() && console.log('[Hydrate] Started observing:', el.className);
	}

	/**
	 * Hydrate on user interaction (mouseenter, touchstart, or focus)
	 * Automatically removes listeners after first interaction
	 * 
	 * @param el - Element to attach interaction listeners to
	 * @param callback - Function to call on first interaction
	 */
	private hydrateOnInteraction(el: HTMLElement, callback: () => void): void {
		const events = ['mouseenter', 'touchstart', 'focus'];
		let hydrated = false;

		const hydrate = () => {
			if (hydrated) return;
			hydrated = true;

			// Remove listeners
			events.forEach(event => {
				el.removeEventListener(event, hydrate);
			});

			callback();
		};

		// Add listeners
		events.forEach(event => {
			el.addEventListener(event, hydrate, { once: true, passive: true });
		});
		this.trackCleanup(el, () => {
			hydrated = true;
			events.forEach(event => el.removeEventListener(event, hydrate));
		});
	}

	/**
	 * Hydrate based on media query match
	 * Hydrates immediately if query matches, otherwise waits for match
	 * 
	 * @param mediaQuery - CSS media query string (e.g., "(max-width: 768px)")
	 * @param callback - Function to call when media query matches
	 */
	private hydrateOnMedia(el: HTMLElement, mediaQuery: string, callback: () => void): void {
		const mql = window.matchMedia(mediaQuery);

		if (mql.matches) {
			callback();
		} else {
			let active = true;
			const handler = (e: MediaQueryListEvent) => {
				if (active && e.matches) {
					active = false;
					callback();
					mql.removeEventListener('change', handler);
				}
			};

			mql.addEventListener('change', handler);
			this.trackCleanup(el, () => {
				active = false;
				mql.removeEventListener('change', handler);
			});
		}
	}

	private trackCleanup(el: HTMLElement, cleanup: () => void): void {
		if (!(el as any).__gyos_effects__) {
			(el as any).__gyos_effects__ = [];
		}
		(el as any).__gyos_effects__.push(() => {
			this.pending.delete(el);
			cleanup();
		});
	}

	/**
	 * Cleanup observers for element (called on unmount)
	 * 
	 * @param el - Element to cleanup
	 */
	cleanup(el: HTMLElement): void {
		this.pending.delete(el);
		this.observers.delete(el);
		if (this.intersectionObserver) {
			this.intersectionObserver.unobserve(el);
		}
	}
}

// Singleton instance
export const hydrationManager = new HydrationManager();

/**
 * Get hydration strategy from element's g-hydrate attribute
 * 
 * @param el - Element to check
 * @returns Hydration strategy or null if not set
 * 
 * @example
 * <div g-hydrate="visible">...</div>
 * getHydrationStrategy(el) // Returns 'visible'
 */
export function getHydrationStrategy(el: HTMLElement): HydrationStrategy | null {
	const attr = el.getAttribute('g-hydrate');
	if (!attr) return null;

	return attr as HydrationStrategy;
}
