/**
 * Global Event Bus System
 * Pub/sub pattern for cross-component communication
 * 
 * @example
 * // Component A - emit event
 * Gyos.emit('user-login', { id: 123, name: 'John' });
 * 
 * // Component B - listen for event
 * Gyos.on('user-login', (user) => {
 *   console.log('User logged in:', user);
 * });
 */

const eventBus = new Map<string, Set<Function>>();

/**
 * Subscribe to an event
 * 
 * @param event - Event name to listen for
 * @param handler - Callback function to execute when event is emitted
 * @returns Unsubscribe function
 * 
 * @example
 * // Subscribe
 * const unsubscribe = Gyos.on('data-changed', (data) => {
 *   console.log('Data:', data);
 * });
 * 
 * // Unsubscribe later
 * unsubscribe();
 */
export function on(event: string, handler: Function): () => void {
	if (!eventBus.has(event)) {
		eventBus.set(event, new Set());
	}

	eventBus.get(event)!.add(handler);

	// Return unsubscribe function
	return () => {
		eventBus.get(event)?.delete(handler);
	};
}

/**
 * Emit an event
 * 
 * @param event - Event name to emit
 * @param args - Arguments to pass to handlers
 * 
 * @example
 * Gyos.emit('cart-updated', { items: 3, total: 99.99 });
 * Gyos.emit('modal-close');
 */
export function emit(event: string, ...args: any[]): void {
	const handlers = eventBus.get(event);
	if (handlers) {
		handlers.forEach(handler => {
			try {
				handler(...args);
			} catch (e) {
				console.error(`[GyosJS] Error in event handler for "${event}":`, e);
			}
		});
	}
}

/**
 * Unsubscribe from an event
 * 
 * @param event - Event name
 * @param handler - Specific handler to remove (optional, removes all if not provided)
 * 
 * @example
 * // Remove specific handler
 * Gyos.off('data-changed', myHandler);
 * 
 * // Remove all handlers for event
 * Gyos.off('data-changed');
 */
export function off(event: string, handler?: Function): void {
	if (!handler) {
		// Remove all handlers for event
		eventBus.delete(event);
	} else {
		// Remove specific handler
		eventBus.get(event)?.delete(handler);
	}
}

/**
 * Subscribe once - handler will be called only once then auto-unsubscribed
 * 
 * @param event - Event name to listen for
 * @param handler - Callback function (will only execute once)
 * @returns Unsubscribe function
 * 
 * @example
 * // Listen for first load only
 * Gyos.once('app-ready', () => {
 *   console.log('App is ready!');
 * });
 * 
 * Gyos.emit('app-ready'); // Handler called
 * Gyos.emit('app-ready'); // Handler NOT called (already unsubscribed)
 */
export function once(event: string, handler: Function): () => void {
	const wrapper = (...args: any[]) => {
		handler(...args);
		off(event, wrapper);
	};

	return on(event, wrapper);
}

/**
 * Get all active event listeners (for debugging)
 * 
 * @example
 * console.log('Active events:', Gyos.getEventListeners());
 */
export function getEventListeners(): Record<string, number> {
	const listeners: Record<string, number> = {};
	eventBus.forEach((handlers, event) => {
		listeners[event] = handlers.size;
	});
	return listeners;
}

/**
 * Clear all event listeners
 * Useful for cleanup in tests or when unmounting app
 * 
 * @example
 * Gyos.clearAllEvents();
 */
export function clearAllEvents(): void {
	eventBus.clear();
}
