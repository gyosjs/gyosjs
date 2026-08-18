import type { Scope, ScopeDefinition, ComponentContext, WatchOptions } from '../types';
import { effect } from '../reactivity/signal';
import { getInjector } from './di';
import { parseTemplate } from '../template/parser';
import { hydrationManager, getHydrationStrategy } from './hydration';
import { registerMountedScope, getMountedScope, getScopeFromElement, scopeCached, getAllMountedScopes } from './scope-registry';
import { makeReactive, SCOPE_VERSION } from './reactive';
import { deepEqual, clone, DEBUG, walkerDOM, hasStructuralParent, hasUnsafePropertyPath, isInIgnoredTree } from '../utils/helpers';
import { processParse, setMountFunction } from '../template/process';
import { disposeEffects } from '../template/cleanup';
import { evaluateExpression } from '../template/expression';
import { expressionRuntime } from '../runtime/evaluator';

// Inject mount function into process.ts to handle nested scopes in structural directives
setMountFunction(mount);

/**
 * Registry of all scopes
 */
const scopeRegistry = new Map<string, ScopeDefinition>();

/**
 * Register a scope
 */
export function scope(name: string | HTMLElement, definition: ScopeDefinition): void {

	if (name instanceof HTMLElement) {
		// Mount scope directly on HTMLElement
		const nameAttr = Math.random().toString(36);
		name.setAttribute('g-scope', nameAttr);
		scopeRegistry.set(nameAttr, definition);
		return;
	}

	scopeRegistry.set(name, definition);
}

function getDepth(el: Element): number {
	let depth = 0;
	while (el.parentElement) {
		depth++;
		el = el.parentElement;
	}
	return depth;
}

/**
 * Mount all scopes in the document
 */
export function mountAll(root?: HTMLElement | Iterable<HTMLElement>): void {
	if (root) {
		const roots = root instanceof HTMLElement ? [root] : Array.from(root);
		roots.forEach(element => mountTree(element));
		return;
	}

	const elements = document.querySelectorAll('[g-scope]');
	const elementsNotScope = walkerDOM(document.body, el => {
		if (el.hasAttribute('g-scope')) return false; // Skip elements with g-scope
		for (const attr of el.attributes) {
			const attrName = attr.name;
			if (attrName.startsWith('gd-') || attrName.startsWith('gm-')) {
				return true;
			}
		}
		return false;
	});

	// Sort by depth (deepest first)
	const allElements = [...elements, ...elementsNotScope].filter(el => !isInIgnoredTree(el));
	allElements.sort((a, b) => getDepth(b) - getDepth(a));

	// Filter out elements inside structural directives - they will be mounted by structural processor
	allElements.forEach(el => !hasStructuralParent(el) && mount(el as HTMLElement));
}

export function mountTree(el: HTMLElement): void {
	if (isInIgnoredTree(el) || !document.body.contains(el)) return;
	const hasAutoScope = (element: HTMLElement): boolean =>
		Array.from(element.attributes).some(attribute => attribute.name.startsWith('gd-') || attribute.name.startsWith('gm-'));
	const candidates = [el, ...walkerDOM(el, element => !isInIgnoredTree(element), NodeFilter.FILTER_REJECT)]
		.filter(element => element.hasAttribute('g-scope') || hasAutoScope(element));

	// Child scopes own their subtree before an existing parent scope parses the insertion.
	candidates.sort((a, b) => getDepth(b) - getDepth(a));
	candidates.forEach(element => !hasStructuralParent(element) && mount(element));

	if (getMountedScope(el)) return;
	const ownerScope = getScopeFromElement(el);
	if (ownerScope) processParse(el, ownerScope);
}

/**
 * Mount a element with g-scope attribute
 */
export function mount(el: HTMLElement): void {
	// Skip if element not in DOM (happens during structural directive transitions)
	if (!document.body.contains(el)) {
		return;
	}
	if (isInIgnoredTree(el)) return;

	// Check if element removed but still has g-scope (possible in some edge cases)
	getAllMountedScopes().forEach((_, mountedEl) => {
		if (!document.body.contains(mountedEl)) {
			disposeEffects(mountedEl);
		}
	});

	mountScope(el, el.getAttribute('g-scope') || Math.random().toString(36));
}

/**
 * Parse inline scope definition from HTML attribute
 */
