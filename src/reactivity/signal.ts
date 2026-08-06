/**
 * Reactive Signal System
 * 
 * Core reactivity implementation using signals pattern.
 * Signals are reactive primitives that automatically track dependencies
 * and notify subscribers when values change.
 * 
 * Features:
 * - Fine-grained reactivity
 * - Automatic dependency tracking
 * - Batched updates
 * - Effect cleanup
 * - Computed signals (lazy & cached)
 * 
 * @example Basic usage
 * ```javascript
 * const count = Gyos.signal(0);
 * 
 * Gyos.effect(() => {
 *   console.log('Count:', count.value); // Auto re-runs when count changes
 * });
 * 
 * count.value++; // Triggers effect
 * ```
 */

import type { Signal, Computed, SignalOptions } from '../types';
import { DEBUG, DEBUG_VERBOSE } from "../utils/helpers";

/**
 * Current effect being tracked
 */
let currentEffect: (() => void) | null = null;

// Simple counter for debug-friendly IDs
let signalIdCounter = 0;

const WARN_SUBSCRIBERS = () => typeof window !== 'undefined' && (window as any).GYOS_DEBUG_WARN_SUBSCRIBERS;
const SUBSCRIBER_WARN_THRESHOLD = 200;

function formatDebugLabel(id: number, label?: string): string {
	return label ? `#${id} ${label}` : `#${id}`;
}

/**
 * Effect execution tracking
 */
const runningEffects = new Set<() => void>();
let effectDepth = 0;

/**
 * Effect queue to prevent infinite loops
 */
const effectQueue = new Set<() => void>();
let isFlushingQueue = false;

/**
 * Flush effect queue
 */
function flushEffectQueue() {
	if (effectQueue.size === 0 || isFlushingQueue) return;

	isFlushingQueue = true;
	const effects = Array.from(effectQueue);
	effectQueue.clear();

	effects.forEach(fn => {
		if (!runningEffects.has(fn)) {
			try {
				fn();
			} catch (error) {
				console.error('[Signal] Error in queued effect:', error);
			}
		}
	});

	isFlushingQueue = false;
}

/**
 * Queue an effect for execution in next microtask
 * Prevents cascading updates and infinite loops
 */
function queueEffect(effect: () => void) {
	effectQueue.add(effect);
	if (!isFlushingQueue && effectDepth === 0) {
		queueMicrotask(flushEffectQueue);
	}
}

/**
 * Effects to run after batch
 */
let batchedEffects = new Set<() => void>();
let isBatching = false;

/**
 * Create a reactive signal
 * 
 * Signals are reactive primitives that track dependencies automatically.
 * When a signal's value changes, all dependent effects are re-run.
 * 
 * @param initialValue - Initial value of the signal
 * @param debugOrOptions - Optional debug label or options (debugLabel, equals comparator)
 * @returns Signal object with reactive value getter/setter
 * 
 * @example
 * ```javascript
 * const count = Gyos.signal(0);
 * const labeled = Gyos.signal(0, 'counter');
 * const customEq = Gyos.signal({ x: 1 }, { equals: (a,b) => a.x === b.x, debugLabel: 'point' });
 * 
 * // Read value (tracks dependency if inside effect)
 * console.log(count.value); // 0
 * console.log(count());     // 0 (shorthand, same as .value)
 * 
 * // Write value (notifies subscribers)
 * count.value = 1;
 * count(2);                // Shorthand setter
 * 
 * // Peek without tracking
 * console.log(count.peek); // 2
 * 
 * // Update with function
 * count.update(n => n + 1);
 * 
 * // Subscribe to changes
 * const unsubscribe = count.subscribe(() => {
 *   console.log('Changed:', count.value);
 * });
 * ```
 */
