import { getScopeFromElement } from '../core/scope-registry';
import { isInIgnoredTree, isInStaticParent, walkerDOM } from '../utils/helpers';
import { batch } from '../reactivity/signal';

/**
 * Event Processing
 * Handles @event directives with modifiers (prevent, stop, debounce, key modifiers, etc.)
 */

// Reusable key modifier map for performance
const KEY_MODIFIER_MAP: Record<string, string> = {
    'enter': 'enter',
    'esc': 'escape',
    'escape': 'escape',
    'space': ' ',
    'up': 'arrowup',
    'down': 'arrowdown',
    'left': 'arrowleft',
    'right': 'arrowright',
    'delete': 'delete',
    'tab': 'tab',
};

// Reserved modifiers that aren't key names
const RESERVED_MODIFIERS = new Set(['prevent', 'stop', 'once', 'capture', 'passive', 'debounce', 'outside', 'global']);

/**
 * Execute handler with modifiers (prevent, stop)
 */
function executeHandler(handler: string, scope: any, e: Event, modifiers: string[]): void {
    // Handle prevent/stop modifiers
    if (modifiers.includes('prevent')) e.preventDefault();
    if (modifiers.includes('stop')) e.stopPropagation();

    try {
        const isMethodCall = handler.includes('(');
        if (isMethodCall) {
            // Method call with args: "doSomething()" or "method(arg1, arg2)"
            const fn = new Function('$event', `with(this) { ${handler} }`);
            fn.call(scope, e);
        } else {
            // Check if it's a method name or expression
            const method = scope[handler];
            if (typeof method === 'function') {
                method.call(scope, e);
            } else {
                // Expression like "count++", "count = 0"
                const fn = new Function('$event', `with(this) { ${handler} }`);
                fn.call(scope, e);
            }
        }
    } catch (err) {
        console.error('[GyosJS] Error in event handler:', err);
    }
}

/**
 * Check if keyboard event matches key modifiers
 */
function matchesKeyModifiers(e: Event, modifiers: string[]): boolean {
    // Fast path: no key modifiers
    let hasKeyModifiers = false;
    for (const mod of modifiers) {
        if (!RESERVED_MODIFIERS.has(mod) && !/^\d+$/.test(mod)) {
            hasKeyModifiers = true;
            break;
        }
    }

    if (!hasKeyModifiers) return true;

    const key = (e as KeyboardEvent).key.toLowerCase();

    // Check against key modifier map
    for (const mod of modifiers) {
        if (RESERVED_MODIFIERS.has(mod) || /^\d+$/.test(mod)) continue;

        const mappedKey = KEY_MODIFIER_MAP[mod];
        if (mappedKey) {
            if (key === mappedKey) return true;
        } else if (key === mod.toLowerCase()) {
            return true;
        }
    }

    // Special case: delete can match backspace
    if (key === 'backspace' && modifiers.includes('delete')) return true;

    return false;
}

/**
 * Get debounce delay from modifiers
 */
function getDebounceDelay(modifiers: string[]): number {
    const debounceIndex = modifiers.findIndex(m => m === 'debounce' || /^\d+$/.test(m));
    if (debounceIndex === -1) return 0;

    if (modifiers[debounceIndex] === 'debounce') {
        const nextMod = modifiers[debounceIndex + 1];
        return nextMod && /^\d+$/.test(nextMod) ? parseInt(nextMod) : 300;
    }
    return 0;
}

/**
 * Process event handlers (@click, @input, @keyup.enter, etc.)
 * 
 * Supports modifiers:
 * - prevent: preventDefault()
 * - stop: stopPropagation()
 * - once: addEventListener with once option
 * - debounce.300: Debounce with custom delay
 * - Key modifiers: enter, esc, space, up, down, left, right, delete, tab
 * 
 * @param el - Root element to process
 * @param scope - Scope object for evaluation
 * 
 * @example
 * <button @click="handleClick">Click</button>
 * <button @click.prevent="submit">Submit</button>
 * <input @input.debounce.500="search">
 * <input @keyup.enter="submit">
 */
/**
 * Setup click outside handler with cleanup
 */
