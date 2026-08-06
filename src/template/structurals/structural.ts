/**
 * Structural Directives (*if, *for)
 * Single-pass parser for conditional and list rendering with transitions
 */
import { evaluateExpression } from '../expression';
import { disposeEffects } from '../cleanup';
import { transitionManager } from '../../core/transition';
import {
	findElementsWithTransition,
	applyEnterTransition,
	applyLeaveTransition,
	parseTransitionConfig
} from './transition-helpers';
import { isInIgnoredTree } from '../../utils/helpers';
import { queueReactiveEffect } from '../effect-queue';
import { signal, untrack } from '../../reactivity/signal';
import { getScopeVersion } from '../../core/reactive';
import { unmountChildScopes } from '../../core/scope-registry';

let processFunction: ((element: HTMLElement, scope: any, fromStructural?: boolean) => void) | null = null;
export function setProcessFunction(fn: (element: HTMLElement, scope: any, fromStructural?: boolean) => void): void {
    processFunction = fn;
}

/**
 * Template cache to avoid expensive cloneNode operations
 * WeakMap ensures garbage collection when template is no longer referenced
 */
const templateCache = new WeakMap<HTMLElement, HTMLElement>();
const FOR_SCOPE_STATE = Symbol('gyos.for-scope-state');

/**
 * Get cached or create cached template clone
 */
function getCachedTemplate(template: HTMLElement): HTMLElement {
	if (!templateCache.has(template)) {
		templateCache.set(template, template.cloneNode(true) as HTMLElement);
	}
	return (templateCache.get(template)!.cloneNode(true) as HTMLElement);
}

/**
 * Lazy scope propagation - only set on root, children inherit via traversal
 * This avoids expensive querySelectorAll('*') on every clone
 */
function setRootScope(element: HTMLElement, scope: any): void {
	(element as any).__gyos_scope__ = scope;
}

/**
 * Create child scope for *for loops
 * Inherits parent scope properties via getters
 * Item and index resolve through mutable state so keyed rows can be reused safely.
 */
function createChildScope(
    parentScope: any,
    itemVar: string,
    list: any[],
    index: number
): any {
    const childScope: any = {};
	const state = signal({ list, index });
	Object.defineProperty(childScope, FOR_SCOPE_STATE, { value: state });

	// handle itemVar include index (e.g., "item, idx in items")
    const [itemName, indexName] = itemVar.split(',').map(s => s.trim());

    // set indexName in scope if provided
	if (indexName) {
        Object.defineProperty(childScope, indexName, {
            get: () => state.value.index,
            enumerable: false,
            configurable: false,
        });
    } else {
		// also provide $index by default
		Object.defineProperty(childScope, '$index', {
			get: () => state.value.index,
			enumerable: true,
			configurable: false,
		});
	}

    // item trong scope: luôn là view của list[$index]
    Object.defineProperty(childScope, itemName, {
        get: () => {
			const current = state.value;
			return current.list[current.index];
		},
        set: (value) => {
			const current = state.peek;
			current.list[current.index] = value;
		},
        enumerable: true,
        configurable: false,
    });

    // Inherit parent properties via getters
    for (const key in parentScope) {
        if (!(key in childScope)) {
            Object.defineProperty(childScope, key, {
                get: () => parentScope[key],
                enumerable: true,
                configurable: true,
            });
        }
    }

    return childScope;
}

/**
 * Process single *for directive
 */