export function signal<T>(initialValue: T, debugOrOptions?: string | SignalOptions<T>): Signal<T> {
	const debugLabel = typeof debugOrOptions === 'string' ? debugOrOptions : debugOrOptions?.debugLabel;
	const equals = typeof debugOrOptions === 'object' && debugOrOptions?.equals ? debugOrOptions.equals : Object.is;
	const debugId = ++signalIdCounter;
	let value = initialValue;
	const subscribers = new Set<() => void>();
	let warnedSubscribers = false;

	const read = () => {
		// Track dependency
		if (currentEffect) {
			// IMPORTANT: Only add if not already subscribed (prevent duplicates)
			if (!subscribers.has(currentEffect)) {
				subscribers.add(currentEffect);

				// Store the subscribers Set in the effect's dependencies for cleanup
				if ((currentEffect as any).__dependencies) {
					(currentEffect as any).__dependencies.add(subscribers);
				}

				if (DEBUG_VERBOSE()) {
					console.log('[Signal]', formatDebugLabel(debugId, debugLabel), 'Added subscriber, total:', subscribers.size);
				}
				if (!warnedSubscribers && WARN_SUBSCRIBERS() && DEBUG() && subscribers.size >= SUBSCRIBER_WARN_THRESHOLD) {
					console.warn('[Signal]', formatDebugLabel(debugId, debugLabel), 'subscriber count high:', subscribers.size);
					warnedSubscribers = true;
				}
			}
		}
		return value;
	};

	const write = (newValue: T) => {
		// Skip notify if comparator says no change
		if (equals(value, newValue)) return;

		// For objects/arrays, check if it's actually the same reference
		// Deep equality is expensive, let user handle it
		value = newValue;

		DEBUG_VERBOSE() && console.log('[Signal]', formatDebugLabel(debugId, debugLabel), 'Value changed to:', newValue);

		notify();
	};

	const notify = () => {
		DEBUG_VERBOSE() && console.log('[Signal]', formatDebugLabel(debugId, debugLabel), 'Notifying', subscribers.size, 'subscribers');

		if (isBatching) {
			subscribers.forEach(sub => batchedEffects.add(sub));
		} else {
			// Always queue effects to prevent cascading updates
			subscribers.forEach(sub => queueEffect(sub));
		}
	};

	// Create callable signal (like Angular/SolidJS)
	// Call without args = read, call with arg = write
	const callable = function (newValue?: T) {
		if (arguments.length === 0) {
			return read();
		} else {
			write(newValue!);
			return newValue!;
		}
	} as any;

	// Add properties to callable function
	Object.defineProperties(callable, {
		value: {
			get: read,
			set: write,
			enumerable: true,
			configurable: true
		},
		peek: {
			get: () => value,
			enumerable: true,
			configurable: true
		},
		update: {
			value: function (fn: (value: T) => T) {
				write(fn(value));
			},
			enumerable: true,
			configurable: true
		},
		subscribe: {
			value: function (fn: () => void) {
				subscribers.add(fn);
				return () => subscribers.delete(fn);
			},
			enumerable: true,
			configurable: true
		},
		__gyos_signal__: {
			value: true,
			enumerable: true,
			configurable: true
		},
		__gyos_debug_id__: {
			value: debugId,
			enumerable: false
		},
		__gyos_debug_label__: {
			value: debugLabel,
			enumerable: false
		},
		__gyos_equals__: {
			value: equals,
			enumerable: false
		}
	});

	return callable;
}

/**
 * Create a computed signal (derived/memoized value)
 * 
 * Computed signals automatically re-compute when their dependencies change.
 * The computation is lazy (only runs when value is read) and cached.
 * 
 * @param fn - Computation function (should be pure)
 * @returns Computed signal (read-only)
 * 
 * @example
 * ```javascript
 * const count = Gyos.signal(5);
 * const doubled = Gyos.computed(() => count.value * 2);
 * 
 * console.log(doubled.value); // 10
 * console.log(doubled());     // 10 (callable shorthand)
 * 
 * count.value = 10;
 * console.log(doubled.value); // 20 (auto-updated)
 * console.log(doubled());     // 20 (callable)
 * ```
 * 
 * @example With multiple dependencies
 * ```javascript
 * const firstName = Gyos.signal('John');
 * const lastName = Gyos.signal('Doe');
 * const fullName = Gyos.computed(() => `${firstName.value} ${lastName.value}`);
 * 
 * console.log(fullName());    // "John Doe"
 * ```
 */
