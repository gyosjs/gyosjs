/**
 * Scope Registry
 * Manages mounted scope instances
 * Extracted to avoid circular dependencies
 */

/**
 * Registry of mounted scope instances
 */
const mountedScopes = new Map<HTMLElement, any>();

/**
 * Cache of mounted scopes by name
 */
export const scopeCached = new Map<string, any>();

/**
 * Register a mounted scope
 */
export function registerMountedScope(el: HTMLElement, instance: any): void {
	mountedScopes.set(el, instance);
}

/**
 * Get mounted scope instance
 */
export function getMountedScope(el: HTMLElement): any {
	return mountedScopes.get(el);
}

/**
 * Get all mounted scopes
 */
export function getAllMountedScopes(): Map<HTMLElement, any> {
	return mountedScopes;
}

/**
 * Unmount a scope
 * Handles effect cleanup, lifecycle hooks, and registry removal
 */
export function unmountScope(el: HTMLElement): void {
	let instance = mountedScopes.get(el);

	if (!instance) return;

	// Cleanup all effects
	if (instance.__gyos_effects__) {
		instance.__gyos_effects__.forEach((cleanup: () => void) => {
			try {
				cleanup();
			} catch (error) {
				console.error('[Component] Error cleaning up effect:', error);
			}
		});
		instance.__gyos_effects__ = null;
	}

	// Call lifecycle hook
	if (instance.onUnmount) {
		instance.onUnmount.call(instance);
	}

	// Clear reference on element
	(el as any).__gyos_scope__ = null;

	// Remove from registry
	mountedScopes.delete(el);
}

/**
 * Get scope from element or nearest parent (lazy lookup)
 * More efficient than pre-setting on all descendants
 */
export function getScopeFromElement(element: HTMLElement): any {
	let current: HTMLElement | null = element;
	while (current) {
		if ((current as any).__gyos_scope__) {
			return (current as any).__gyos_scope__;
		}
		current = current.parentElement;
	}
	return null;
}

/**
 * Unmount all child scopes of a given element
 */
export function unmountChildScopes(element: HTMLElement): void {
	mountedScopes.forEach((_, mountedEl) => {
		if (element.contains(mountedEl) && element !== mountedEl) {
			unmountScope(mountedEl);
		}
	});
}