function parseInlineScope(scopeStr: string): Scope | undefined {
	// If scopeStr is encode urld, decode it first
	scopeStr = decodeURIComponent(scopeStr);

	try {
		// Check if it's an inline object definition (starts with '{')
		const trimmed = scopeStr.trim();
		if (!trimmed.startsWith('{')) {
			return undefined; // Not an inline definition
		}

		const definition = expressionRuntime().parseScope(trimmed);

		DEBUG() && console.log('[GyosJS] Parsed inline scope:', definition);
		return definition;
	} catch (error) {
		DEBUG() && console.error('[GyosJS] Failed to parse inline scope:', error);
		return undefined;
	}
}

function parseAutoScope(el: HTMLElement): Scope {
	const forbidden = [
		"constructor",
		"__proto__",
		"prototype",
		"globalThis",
		"window",
		"document",
		"Function",
		"eval",
		"require",
		"import"
	];
	const evalSample = (expr: string) => {
		if (expr.length === 0) return expr;

		const trimmed = expr.trim();

		if (trimmed.toLocaleLowerCase() === 'true') return true;
		if (trimmed.toLocaleLowerCase() === 'false') return false;

		if (!isNaN(Number(expr)) && trimmed === expr) return Number(expr);

		if (!/^[\[{]/.test(trimmed)) return expr;

		try { return JSON.parse(trimmed) } catch (_) { return expr }
	}
	const attrs = el.attributes;
	let definition: any = {};
	let removeAttrs: string[] = [];
	for (let i = 0; i < attrs.length; i++) {
		const attr = attrs[i];
		const key = attr.name.substring(3).replace(/-([a-z])/g, g => g[1].toUpperCase());
		if (hasUnsafePropertyPath(key.split(':', 1)[0])) {
			removeAttrs.push(attr.name);
			continue;
		}

		// found a gd- attribute and add to definition
		if (attr.name.match(/^gd-.+/)) {
			definition[key] = evalSample(attr.value);
			removeAttrs.push(attr.name);
			continue;
		} 

		// gm-method-name:args:arg2="expression"
		if (attr.name.match(/^gm-.+/)) {
			// If expr is encoded url, decode it first
			const expr = decodeURIComponent(attr.value.trim());
			if (forbidden.some(f => expr.includes(f))) {
				DEBUG() && console.log("[GyosJS] Scope mount error: Forbidden expression:", expr);
			}

			const args = key.split(':').slice(1);
			const propName = key.split(':')[0];
			try {
				definition[propName] = expressionRuntime().createMethod(args, expr);
				removeAttrs.push(attr.name);
			} catch (_) {
				DEBUG() && console.log("[GyosJS] Scope mount error: Invalid method expression:", propName);
			}
		}
	}
	removeAttrs.forEach(attr => el.removeAttribute(attr));
	return definition;
}

function autoBindModelProp(el: HTMLElement, scope: Scope): void {
	const walker = walkerDOM(el, node => {
		const attrs = node.getAttributeNames();
		return attrs.some(attr => attr.startsWith('g-model'));
	});
	const radioDefaults = new Map<string, string | number>();

	for (const node of walker) {
		if (isInIgnoredTree(node)) continue;
		const attrs = node.attributes;
		const modelAttr = Array.from(attrs).find(attr => attr.name.startsWith('g-model'));
		if (!modelAttr) continue;

		// If prop exists or is nested, skip
		if (modelAttr.value.includes('.')) continue;

		const element = node as HTMLInputElement;
		if (element.type === 'radio') {
			if (modelAttr.value in scope) continue;
			if (!radioDefaults.has(modelAttr.value)) radioDefaults.set(modelAttr.value, '');
			if (element.checked) {
				const value = modelAttr.name.split('.').includes('number')
					? Number(element.value)
					: element.value;
				radioDefaults.set(modelAttr.value, value);
			}
			continue;
		}
		if (modelAttr.value in scope) continue;

		const valueAuto = element.type === 'checkbox' ? element.checked : element.value;
		(scope as any)[modelAttr.value] = valueAuto;
		DEBUG() && console.log(`[g-model] Auto-bound property "${modelAttr.value}" with initial value:`, valueAuto);
	}

	for (const [prop, value] of radioDefaults) {
		if (prop in scope) continue;
		(scope as any)[prop] = value;
		DEBUG() && console.log(`[g-model] Auto-bound radio property "${prop}" with initial value:`, value);
	}
}

function getPersistKey(el: HTMLElement, callback: (key: string) => any | void): any | void {
	if (!el.hasAttribute('g-scope-persist')) return;
	const persistAttr = el.getAttribute('g-scope-persist');
	if (!persistAttr) return;

	if (!(persistAttr.startsWith('{') && persistAttr.endsWith('}'))) 
		return callback(persistAttr);

	const instance = (el as any).parentElement.__gyos_scope__;
	if (!instance) return;

	// extract expression inside {} and evaluate
	return callback(
		evaluateExpression(persistAttr.slice(1, -1), instance, false)
	);
}

function handleDefinition(el: HTMLElement, scopeAttr: string): ScopeDefinition {
	let definition: ScopeDefinition | undefined;
	
	// Resolve persist key with interpolation support
	const cached = getPersistKey(el, persistKey => scopeCached.get(persistKey));
	if (cached) return cached;

	// Try to parse as inline scope first
	definition = parseInlineScope(scopeAttr);

	// If not inline, look up in registry
	if (!definition) definition = scopeRegistry.get(scopeAttr) || {};

	const autoDef = parseAutoScope(el);
	if (typeof definition === 'function') {
		const factory = definition;
		return context => {
			const instance = factory(context);
			if (!instance || typeof instance !== 'object') return instance;
			Object.keys(autoDef).forEach(key => {
				(instance as any)[key] = (autoDef as any)[key];
			});
			autoBindModelProp(el, instance);
			return instance;
		};
	}
	Object.keys(autoDef).forEach(key => {
		(definition as any)[key] = (autoDef as any)[key];
	});

	// Auto properties: g-model bindings
	autoBindModelProp(el, definition);

	return definition;
}

/**
 * Mount a specific scope
 */
function mountScope(el: HTMLElement, scopeAttr: string): void {
	const definition = handleDefinition(el, scopeAttr);

	// Check if already mounted
	if (getMountedScope(el)) {
		return;
	}

	// Check if element is static (no reactivity)
	if (el.hasAttribute('g-static')) {
		return;
	}

	// Check hydration strategy
	const hydrationStrategy = getHydrationStrategy(el);
	if (hydrationStrategy) {
		hydrationManager.setup(el, hydrationStrategy, () => {
			if (!document.body.contains(el) || isInIgnoredTree(el)) return;
			mountScopeInternal(el, definition);
		});
		return;
	}

	// Mount immediately
	mountScopeInternal(el, definition);
}

/**
 * Internal mount function
 */
function mountScopeInternal(el: HTMLElement, definition: ScopeDefinition): void {

	// Create scope instance first (before context, so we can pass it to createContext)
	let instance: any = null;

	if (typeof definition === 'object') {
		instance = makeReactive(definition);
	}

	// Create component context (needs instance for $watch)
	const context = createContext(el, instance);

	// If function component, call it now with context
	if (typeof definition === 'function' && !instance) {
		const factoryResult = (definition as Function)(context);
		instance = factoryResult && typeof factoryResult === 'object'
			? makeReactive(factoryResult)
			: factoryResult;
	}

	if (!instance || typeof instance !== 'object') {
		DEBUG() && console.error('[GyosJS] Invalid scope definition for element:', el);
		return;
	}

	// Setup onUpdate watcher - track all reactive properties
	if (instance.onUpdate) {
		const version = (instance as any)[SCOPE_VERSION];
		const disposeUpdate = effect(() => {
			if (!version) return;
			// Track version signal - use value in condition so terser won't remove it
			version.value;
			if (getMountedScope(el)) instance.onUpdate.call(instance);
		});

		// Store cleanup for unmount
		if (!instance.__gyos_effects__) {
			instance.__gyos_effects__ = [];
		}
		instance.__gyos_effects__.push(disposeUpdate);
	}

	// Attach context methods
	instance.$refs = context.$refs;
	instance.$emit = context.$emit;
	instance.$on = context.$on;
	instance.$watch = context.$watch;
	instance.$effect = context.$effect;
	instance.$inject = context.inject;
	instance.$provide = context.provide;

	// Parse and bind template (portals will be processed inside *if)
	// Pass onMount callback to be called after parsing (or after hydration triggers)
	parseTemplate(el, instance, () => {
		// Call lifecycle hook after template is parsed
		if (instance.onMount) {
			Promise.resolve(instance.onMount.call(instance)).catch(console.error);
		}
	});

	// Store instance
	registerMountedScope(el, instance);

	// Cache instance if g-scope-persist is set (with interpolation support)
	getPersistKey(el, persistKey => {
		if (!scopeCached.has(persistKey)) {
			scopeCached.set(persistKey, instance);
		}
	});
}

/**
 * Create component context
 */
function createContext(el: HTMLElement, instance: any): ComponentContext {
	const refs: Record<string, HTMLElement> = {};
	const events = new Map<string, Set<Function>>();

	// Find all refs within this scope only
	el.querySelectorAll('[g-ref]').forEach(refEl => {
		if (isInIgnoredTree(refEl)) return;
		const refName = refEl.getAttribute('g-ref');
		if (refName && !hasUnsafePropertyPath(refName)) {
			refs[refName] = refEl as HTMLElement;
		}
	});

	return {
		inject: <T = any>(key: string): T => {
			const injector = getInjector(el);
			return injector.get(key);
		},

		provide: (key: string, value: any) => {
			const injector = getInjector(el);
			injector.set(key, value);
		},

		$refs: refs,

		$emit: (event: string, ...args: any[]) => {
			const handlers = events.get(event);
			if (handlers) {
				handlers.forEach(handler => {
					try {
						handler(...args)
					} catch (e) {
						DEBUG() && console.error(`[Component] Error in handler for event "${event}":`, e);
					}
				});
			}

			// Also dispatch DOM event
			el.dispatchEvent(new CustomEvent(event, { detail: args }));
		},

		$on: (event: string, handler: Function) => {
			if (!events.has(event)) {
				events.set(event, new Set());
			}
			events.get(event)!.add(handler);

			return () => {
				events.get(event)?.delete(handler);
			};
		},

		$watch: (key: string, handler: Function, options: WatchOptions = {}) => {
			// Watch a reactive property for changes (supports nested paths like 'xxx.count')
			if (!instance) {
				DEBUG() && console.warn('[Component] $watch called before instance created');
				return () => { };
			}

			const { immediate = false, deep = false, debounce = 0 } = options;

			let timeoutId: any;

			if (debounce > 0) {
				// Wrap handler with debounce
				const originalHandler = handler;
				handler = (...args: any[]) => {
					clearTimeout(timeoutId);
					timeoutId = setTimeout(() => {
						originalHandler(...args);
					}, debounce);
				};
			}

			// Helper to get nested property value
			const getNestedValue = (obj: any, path: string): any => {
				const keys = path.split('.');
				let current = obj;
				for (const k of keys) {
					if (current == null) return undefined;
					current = current[k];
				}
				return current;
			};

			let oldValue: any;
			let initialized = false;

			// Create effect that tracks the property
			const watchEffect = effect(() => {
				// Access the property to track it (supports nested paths)
				const newValue = getNestedValue(instance, key);
				const clonedValue = deep && typeof newValue === 'object'
					? clone(newValue) // Deep clone for deep watching
					: newValue;

				if (!initialized) {
					oldValue = clonedValue;
					initialized = true;

					// Call immediately if requested
					if (immediate) {
						handler.call(instance, clonedValue, undefined);
					}
					return;
				}

				// Check if value actually changed
				const changed = deep
					? !deepEqual(oldValue, clonedValue)
					: oldValue !== clonedValue;

				if (changed) {
					handler.call(instance, clonedValue, oldValue);
					oldValue = deep && typeof clonedValue === 'object'
						? clone(clonedValue)
						: clonedValue;
				}
			});

			// Store cleanup for unmount
			if (!instance.__gyos_effects__) {
				instance.__gyos_effects__ = [];
			}
			instance.__gyos_effects__.push(watchEffect);

			// Return unwatch function
			return watchEffect;
		},

		$effect: (fn: () => void | (() => void)) => {
			// Shorthand for effect with auto cleanup on unmount
			if (!instance) {
				DEBUG() && console.warn('[Component] $effect called before instance created');
				return () => { };
			}

			const dispose = effect(fn);

			// Auto track for cleanup
			if (!instance.__gyos_effects__) {
				instance.__gyos_effects__ = [];
			}
			instance.__gyos_effects__.push(dispose);

			// Return dispose function
			return dispose;
		}
	};
}