export function computed<T>(fn: () => T): Computed<T> {
	let value: T;
	let isDirty = true;
	let isFirstRun = true;
	const subscribers = new Set<() => void>();
	let cleanup: (() => void) | undefined;

	const compute = () => {
		if (!isDirty && !isFirstRun) return;

		// Cleanup previous dependencies
		if (cleanup) cleanup();

		// Track dependencies in an effect
		cleanup = effect(() => {
			try {
				const newValue = fn();

				// Only update if changed
				if (isFirstRun || value !== newValue) {
					value = newValue;
					isFirstRun = false;
					isDirty = false;

					// Notify subscribers
					if (!isBatching) {
						subscribers.forEach(sub => queueEffect(sub));
					} else {
						subscribers.forEach(sub => batchedEffects.add(sub));
					}
				}
			} catch (error) {
				console.error('[Computed] Error in computation:', error);
				throw error;
			}
		});

		isDirty = false;
	};

	const read = () => {
		if (isDirty || isFirstRun) compute();

		// Track dependency
		if (currentEffect && !subscribers.has(currentEffect)) {
			subscribers.add(currentEffect);
			if ((currentEffect as any).__dependencies) {
				(currentEffect as any).__dependencies.add(subscribers);
			}
		}

		return value;
	};

	// Create callable computed (read-only)
	const callable = function () {
		return read();
	} as any;

	// Add properties
	Object.defineProperties(callable, {
		value: {
			get: read,
			enumerable: true,
			configurable: true
		},
		peek: {
			get: () => {
				if (isDirty || isFirstRun) compute();
				return value;
			},
			enumerable: true,
			configurable: true
		},
		subscribe: {
			value: function (fn: () => void) {
				subscribers.add(fn);
				return () => subscribers.delete(fn);
			},
			enumerable: true,
			configurable: true
		},
		__gyos_computed__: {
			value: true
		},
	});

	return callable;
}

/**
 * Create an effect (side effect that runs when dependencies change)
 * 
 * Effects are functions that run immediately and re-run whenever their
 * reactive dependencies change. Used for side effects like DOM updates,
 * logging, or API calls.
 * 
 * @param fn - Effect function (can return cleanup function)
 * @returns Cleanup function to stop the effect
 * 
 * @example Basic effect
 * ```javascript
 * const count = Gyos.signal(0);
 * 
 * const stop = Gyos.effect(() => {
 *   console.log('Count is:', count.value);
 * });
 * 
 * count.value = 1; // Logs: "Count is: 1"
 * stop(); // Stop watching
 * ```
 * 
 * @example Effect with cleanup
 * ```javascript
 * const id = Gyos.signal(1);
 * 
 * Gyos.effect(() => {
 *   const controller = new AbortController();
 *   
 *   fetch(`/api/user/${id.value}`, { signal: controller.signal })
 *     .then(res => res.json())
 *     .then(data => console.log(data));
 *   
 *   // Cleanup: abort fetch when id changes
 *   return () => controller.abort();
 * });
 * ```
 */
export function effect(fn: () => void | (() => void)): () => void {
	let cleanup: (() => void) | undefined;
	let dependencies = new Set<Set<() => void>>();
	let active = true;

	const execute = () => {
		if (!active) return;

		// Prevent recursive execution - if already running, skip
		if (runningEffects.has(execute)) {
			DEBUG() && console.warn('[Effect] Skipped recursive execution');
			return;
		}

		// Mark as running
		runningEffects.add(execute);
		effectDepth++;

		// Remove this effect from all its dependencies BEFORE running
		dependencies.forEach(depSet => {
			depSet.delete(execute);
		});

		DEBUG() && console.log('[Effect] Cleaned up dependencies, count:', dependencies.size);

		dependencies.clear();

		// Clean up previous run
		if (cleanup) {
			try {
				cleanup();
			} catch (error) {
				console.error('[Effect] Error in cleanup:', error);
			}
		}

		// Track this effect
		const prevEffect = currentEffect;
		currentEffect = execute;

		// Store dependencies for cleanup
		(execute as any).__dependencies = dependencies;

		try {
			const nextCleanup = fn();
			cleanup = typeof nextCleanup === 'function' ? nextCleanup : undefined;
		} catch (error) {
			console.error('[Effect] Error in effect:', error);
			// Don't throw - allow other effects to continue
		} finally {
			currentEffect = prevEffect;
			effectDepth--;
			runningEffects.delete(execute);

			// Flush queue when we're back to top level
			if (effectDepth === 0 && effectQueue.size > 0) {
				queueMicrotask(flushEffectQueue);
			}
		}
	};

	// Run immediately
	execute();

	// Return cleanup function
	return () => {
		if (!active) return;
		active = false;

		// Remove from all dependencies
		dependencies.forEach(depSet => {
			depSet.delete(execute);
		});
		dependencies.clear();

		if (cleanup) {
			try {
				cleanup();
			} catch (error) {
				console.error('[Effect] Error in final cleanup:', error);
			}
		}
	};
}