export function processForDirective(element: HTMLElement, currentScope: any): void {
	const expr = element.getAttribute('*for')!;
	const template = element.cloneNode(true) as HTMLElement;
	template.removeAttribute('*for');

	// Check for g-key for optimized diffing
	const keyExpr = template.getAttribute('g-key');
	const hasKey = !!keyExpr;
	if (hasKey) template.removeAttribute('g-key');

	const placeholder = document.createComment('*for');
	element.parentNode?.replaceChild(placeholder, element);

	// Store previous items for key-based diffing
	// WARNING: Use primitive keys (id, string, number) to avoid memory leaks
	// Object keys will prevent garbage collection
	let prevItemsMap = new Map<any, { element: HTMLElement; scope: any }>();
	let prevListRef: any = null;
	let prevVersionValue: number | undefined = undefined;

	queueReactiveEffect(element, () => {
		// Parse: "item in items" or "item, index in items"
		const match = expr.match(/(.+?)\s+in\s+(.+)/);
		if (!match) return;

		const itemVar = match[1].trim();
		const listExpr = match[2].trim();
		const list = evaluateExpression(listExpr, currentScope, false);

		if (!Array.isArray(list)) return;

		// Track structural changes via shared scope version (length/index mutations bump it)
		const version = getScopeVersion(list);
		const versionValue = version ? version.value : undefined;

		// Skip if nothing structurally changed (same list ref and same version)
		if (!hasKey && list === prevListRef && versionValue === prevVersionValue) {
			return;
		}
		prevListRef = list;
		prevVersionValue = versionValue;

		// Avoid subscribing this effect to every item/index while diffing
		untrack(() => {
			if (hasKey) {
				// Key-based diffing
				processForWithKeys(placeholder, template, list, itemVar, keyExpr!, currentScope, prevItemsMap);
			} else {
				// Simple re-render (no diffing)
				processForSimple(placeholder, template, list, itemVar, currentScope);
			}
		});
	});
}

/**
 * Process *for with key-based diffing
 */
function processForWithKeys(
	placeholder: Comment,
	template: HTMLElement,
	list: any[],
	itemVar: string,
	keyExpr: string,
	currentScope: any,
	prevItemsMap: Map<any, { element: HTMLElement; scope: any }>
): void {
	const newItemsMap = new Map<any, any>();
	const orderedKeys: any[] = [];

	// Build new items map
	list.forEach((_, index) => {
		const tempScope = createChildScope(currentScope, itemVar, list, index);
		const key = evaluateExpression(keyExpr, tempScope, false);
		newItemsMap.set(key, { index });
		orderedKeys.push(key);
	});

	// Remove items not in new map
	const toRemove: Array<{ key: any; data: { element: HTMLElement; scope: any } }> = [];
	prevItemsMap.forEach((data, key) => {
		if (!newItemsMap.has(key)) {
			toRemove.push({ key, data });
		}
	});

	// Start remove animations in parallel (don't block add/reorder)
	toRemove.forEach(({ key, data }) => {
		// Stop this leaving node from being reused if the same key is added again.
		prevItemsMap.delete(key);
		const elementsWithTransition = findElementsWithTransition(data.element);
		unmountChildScopes(data.element);
		if (elementsWithTransition.length > 0) {
			// Disable interactions immediately
			data.element.style.pointerEvents = 'none';

			// Animate out in background
			const leavePromises = elementsWithTransition.map(el =>
				applyLeaveTransition(el, data.scope)
			);
			Promise.all(leavePromises).then(() => {
				disposeEffects(data.element, true);
			});
		} else {
			// No transition, remove immediately
			disposeEffects(data.element, true);
		}
	});

	// Add/reorder items immediately (parallel with remove animations)
	let lastPlacedNode: Node = placeholder;
	orderedKeys.forEach((key) => {
		const newItemData = newItemsMap.get(key)!;
		const { index } = newItemData;
		let itemElement: HTMLElement;

		if (prevItemsMap.has(key)) {
			// Existing item - point its persistent scope at the current list position.
			const existingData = prevItemsMap.get(key)!;
			const state = existingData.scope[FOR_SCOPE_STATE];
			const current = state.peek;
			if (current.list !== list || current.index !== index) {
				state.value = { list, index };
			}

			itemElement = existingData.element;
		} else {
			// New item - clone and process
			const clone = getCachedTemplate(template);
			const itemScope = createChildScope(currentScope, itemVar, list, index);

			// Set scope FIRST (needed for parseTransitionConfig to evaluate expressions)
			setRootScope(clone, itemScope);

			// Check for transitions and apply initial state BEFORE DOM insertion
			// This prevents flash by ensuring element starts invisible (opacity-0, scale-0, etc.)
			const elementsWithTransition = findElementsWithTransition(clone);
			if (elementsWithTransition.length > 0) {
				elementsWithTransition.forEach(el => {
					const transitionConfig = parseTransitionConfig(el, itemScope);
					if (transitionConfig) {
						const config = transitionManager.getConfig(transitionConfig.name);
						if (config.enterFrom) {
							// Apply enterFrom classes (opacity-0, scale-50, translate-y-100, etc.)
							config.enterFrom.split(/\s+/).forEach(cls => {
								if (cls) el.classList.add(cls);
							});
						}
					}
				});
			}

			// Insert to DOM (element already has enterFrom, so no flash)
			itemElement = clone;
			placeholder.parentNode?.insertBefore(clone, lastPlacedNode.nextSibling);

			// Process (parse {} expressions, bindings, etc.)
			processFunction && processFunction(clone, itemScope, true);

			prevItemsMap.set(key, { element: clone, scope: itemScope });

			// Animate: transitionManager.enter() will remove enterFrom and add enterTo
			if (elementsWithTransition.length > 0) {
				requestAnimationFrame(() => {
					elementsWithTransition.forEach(el => applyEnterTransition(el, itemScope));
				});
			}
		}

		// Place each managed row directly after the previous row. This does not
		// depend on formatting whitespace or unrelated sibling nodes.
		if (itemElement !== lastPlacedNode.nextSibling) {
			placeholder.parentNode?.insertBefore(itemElement, lastPlacedNode.nextSibling);
		}
		lastPlacedNode = itemElement;
	});
}

