import { makeReactive, markStore } from './reactive';

/**
 * Global Store System - Centralized State Management
 * Similar to Vuex/Pinia but simpler
 * 
 * @example
 * // Define store
 * const userStore = Gyos.store('user', {
 *   // State
 *   currentUser: null,
 *   isLoggedIn: false,
 *   
 *   // Actions/methods
 *   login(user) {
 *     this.currentUser = user;
 *     this.isLoggedIn = true;
 *   },
 *   
 *   logout() {
 *     this.currentUser = null;
 *     this.isLoggedIn = false;
 *   }
 * });
 * 
 * @example
 * Gyos.scope('Header', {
 *   onMount() {
 *     const userStore = Gyos.store('user');
 *     console.log('User:', userStore.currentUser);
 *   }
 * });
 */

const stores = new Map<string, any>();

export function store<T extends Record<string, any>>(name: string, definition?: T): T {
	if (definition) {
		const storeInstance = makeReactive(definition);
		markStore(storeInstance);
		stores.set(name, storeInstance);
		return storeInstance;
	}

	// Get existing store
	const existing = stores.get(name);
	if (!existing) {
		throw new Error(`[GyosJS] Store "${name}" not found`);
	}
	return existing;
}

/**
 * Check if store exists
 * 
 * @param name - Store name to check
 * @returns True if store exists
 * 
 * @example
 * if (Gyos.hasStore('user')) {
 *   const user = Gyos.store('user');
 * }
 */
export function hasStore(name: string): boolean {
	return stores.has(name);
}

/**
 * Remove a store
 * 
 * @param name - Store name to remove
 * 
 * @example
 * Gyos.removeStore('user'); // Clear user store
 */
export function removeStore(name: string): void {
	stores.delete(name);
}

/**
 * Get all store names (for debugging)
 * 
 * @returns Array of store names
 * 
 * @example
 * console.log('Active stores:', Gyos.getStoreNames());
 */
export function getStoreNames(): string[] {
	return Array.from(stores.keys());
}
