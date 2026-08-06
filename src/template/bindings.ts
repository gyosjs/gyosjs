/**
 * Attribute Bindings
 * Handles :attribute directives (:class, :style, :disabled, :href, etc.)
 */
import { evaluateExpression } from './expression';
import { getScopeFromElement } from '../core/scope-registry';
import { isInIgnoredTree, isInStaticParent, DEBUG } from '../utils/helpers';
import { queueReactiveEffect } from './effect-queue';

/**
 * Handle :class binding
 * Supports string or object syntax
 * 
 * @param el - Element to update
 * @param value - Class value (string or object)
 * 
 * @example
 * :class="'active'"              → set className
 * :class="{ active: isActive }" → toggle classes
 */
function handleClassBinding(el: HTMLElement, value: any): void {
    DEBUG() && console.log('[ClassBinding] Element:', el.tagName, 'Value:', value, 'Current classes:', el.className);

    if (typeof value === 'string') {
        el.className = value;
    } else if (typeof value === 'object') {
        Object.entries(value).forEach(([className, condition]) => {
            DEBUG() && console.log(`[ClassBinding] ${className}: ${condition ? 'ADD' : 'REMOVE'}`);
            if (condition) {
                el.classList.add(className);
            } else {
                el.classList.remove(className);
            }
        });
    }
}

/**
 * Handle :style binding
 * Supports string or object syntax
 * 
 * @param el - Element to update
 * @param value - Style value (string or object)
 * 
 * @example
 * :style="'color: red'"                → set style attribute
 * :style="{ color: 'red', fontSize }" → set individual styles
 */
function handleStyleBinding(el: HTMLElement, value: any): void {
    if (typeof value === 'string') {
        el.setAttribute('style', value);
    } else if (typeof value === 'object') {
        Object.entries(value).forEach(([prop, val]) => {
            (el.style as any)[prop] = val;
        });
    }
}

const allowsAttrs = [
    'class',
    'style',
    'disabled',
    'readonly',
    'checked',
    'selected',
    'value',
    'src',
    'href',
    'alt',
    'title'
];

const removeAttrs = ['disabled', 'readonly', 'checked', 'selected'];
const activeUrlElements = new Set(['BASE', 'EMBED', 'IFRAME', 'LINK', 'OBJECT', 'SCRIPT']);

function isSafeBoundUrl(element: HTMLElement, attrName: string, value: unknown): boolean {
	if (attrName !== 'href' && attrName !== 'src') return true;
	if (value === null || value === undefined) return true;
	if (activeUrlElements.has(element.tagName)) return false;
	const normalized = String(value).trim().replace(/[\u0000-\u0020]+/g, '').toLowerCase();
	if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) return false;
	if (!normalized.startsWith('data:')) return true;
	return attrName === 'src'
		&& element instanceof HTMLImageElement
		&& /^data:image\/(?:png|gif|jpe?g|webp|avif);base64,/i.test(normalized);
}

function applyAttributeBinding(element: HTMLElement, attrName: string, value: unknown): void {
	if (!isSafeBoundUrl(element, attrName, value)) {
		element.removeAttribute(attrName);
		DEBUG() && console.warn(`[GyosJS] Blocked unsafe :${attrName} URL`);
		return;
	}
	if (removeAttrs.includes(attrName) && !value) {
		element.removeAttribute(attrName);
	} else {
		element.setAttribute(attrName, String(value ?? ''));
	}
}

/**
 * Process attribute bindings (:class, :style, :disabled, etc.)
 * 
 * @param el - Root element to process
 * @param scope - Scope object for evaluation
 * 
 * @example
 * <div :class="{ active: isActive }"></div>
 * <div :style="{ color: textColor }"></div>
 * <button :disabled="isLoading">Submit</button>
 * <a :href="link">Link</a>
 */
export function processBindings(element: HTMLElement, scope: any, root: HTMLElement): void {
	if (isInIgnoredTree(element)) return;
    // Check el itself first
    if (!element.matches(allowsAttrs.map(a => `[\\:${a}]`).join(', '))) return;

    // Skip if element has structural directive (already processed) or in g-static parent
    if (element.hasAttribute('*if') || element.hasAttribute('*for') || isInStaticParent(element, root)) {
        return;
    }

    const attrs = element.attributes;

    for (let i = 0; i < attrs.length; i++) {
        const attr = attrs[i];
        if (attr.name.startsWith(':')) {
            const attrName = attr.name.substring(1);
            const expr = attr.value;

            queueReactiveEffect(element, () => {
                // Always get fresh scope from element
                let scopeEl: HTMLElement | null = element;
                DEBUG() && console.log('[Binding] Element:', element.tagName, 'Attribute:', attrName, 'Expression:', expr);
                const currentScope = getScopeFromElement(scopeEl!) || scope;
                const value = evaluateExpression(expr, currentScope);

                if (attrName === 'class') {
                    handleClassBinding(element, value);
                } else if (attrName === 'style') {
                    handleStyleBinding(element, value);
                } else {
					applyAttributeBinding(element, attrName, value);
                }
            });
        }
    }
}

/**
 * Process static bindings (no reactivity)
 * 
 * @param el - Root element to process
 * @param scope - Scope object for evaluation
 */
export function processBindingsStatic(el: HTMLElement, scope: any): void {
    const allElements = [el, ...Array.from(el.querySelectorAll(allowsAttrs.map(a => `[\\:${a}]`).join(', ')))] as HTMLElement[];

    allElements.forEach(element => {
		if (isInIgnoredTree(element)) return;
        const attrs = element.attributes;

        for (let i = 0; i < attrs.length; i++) {
            const attr = attrs[i];
            if (attr.name.startsWith(':')) {
                const attrName = attr.name.substring(1);
                const expr = attr.value;
                const value = evaluateExpression(expr, scope);

                if (attrName === 'class') {
                    handleClassBinding(element, value);
                } else if (attrName === 'style') {
                    handleStyleBinding(element, value);
                } else {
					applyAttributeBinding(element, attrName, value);
                }
            }
        }
    });
}