/**
 * Process *for without keys (simple re-render)
 */
function processForSimple(
	placeholder: Comment,
	template: HTMLElement,
	list: any[],
	itemVar: string,
	currentScope: any
): void {
	// Remove all existing items
	let next = placeholder.nextSibling;
	while (next && next.nodeType !== Node.COMMENT_NODE) {
		const toRemove = next;
		next = next.nextSibling;
		if (toRemove instanceof Element) {
			unmountChildScopes(toRemove as HTMLElement);
			disposeEffects(toRemove, true);
		}
	}

	// Render new items
	// Track last inserted node to maintain order
	let lastInserted: Node = placeholder;

	list.forEach((_, index) => {
		const clone = getCachedTemplate(template);
		const itemScope = createChildScope(currentScope, itemVar, list, index);

		setRootScope(clone, itemScope);

		// Check for transitions BEFORE insert (to apply initial state)
		const elementsWithTransition = findElementsWithTransition(clone);
		if (elementsWithTransition.length > 0) {
			elementsWithTransition.forEach(el => {
				// Apply enterFrom state before inserting to prevent flash
				const transitionConfig = parseTransitionConfig(el, itemScope);
				if (transitionConfig) {
					const config = transitionManager.getConfig(transitionConfig.name);
					if (config.enterFrom) {
						// Apply enterFrom classes (e.g., "opacity-0 scale-50")
						config.enterFrom.split(/\s+/).forEach(cls => {
							if (cls) el.classList.add(cls);
						});
					}
				}
			});
		}

		// Insert AFTER last inserted node to maintain order
		placeholder.parentNode?.insertBefore(clone, lastInserted.nextSibling);
		lastInserted = clone; // Update last inserted reference

		// Process (this parses {} expressions and applies bindings)
		processFunction && processFunction(clone, itemScope, true);

		// Apply enter transition
		if (elementsWithTransition.length > 0) {
			requestAnimationFrame(() => {
				elementsWithTransition.forEach(el => applyEnterTransition(el, itemScope));
			});
		}
	});
}

/**
 * Process *if chain with *elseif and *else support
 * Example:
 * <div *if="x > 5">Greater than 5</div>
 * <div *elseif="x > 0">Greater than 0</div>
 * <div *else>Zero or negative</div>
 */