function setupClickOutsideHandler(
    element: HTMLElement,
    handler: string,
    modifiers: string[],
    scope: any,
    attrName: string
): void {
	let active = true;
	let timeoutId: number | undefined;

    const clickOutsideHandler = (e: Event) => {
        // e.stopPropagation(); // Optional: prevent other click handlers
        const target = e.target as Node;

        // Check if click is outside element AND element is still in DOM
		if (!document.body.contains(element)) {
			cleanup();
			return;
		}
		if (target instanceof Element && target.closest('[g-ignore-outside-click]')) return;

        if (element !== target && !element.contains(target)) {
            const currentScope = getScopeFromElement(element) || scope;
			if (modifiers.includes('once')) cleanup();
            executeHandler(handler, currentScope, e, modifiers);
        }
    };

    // Cleanup function
    const cleanup = () => {
		if (!active) return;
		active = false;
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
			timeoutId = undefined;
		}
        document.removeEventListener('click', clickOutsideHandler, true);
        observer.disconnect();
    };

    // MutationObserver to detect when element is removed from DOM
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            mutation.removedNodes.forEach((node) => {
				const removedWithElement = node === element ||
					(node instanceof Element && node.contains(element));
				if (removedWithElement && !document.body.contains(element)) {
                    cleanup();
                }
            });
        }
    });

    // Observe document.body for any removal (including *if removing element)
    observer.observe(document.body, { childList: true, subtree: true });

    // Store cleanup in __gyos_effects__
    if (!(element as any).__gyos_effects__) {
        (element as any).__gyos_effects__ = [];
    }
    (element as any).__gyos_effects__.push(cleanup);

    // Use setTimeout to avoid triggering on the same click that opens the element
	timeoutId = window.setTimeout(() => {
		if (active) document.addEventListener('click', clickOutsideHandler, true);
    }, 0);

    element.removeAttribute(attrName);
}

export function processEvents(el: HTMLElement, scope: any): void {
    // TreeWalker is more efficient than querySelectorAll for large DOMs
    const elementsToProcess = walkerDOM(
		el,
		element => !isInIgnoredTree(element) && !element.hasAttribute('g-static'),
		NodeFilter.FILTER_REJECT
	);

    elementsToProcess.unshift(el); // Include root element

    elementsToProcess.forEach(element => {
        // Skip if inside g-static parent (double check)
        if (isInStaticParent(element, el)) return;
		const ownerScope = getScopeFromElement(element as HTMLElement);
		if (ownerScope && ownerScope !== scope) return;

        const attrs = Array.from((element as HTMLElement).attributes);

        attrs.forEach(attr => {
            if (attr.name.startsWith('@')) {
                // Parse event name and modifiers once
                const parts = attr.name.substring(1).split('.');
                const eventName = parts[0];
                const modifiers = parts.slice(1);
                const handler = attr.value;

                // Handle @click.outside modifier
                if (modifiers.includes('outside')) {
                    setupClickOutsideHandler(element as HTMLElement, handler, modifiers, scope, attr.name);
                    return; // Skip normal event binding
                }

                // Setup event handler with debounce support
                const debounceMs = getDebounceDelay(modifiers);
                const isKeyEvent = eventName === 'keyup' || eventName === 'keydown' || eventName === 'keypress';

                // Create dedicated debounce context per element-event pair
                const debounceContext = { timeoutId: 0 };
				let cleanup = () => {};

                const eventHandler = (e: Event) => {
                    // Check key modifiers for keyboard events
                    if (isKeyEvent && !matchesKeyModifiers(e, modifiers)) {
                        return; // Key doesn't match, skip
                    }

                    // Execute handler with optional debounce
                    const execute = () => {
						if (modifiers.includes('once')) cleanup();
                        // Batch in case handler mutates multiple signals
                        batch(() => {
                            const currentScope = getScopeFromElement(element as HTMLElement) || scope;
                            executeHandler(handler, currentScope, e, modifiers);
                        });
                    };

                    if (debounceMs > 0) {
                        clearTimeout(debounceContext.timeoutId);
                        debounceContext.timeoutId = window.setTimeout(execute, debounceMs);
                    } else {
                        execute();
                    }
                };

                // Bind event and store cleanup
                const options: AddEventListenerOptions = {};
                let targetElement: HTMLElement = element as HTMLElement;
                if (modifiers.includes('capture')) options.capture = true;
                if (modifiers.includes('passive')) options.passive = true;
                if (modifiers.includes('global')) targetElement = document.documentElement;

                targetElement.addEventListener(eventName, eventHandler, options);

				cleanup = () => {
					targetElement.removeEventListener(eventName, eventHandler, !!options.capture);
                    if (debounceContext.timeoutId) {
                        clearTimeout(debounceContext.timeoutId);
                    }
                };

                if (!(element as any).__gyos_effects__) {
                    (element as any).__gyos_effects__ = [];
                }
                (element as any).__gyos_effects__.push(cleanup);

                // Remove attribute
				(element as HTMLElement).removeAttribute(attr.name);
            }
        });
    });
}
