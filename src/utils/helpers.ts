/**
 * Utility helpers
 */

/**
 * Next tick - Execute callback after DOM updates
 */
export function nextTick(callback: () => void): void {
	Promise.resolve().then(callback);
}

/**
 * Execute callback when DOM is ready
 */
export function ready(callback: () => void): void {
	if (typeof document !== 'undefined') {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', callback, { once: true });
		} else {
			queueMicrotask(callback);
		}
	} else {
		callback();
	}
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
	fn: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: number | null = null;

	return (...args: Parameters<T>) => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}

		timeoutId = setTimeout(() => {
			fn(...args);
		}, delay) as any;
	};
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: any[]) => any>(
	fn: T,
	delay: number
): (...args: Parameters<T>) => void {
	let lastCall = 0;

	return (...args: Parameters<T>) => {
		const now = Date.now();

		if (now - lastCall >= delay) {
			lastCall = now;
			fn(...args);
		}
	};
}

/**
 * Deep clone object
 */
export function clone<T>(obj: T): T {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	if (obj instanceof Date) {
		return new Date(obj.getTime()) as any;
	}

	if (obj instanceof Array) {
		return obj.map(item => clone(item)) as any;
	}

	const cloned: any = {};
	for (const key in obj) {
		if (obj.hasOwnProperty(key)) {
			cloned[key] = clone(obj[key]);
		}
	}

	return cloned;
}

/**
 * Check if value is object
 */
export function isObject(value: any): value is Record<string, any> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Check if running in browser
 */
export function isBrowser(): boolean {
	return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Generate unique ID
 */
let uniqueIdCounter = 0;
export function uniqueId(prefix = 'gyos'): string {
	return `${prefix}-${++uniqueIdCounter}`;
}

export function deepEqual(a: any, b: any): boolean {
	if (a === b) return true;
	if (typeof a !== 'object' || typeof b !== 'object' || a == null || b == null) {
		return false;
	}
	const keysA = Object.keys(a);
	const keysB = Object.keys(b);
	if (keysA.length !== keysB.length) {
		return false;
	}
	for (const key of keysA) {
		if (!deepEqual(a[key], b[key])) {
			return false;
		}
	}
	return true;
}

/**
 * Check if element is inside a g-static parent
 */
export function isInStaticParent(element: Element, root: HTMLElement): boolean {
	let parent = element.parentElement;
	while (parent && parent !== root) {
		if (parent.hasAttribute('g-static') || (parent as any).__gyos_static__) {
			return true;
		}
		parent = parent.parentElement;
	}
	return false;
}

/**
 * Check whether GyosJS must leave an element and its subtree untouched.
 */
export function isInIgnoredTree(element: Element): boolean {
	return element.closest('[g-ignore]') !== null;
}

const UNSAFE_PROPERTY_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function hasUnsafePropertyPath(path: string): boolean {
	return path
		.split(/[.[\]]+/)
		.filter(Boolean)
		.some(part => UNSAFE_PROPERTY_KEYS.has(part));
}

export const DEBUG = () => typeof window !== 'undefined' && (window as any).GYOS_DEBUG;
export const DEBUG_VERBOSE = () => typeof window !== 'undefined' && (window as any).GYOS_DEBUG_VERBOSE;

/**
 * Walk through DOM tree and return elements that match callback
 */
export function walkerDOM(el: HTMLElement, acceptFn: (el: HTMLElement) => boolean, skip: number = 3) : HTMLElement[] {
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT, {
		acceptNode(node) {
			return acceptFn(node as HTMLElement) ? NodeFilter.FILTER_ACCEPT : skip;
		}
	});

	const result = [];
	while (walker.nextNode()) {
		result.push(walker.currentNode as HTMLElement);
	}
	return result;
}

export function log(...args: unknown[]): void {
	if (DEBUG()) {
		console.log(...args);
	}
}

/**
 * Check if element or any ancestor has structural directive
 */
export function hasStructuralParent(el: Element): boolean {
	let current: Element | null = el.parentElement;
	while (current) {
		if (current.hasAttribute('*if') || 
			current.hasAttribute('*for') || 
			current.hasAttribute('*switch') ||
			current.hasAttribute('*await')) return true;
		current = current.parentElement;
	}
	return false;
}