export function processIfChain(element: HTMLElement, currentScope: any): void {
	// Collect the entire if-elseif-else chain
	const chain: Array<{ element: HTMLElement; condition: string | null }> = [];

	// Start with *if
	chain.push({
		element: element,
		condition: element.getAttribute('*if')!
	});

	// Collect siblings with *elseif or *else
	let sibling = element.nextElementSibling as HTMLElement | null;
	while (sibling) {
		if (isInIgnoredTree(sibling)) break;
		if (sibling.hasAttribute('*elseif')) {
			chain.push({
				element: sibling,
				condition: sibling.getAttribute('*elseif')!
			});
			const next = sibling.nextElementSibling as HTMLElement | null;
			sibling.remove(); // Remove from DOM temporarily
			sibling = next;
		} else if (sibling.hasAttribute('*else')) {
			chain.push({
				element: sibling,
				condition: null // *else has no condition (always true if reached)
			});
			sibling.remove(); // Remove from DOM temporarily
			break; // *else ends the chain
		} else {
			break; // Not part of chain
		}
	}

	// Create templates for each branch
	const templates = chain.map(({ element, condition }) => {
		const template = element.cloneNode(true) as HTMLElement;
		template.removeAttribute('*if');
		template.removeAttribute('*elseif');
		template.removeAttribute('*else');
		return { template, condition };
	});

	const placeholder = document.createComment('*if-chain');
	element.parentNode?.replaceChild(placeholder, element);

	let currentElement: HTMLElement | null = null;
	let currentIndex: number = -1;

	queueReactiveEffect(element, () => {
		// Find first truthy condition
		let matchedIndex = -1;
		for (let i = 0; i < templates.length; i++) {
			const { condition } = templates[i];
			if (condition === null) {
				// *else always matches
				matchedIndex = i;
				break;
			}
			const value = evaluateExpression(condition, currentScope, false);
			if (value) {
				matchedIndex = i;
				break;
			}
		}

		// If same branch, do nothing
		if (matchedIndex === currentIndex) return;

		// Remove old element (run in background, don't block new element)
		if (currentElement) {
			const elementToRemove = currentElement;
			unmountChildScopes(elementToRemove);
			currentElement = null;

			const elementsWithTransition = findElementsWithTransition(elementToRemove);
			if (elementsWithTransition.length > 0) {
				// Disable interactions immediately
				elementToRemove.style.pointerEvents = 'none';

				// Animate out in background (parallel with add)
				const leavePromises = elementsWithTransition.map(el =>
					applyLeaveTransition(el, currentScope)
				);

				Promise.all(leavePromises).then(() => {
					disposeEffects(elementToRemove, true);
				});
			} else {
				// No transition, remove immediately
				disposeEffects(elementToRemove, true);
			}
		}

		// Add new element immediately (parallel with remove animation)
		if (matchedIndex !== -1) {
			const { template } = templates[matchedIndex];
			currentElement = getCachedTemplate(template);
			currentIndex = matchedIndex;

			setRootScope(currentElement, currentScope);

			// Apply transition initial state
			const elementsWithTransition = findElementsWithTransition(currentElement);
			if (elementsWithTransition.length > 0) {
				elementsWithTransition.forEach(el => {
					const transitionConfig = parseTransitionConfig(el, currentScope);
					if (transitionConfig) {
						const config = transitionManager.getConfig(transitionConfig.name);
						if (config.enterFrom) {
							config.enterFrom.split(/\s+/).forEach(cls => {
								if (cls) el.classList.add(cls);
							});
						}
					}
				});
			}

			placeholder.parentNode?.insertBefore(currentElement, placeholder.nextSibling);
			processFunction && processFunction(currentElement, currentScope, true);

			// Animate enter
			if (elementsWithTransition.length > 0) {
				requestAnimationFrame(() => {
					elementsWithTransition.forEach(el => applyEnterTransition(el, currentScope));
				});
			}
		} else {
			// No matching branch, clear index
			currentIndex = -1;
		}
	});
}

/**
 * Process *switch directive with *case and *default
 * Example:
 * <div *switch="status">
 *   <div *case="'pending'">Pending...</div>
 *   <div *case="'success'">Success!</div>
 *   <div *case="'error'">Error occurred</div>
 *   <div *default>Unknown status</div>
 * </div>
 */