/**
 * Batch multiple updates into a single render
 * 
 * Prevents multiple re-renders when updating multiple signals.
 * All effects are collected and run once after the batch completes.
 * 
 * @param fn - Function containing multiple signal updates
 * 
 * @example Without batch (3 renders)
 * ```javascript
 * const a = Gyos.signal(1);
 * const b = Gyos.signal(2);
 * const c = Gyos.signal(3);
 * 
 * Gyos.effect(() => {
 *   console.log('Sum:', a.value + b.value + c.value);
 * });
 * 
 * a.value = 10; // Render 1
 * b.value = 20; // Render 2
 * c.value = 30; // Render 3
 * ```
 * 
 * @example With batch (1 render)
 * ```javascript
 * Gyos.batch(() => {
 *   a.value = 10;
 *   b.value = 20;
 *   c.value = 30;
 * }); // Single render with all values updated
 * ```
 */
export function batch(fn: () => void): void {
	if (isBatching) {
		fn();
		return;
	}

	isBatching = true;
	batchedEffects.clear();

	try {
		fn();
	} catch (error) {
		console.error('[Batch] Error in batched operations:', error);
		throw error;
	} finally {
		isBatching = false;

		// Run all batched effects
		const effects = Array.from(batchedEffects);
		batchedEffects.clear();
		effects.forEach(effect => {
			try {
				effect();
			} catch (error) {
				console.error('[Batch] Error in batched effect:', error);
			}
		});
	}
}

/**
 * Check if a value is a signal
 * 
 * @param value - Value to check
 * @returns True if value is a signal
 * 
 * @example
 * ```javascript
 * const sig = Gyos.signal(5);
 * const num = 10;
 * 
 * Gyos.isSignal(sig); // true
 * Gyos.isSignal(num); // false
 * ```
 */
export function isSignal(value: any): value is Signal {
	// Signal is now a callable function with properties
	return value && typeof value === 'function' && 'value' in value && 'peek' in value && '__gyos_signal__' in value;
}

// Exposed for internals to detect tracking state without direct access to currentEffect
export function hasCurrentEffect(): boolean {
	return currentEffect !== null;
}

/**
 * Check if a value is a computed
 * 
 * @param value - Value to check
 * @returns True if value is a computed
 * 
 * @example
 * ```javascript
 * const comp = Gyos.computed(() => 5 + 5);
 * const num = 10;
 * 
 * Gyos.isComputed(comp); // true
 * Gyos.isComputed(num); // false
 * ```
 */
export function isComputed(value: any): value is Computed {
	return value && typeof value === 'function' && 'value' in value && 'peek' in value && '__gyos_computed__' in value;
}

/**
 * Unwrap signal value (or return value as-is)
 * 
 * Useful when you don't know if a value is a signal or plain value.
 * 
 * @param value - Signal or plain value
 * @returns Unwrapped value
 * 
 * @example
 * ```javascript
 * const sig = Gyos.signal(5);
 * const num = 10;
 * 
 * Gyos.unref(sig); // 5
 * Gyos.unref(num); // 10
 * ```
 */
export function unref<T>(value: T | Signal<T>): T {
	return isSignal(value) ? value.value : (value as T);
}

/**
 * Run a function without collecting reactive dependencies
 * Useful to avoid accidental subscriptions during setup or non-reactive reads.
 */
export function untrack<T>(fn: () => T): T {
	const prevEffect = currentEffect;
	currentEffect = null;
	try {
		return fn();
	} finally {
		currentEffect = prevEffect;
	}
}
