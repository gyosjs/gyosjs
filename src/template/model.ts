/**
 * Two-Way Binding (g-model)
 * Handles form input binding with optional modifiers (debounce, number, trim, etc.)
 */
import { isSignal, unref } from '../reactivity/signal';
import { evaluateExpression } from './expression';
import { getScopeFromElement } from '../core/scope-registry';
import { DEBUG, hasUnsafePropertyPath, isInIgnoredTree, isInStaticParent } from '../utils/helpers';
import { queueReactiveEffect } from './effect-queue';
import { ensureModelPropertyOwner } from './scope-chain';

/**
 * Parse path kiểu:
 *  - "user.name"
 *  - "list[0].title"
 *  - "a.b[10].c[2].d"
 */
function parsePath(path: string): Array<string | number> {
    const tokens: Array<string | number> = [];
    const re = /[^.[\]]+|\[(\d+)\]/g;
    let match: RegExpExecArray | null;

    while ((match = re.exec(path))) {
        if (match[1] !== undefined) {
            // là index trong []
            tokens.push(Number(match[1]));
        } else {
            // là tên key bình thường
            tokens.push(match[0]);
        }
    }

    return tokens;
}

/**
 * Set property on scope (supports nested paths, signals, and array indexes)
 * 
 * @param scope - Scope object (hoặc signal bọc object)
 * @param path  - Property path (e.g., "user.name", "items[3].title")
 * @param value - Value to set
 */
function setProperty(scope: any, path: string, value: any): void {
	if (hasUnsafePropertyPath(path)) return;
    const parts = parsePath(path);
    if (parts.length === 0) return;

    let obj = scope;

    // nếu scope là signal thì unwrap
    if (isSignal(obj)) {
        obj = obj.value;
    }

    // đi tới thằng cha của key cuối
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i] as any;
        let next = obj[key];

        // nếu là signal ở giữa thì unwrap
        if (isSignal(next)) {
            next = next.value;
        }

        obj = next;
    }

    const lastKey = parts[parts.length - 1] as any;
    const current = obj[lastKey];

    if (isSignal(current)) {
        current.value = value;
    } else {
        obj[lastKey] = value;
    }
}

/**
 * Process g-model directive for two-way data binding
 * 
 * Supports modifiers:
 * - debounce.300: Debounce input with custom delay
 * - number: Convert value to number
 * - trim: Trim whitespace
 * 
 * @param el - Root element to process
 * @param scope - Scope object for evaluation
 * 
 * @example
 * <input g-model="name">
 * <input g-model.debounce.500="search">
 * <input g-model.number="age">
 * <input type="checkbox" g-model="accepted">
 */
export function processModel(element: HTMLElement, scope: any, root: HTMLElement): void {
	if (isInIgnoredTree(element)) return;

    // Skip if inside g-static parent
    if (isInStaticParent(element, root)) return;

    const attrs = Array.from(element.attributes);

    // Find g-model attribute (with or without modifiers)
    const modelAttr = attrs.find(attr => attr.name.startsWith('g-model'));
    if (!modelAttr) return;

    const inputElement = element as HTMLInputElement;

    // Parse attribute name for modifiers: g-model.debounce.500
    const attrParts = modelAttr.name.split('.');
    const modifiers = attrParts.slice(1); // ['debounce', '500']
    const expr = modelAttr.value; // The actual expression like "searchQuery"

    // Check for debounce modifier
    const hasDebounce = modifiers.includes('debounce');
    let debounceMs = 300; // default
    if (hasDebounce) {
        // Find numeric modifier after 'debounce'
        const numericModifier = modifiers.find(m => /^\d+$/.test(m));
        if (numericModifier) {
            debounceMs = parseInt(numericModifier);
        }
    }

    DEBUG() && console.log('[g-model] Expression:', expr, 'Modifiers:', modifiers, 'Debounce:', debounceMs);

    // Get current scope from element
    const currentScope = getScopeFromElement(element) || scope;
	const modelParts = parsePath(expr);
	if (typeof modelParts[0] === 'string') ensureModelPropertyOwner(currentScope, modelParts[0]);

    // Set initial value (no pipes in v-model)
    const initialValue = evaluateExpression(expr, currentScope, false);
    if (inputElement.type === 'checkbox') {
        inputElement.checked = !!initialValue;
    } else if (inputElement.type === 'radio') {
        inputElement.checked = String(unref(initialValue)) === inputElement.value;
    } else {
        inputElement.value = unref(initialValue);
    }

    // Debounce helper
    let timeoutId: any;
    const debouncedUpdate = (value: any) => {
        if (modifiers.includes('number')) value = Number(value);
        if (modifiers.includes('trim') && typeof value === 'string') value = value.trim();

        if (hasDebounce) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                setProperty(currentScope, expr, value);
            }, debounceMs);
        } else {
            setProperty(currentScope, expr, value);
        }
    };

    const eventInput = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target.type === 'radio' && !target.checked) return;
        const value = target.type === 'checkbox' ? target.checked : target.value;
        debouncedUpdate(value);
    };

    // Listen to input events
    inputElement.addEventListener('input', eventInput);

    const cleanupInput = () => {
		inputElement.removeEventListener('input', eventInput);
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutId = undefined;
		}
	};

    // Update view when model changes
    queueReactiveEffect(element, () => {
        // No pipes in v-model reactive updates
        const newValue = evaluateExpression(expr, currentScope, false);
        if (inputElement.type === 'checkbox') {
            inputElement.checked = !!newValue;
        } else if (inputElement.type === 'radio') {
            inputElement.checked = String(unref(newValue)) === inputElement.value;
        } else if (inputElement.value !== newValue) {
            inputElement.value = unref(newValue);
        }
    });

    // Store cleanup function
    if (!(element as any).__gyos_effects__) {
        (element as any).__gyos_effects__ = [];
    }
    (element as any).__gyos_effects__.push(cleanupInput);

    // Remove the attribute after processing
    element.removeAttribute(modelAttr.name);
}