export function processSwitchDirective(element: HTMLElement, currentScope: any): void {
	const switchExpr = element.getAttribute('*switch')!;

	// Collect all *case and *default children
	const cases: Array<{ element: HTMLElement; value: string | null }> = [];
	const children = Array.from(element.children) as HTMLElement[];

	children.forEach(child => {
		if (isInIgnoredTree(child)) return;
		if (child.hasAttribute('*case')) {
			cases.push({
				element: child,
				value: child.getAttribute('*case')!
			});
		} else if (child.hasAttribute('*default')) {
			cases.push({
				element: child,
				value: null // *default matches anything
			});
		}
	});

	// Create templates
	const templates = cases.map(({ element, value }) => {
		const template = element.cloneNode(true) as HTMLElement;
		template.removeAttribute('*case');
		template.removeAttribute('*default');
		element.remove(); // Remove original from DOM
		return { template, value };
	});

	// Remove *switch attribute and keep container
	element.removeAttribute('*switch');

	// Create placeholder for matched element
	const placeholder = document.createComment('*switch-content');
	element.appendChild(placeholder);

	let currentElement: HTMLElement | null = null;
	let currentIndex: number = -1;

	queueReactiveEffect(element, () => {
		const switchValue = evaluateExpression(switchExpr, currentScope, false);

		// Find matching case
		let matchedIndex = -1;
		for (let i = 0; i < templates.length; i++) {
			const { value } = templates[i];
			if (value === null) {
				// *default matches (only if no other case matched)
				if (matchedIndex === -1) {
					matchedIndex = i;
				}
				break;
			}
			const caseValue = evaluateExpression(value, currentScope, false);
			if (switchValue === caseValue) {
				matchedIndex = i;
				break;
			}
		}

		// If same case, do nothing
		if (matchedIndex === currentIndex) return;

		// Remove old element (run in background, don't block new element)
		if (currentElement) {
			const elementToRemove = currentElement;
			unmountChildScopes(elementToRemove);
			currentElement = null;

			const elementsWithTransition = findElementsWithTransition(elementToRemove);
			if (elementsWithTransition.length > 0) {
				// Disable interactions immediately
				elementToRemove.style.pointerEvents = 'none';

				// Animate out in background (parallel with add)
				const leavePromises = elementsWithTransition.map(el =>
					applyLeaveTransition(el, currentScope)
				);

				Promise.all(leavePromises).then(() => {
					disposeEffects(elementToRemove, true);
				});
			} else {
				// No transition, remove immediately
				disposeEffects(elementToRemove, true);
			}
		}

		// Add new element immediately (parallel with remove animation)
		if (matchedIndex !== -1) {
			const { template } = templates[matchedIndex];
			currentElement = getCachedTemplate(template);
			currentIndex = matchedIndex;

			setRootScope(currentElement, currentScope);

			// Apply transition initial state
			const elementsWithTransition = findElementsWithTransition(currentElement);
			if (elementsWithTransition.length > 0) {
				elementsWithTransition.forEach(el => {
					const transitionConfig = parseTransitionConfig(el, currentScope);
					if (transitionConfig) {
						const config = transitionManager.getConfig(transitionConfig.name);
						if (config.enterFrom) {
							config.enterFrom.split(/\s+/).forEach(cls => {
								if (cls) el.classList.add(cls);
							});
						}
					}
				});
			}

			placeholder.parentNode?.insertBefore(currentElement, placeholder.nextSibling);
			processFunction && processFunction(currentElement, currentScope, true);

			// Animate enter
			if (elementsWithTransition.length > 0) {
				requestAnimationFrame(() => {
					elementsWithTransition.forEach(el => applyEnterTransition(el, currentScope));
				});
			}
		} else {
			// No matching case, clear index
			currentIndex = -1;
		}
	});
}

/**
 * Process *await directive for async data handling
 * 
 * Handles Promise-based async operations with pending/then/catch states.
 * Children elements with *pending, *then, and *catch are shown conditionally.
 * 
 * Example:
 * <div *await="fetchUsers()">
 *   <div *pending>Loading...</div>
 *   <div *then="users">
 *     <div *for="user in users">{user.name}</div>
 *   </div>
 *   <div *catch="error">Error: {error.message}</div>
 * </div>
 */
