/**
 * Transition Helper Utilities
 * Shared utilities for handling transitions in structural directives
 */
import { transitionManager } from '../../core/transition';
import { DEBUG, isInIgnoredTree, walkerDOM } from '../../utils/helpers';
import { evaluateExpression } from '../expression';

/**
 * Parse transition name from attribute value
 * Handles:
 * 1. Literal string: "fade" or "slide-down"
 * 2. Expression with {}: "{transition}"
 * 3. Expression without {}: "transition" (evaluate as variable)
 * 
 * @param attrValue - The g-transition attribute value
 * @param scope - Current scope for expression evaluation
 * @returns The transition name (string)
 */
export function parseTransitionName(attrValue: string, scope: any): string {
    if (attrValue.includes('{') && attrValue.includes('}')) {
        // Extract expression from {} and evaluate it
        const match = attrValue.match(/\{([^}]+)\}/);
        if (match) {
            return evaluateExpression(match[1].trim(), scope);
        }
    }

    // Try to evaluate as expression first (variable name)
    // If it fails or returns undefined, use as literal string
    try {
        const evaluated = evaluateExpression(attrValue, scope);
        if (evaluated !== undefined && evaluated !== null) {
            return evaluated;
        }
    } catch (e) {
        // If evaluation fails, use value as literal string (built-in transition name)
    }

    return attrValue;
}

/**
 * Parse transition config from element's g-transition attribute
 * Extracts transition name and custom duration modifier
 * 
 * @param element - Element with g-transition attribute
 * @param scope - Current scope for expression evaluation
 * @returns { name: string, duration?: number } or null if no transition
 */
export function parseTransitionConfig(element: HTMLElement, scope: any): { name: string; duration?: number } | null {
    const attrs = Array.from(element.attributes);
    const transitionAttr = attrs.find(attr => attr.name.startsWith('g-transition'));

    if (!transitionAttr) return null;

    // Parse modifiers from attribute name: g-transition.500
    const attrParts = transitionAttr.name.split('.');
    const modifiers = attrParts.slice(1); // ['500'] or []
    const customDuration = modifiers.find(m => /^\d+$/.test(m));

    const transitionName = parseTransitionName(transitionAttr.value, scope);

    return {
        name: transitionName,
        duration: customDuration ? parseInt(customDuration) : undefined
    };
}

/**
 * Find all elements with g-transition attribute
 * Searches root element and all descendants
 * 
 * @param root - Root element to search from
 * @returns Array of elements with g-transition
 */
export function findElementsWithTransition(root: HTMLElement): HTMLElement[] {
	if (isInIgnoredTree(root)) return [];
    const elements: HTMLElement[] = [];

    // Check root element
    if (Array.from(root.attributes).some(attr => attr.name.startsWith('g-transition'))) {
        elements.push(root);
    }

    // Check all descendants
    const allDescendants = walkerDOM(
		root,
		el => !isInIgnoredTree(el),
		NodeFilter.FILTER_REJECT
	).filter(el => Array.from(el.attributes).some(attr => attr.name.startsWith('g-transition')));
    elements.push(...allDescendants);

    return elements;
}

/**
 * Propagate scope to element and all descendants
 * Only sets scope if not already set (preserves existing scopes)
 * 
 * @param element - Root element to propagate scope to
 * @param scope - Scope object to propagate
 * @param skipIfExists - If true, don't overwrite existing scopes (default: true)
 */
export function propagateScopeToTree(element: Element, scope: any, skipIfExists: boolean = true): void {
	if (isInIgnoredTree(element)) return;
    if (skipIfExists && (element as any).__gyos_scope__) {
        // Scope already exists, skip
        DEBUG() && console.log('[Scope] SKIPPED (already has scope):', element.tagName, (element as HTMLElement).className || '(no class)');
    } else {
        (element as any).__gyos_scope__ = scope;
        DEBUG() && console.log('[Scope] Propagated to:', element.tagName, (element as HTMLElement).className || '(no class)');
    }

    Array.from(element.children).forEach(child => {
        propagateScopeToTree(child, scope, skipIfExists);
    });
}

/**
 * Apply enter transition to an element
 * Handles transition config parsing and application
 * 
 * @param element - Element to apply transition to
 * @param scope - Current scope for expression evaluation
 * @returns Promise that resolves when transition completes
 */
export function applyEnterTransition(element: HTMLElement, scope: any, interruptLeave = false): Promise<boolean> {
    const config = parseTransitionConfig(element, scope);
    if (!config) return Promise.resolve(true);

    DEBUG() && console.log('[Transition] Enter with:', config.name, config.duration ? `(${config.duration}ms)` : '', 'on', element.tagName, element.className);

    const transitionConfig = { ...transitionManager.getConfig(config.name) };
    if (config.duration) {
        transitionConfig.duration = config.duration;
    }

    return transitionManager.enter(element, transitionConfig, interruptLeave);
}

/**
 * Apply leave transition to an element
 * Handles transition config parsing and application
 * 
 * @param element - Element to apply transition to
 * @param scope - Current scope for expression evaluation
 * @returns Promise that resolves when transition completes
 */
export function applyLeaveTransition(element: HTMLElement, scope: any, removeElement = true): Promise<boolean> {
    const config = parseTransitionConfig(element, scope);
    if (!config) return Promise.resolve(true);

    DEBUG() && console.log('[Transition] Leave with:', config.name, config.duration ? `(${config.duration}ms)` : '', 'on', element.tagName, element.className);

    const transitionConfig = { ...transitionManager.getConfig(config.name) };
    if (config.duration) {
        transitionConfig.duration = config.duration;
    }

	return transitionManager.leave(element, transitionConfig, removeElement);
}
