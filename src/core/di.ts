/**
 * Dependency Injection System
 */

/**
 * Service container
 */
class Container {
	private services = new Map<string, any>();
	private parent: Container | null = null;

	constructor(parent?: Container) {
		this.parent = parent || null;
	}

	set(key: string, value: any): void {
		this.services.set(key, value);
	}

	get<T = any>(key: string): T {
		if (this.services.has(key)) {
			return this.services.get(key);
		}

		if (this.parent) {
			return this.parent.get(key);
		}

		throw new Error(`[GyosJS] Service "${key}" not found in DI container`);
	}

	has(key: string): boolean {
		return this.services.has(key) || (this.parent?.has(key) ?? false);
	}

	createChild(): Container {
		return new Container(this);
	}
}

/**
 * Global container
 */
const globalContainer = new Container();

/**
 * Element -> Container map
 */
const elementContainers = new WeakMap<HTMLElement, Container>();

/**
 * Get or create injector for element
 */
export function getInjector(el: HTMLElement): Container {
	// Check if element has container
	if (elementContainers.has(el)) {
		return elementContainers.get(el)!;
	}

	// Find parent container - recursively setup parent chain if needed
	let parent = el.parentElement;
	let parentContainer: Container = globalContainer;

	while (parent) {
		if (elementContainers.has(parent)) {
			parentContainer = elementContainers.get(parent)!;
			break;
		}
		// If parent has g-provide but no container yet, setup parent first (recursive)
		if (parent.hasAttribute('g-provide')) {
			parentContainer = getInjector(parent);
			break;
		}
		parent = parent.parentElement;
	}

	// Create child container
	const container = parentContainer.createChild();
	elementContainers.set(el, container);

	// Parse g-provide attribute (JSON format for safety)
	const provideAttr = el.getAttribute('g-provide');
	if (provideAttr) {
		try {
			// Try JSON parse first (safer)
			const providers = JSON.parse(provideAttr);
			if (!providers || Array.isArray(providers) || typeof providers !== 'object') {
				throw new TypeError('g-provide must contain a JSON object');
			}

			Object.entries(providers).forEach(([key, value]) => {
				container.set(key, value);
			});
		} catch (e) {
			console.error('[GyosJS] Failed to parse g-provide:', e);
		}
	}

	return container;
}

/**
 * Provide a service globally
 * 
 * @example
 * // Provide API service
 * Gyos.provide('api', {
 *   fetchUser: () => fetch('/api/user').then(r => r.json())
 * });
 */
export function provide(key: string, value: any): void {
	globalContainer.set(key, value);
}

/**
 * Inject a service from global DI container
 * 
 * NOTE: This only works with globally provided services via Gyos.provide().
 * To use element-scoped services (g-provide), use this.$inject() inside scopes.
 * 
 * @example
 * // Global provide + inject
 * Gyos.provide('api', apiService);
 * const api = Gyos.inject('api'); // Works
 * 
 * @example
 * // Element-scoped provide + inject
 * // <div g-provide='{"theme": "dark"}' g-scope="Demo">
 * Gyos.scope('Demo', {
 *   onMount() {
 *     const theme = this.$inject('theme'); // Use this.$inject, not Gyos.inject
 *   }
 * });
 */
export function inject<T = any>(key: string, defaultValue?: T): T {
	// Try to get from global container
	if (globalContainer.has(key)) {
		return globalContainer.get<T>(key);
	}

	// Return default value if provided
	if (defaultValue !== undefined) {
		return defaultValue;
	}

	throw new Error(`[GyosJS] Service "${key}" not found in DI container`);
}

/**
 * Get global container (for internal use)
 */
export function getGlobalContainer(): Container {
	return globalContainer;
}