export function processAwaitDirective(element: HTMLElement, currentScope: any): void {
	const awaitExpr = element.getAttribute('*await')!;
	element.removeAttribute('*await');

	// Find children with *pending, *then, *catch
	const children = Array.from(element.children) as HTMLElement[];
	let pendingTemplate: HTMLElement | null = null;
	let thenTemplate: { template: HTMLElement; varName: string | null } | null = null;
	let catchTemplate: { template: HTMLElement; varName: string | null } | null = null;

	children.forEach(child => {
		if (isInIgnoredTree(child)) return;
		if (child.hasAttribute('*pending')) {
			pendingTemplate = child.cloneNode(true) as HTMLElement;
			pendingTemplate.removeAttribute('*pending');
			child.remove();
		} else if (child.hasAttribute('*then')) {
			const varName = child.getAttribute('*then') || null;
			thenTemplate = {
				template: child.cloneNode(true) as HTMLElement,
				varName
			};
			thenTemplate.template.removeAttribute('*then');
			child.remove();
		} else if (child.hasAttribute('*catch')) {
			const varName = child.getAttribute('*catch') || null;
			catchTemplate = {
				template: child.cloneNode(true) as HTMLElement,
				varName
			};
			catchTemplate.template.removeAttribute('*catch');
			child.remove();
		}
	});

	// Create placeholder
	const placeholder = document.createComment('*await');
	element.appendChild(placeholder);

	let currentElement: HTMLElement | null = null;
	let currentState: 'pending' | 'fulfilled' | 'rejected' = 'pending';
	let requestVersion = 0;

	// Helper to render state
	const renderState = (state: 'pending' | 'fulfilled' | 'rejected', data?: any) => {
		// Remove old element
		if (currentElement) {
			const elemToRemove = currentElement;
			currentElement = null;

			const elementsWithTransition = findElementsWithTransition(elemToRemove);
			if (elementsWithTransition.length > 0) {
				elemToRemove.style.pointerEvents = 'none';
				const leavePromises = elementsWithTransition.map(el =>
					applyLeaveTransition(el, currentScope)
				);
				Promise.all(leavePromises).then(() => {
					disposeEffects(elemToRemove, true);
				});
			} else {
				disposeEffects(elemToRemove, true);
			}
		}

		// Add new element based on state
		let template: HTMLElement | null = null;
		let scope = currentScope;

		if (state === 'pending' && pendingTemplate) {
			template = pendingTemplate;
		} else if (state === 'fulfilled' && thenTemplate) {
			template = thenTemplate.template;
			// Create child scope with data if varName provided
			if (thenTemplate.varName && data !== undefined) {
				scope = { ...currentScope, [thenTemplate.varName]: data };
			}
		} else if (state === 'rejected' && catchTemplate) {
			template = catchTemplate.template;
			// Create child scope with error if varName provided
			if (catchTemplate.varName && data !== undefined) {
				scope = { ...currentScope, [catchTemplate.varName]: data };
			}
		}

		if (template) {
			currentElement = getCachedTemplate(template);
			currentState = state;

			setRootScope(currentElement, scope);

			// Apply transition initial state
			const elementsWithTransition = findElementsWithTransition(currentElement);
			if (elementsWithTransition.length > 0) {
				elementsWithTransition.forEach(el => {
					const transitionConfig = parseTransitionConfig(el, scope);
					if (transitionConfig) {
						const config = transitionManager.getConfig(transitionConfig.name);
						if (config.enterFrom) {
							config.enterFrom.split(/\s+/).forEach(cls => {
								if (cls) el.classList.add(cls);
							});
						}
					}
				});
			}

			placeholder.parentNode?.insertBefore(currentElement, placeholder.nextSibling);
			processFunction && processFunction(currentElement, scope, true);

			// Animate enter
			if (elementsWithTransition.length > 0) {
				requestAnimationFrame(() => {
					elementsWithTransition.forEach(el => applyEnterTransition(el, scope));
				});
			}
		}
	};

	// Initial state: pending
	renderState('pending');

	// Track promise expression
	queueReactiveEffect(element, () => {
		const promiseOrValue = evaluateExpression(awaitExpr, currentScope, false);
		const version = ++requestVersion;

		// Handle non-promise values
		if (!(promiseOrValue instanceof Promise)) {
			renderState('fulfilled', promiseOrValue);
			return;
		}

		// Handle promise
		renderState('pending');

		promiseOrValue
			.then((data) => {
				// Ignore a stale promise after the expression starts another request.
				if (version === requestVersion && currentState === 'pending') {
					renderState('fulfilled', data);
				}
			})
			.catch((error) => {
				if (version === requestVersion && currentState === 'pending') {
					renderState('rejected', error);
				}
			});
	});
}
