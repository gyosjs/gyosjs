/**
 * Text Node Processing
 * Handles template string interpolation in text nodes
 */
import { interpolate } from './expression';
import { getScopeFromElement } from '../core/scope-registry';
import { queueReactiveEffect } from './effect-queue';
import { isInIgnoredTree } from '../utils/helpers';

const rawTextContainers = new Set([
	'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TITLE', 'XMP', 'IFRAME', 'NOEMBED', 'NOFRAMES'
]);

function shouldSkipTextNode(node: Node, root: HTMLElement, scope?: any): boolean {
	let parent = node.parentElement;
	while (parent) {
		if (isInIgnoredTree(parent) || rawTextContainers.has(parent.tagName)) return true;
		if (parent.hasAttribute('*if') || parent.hasAttribute('*for')) return true;
		if ((parent as any).__gyos_static__ && (scope !== undefined || parent !== root)) return true;
		if (parent === root) break;
		parent = parent.parentElement;
	}
	if (scope !== undefined && node.parentElement) {
		const owner = getScopeFromElement(node.parentElement);
		if (owner && owner !== scope) return true;
	}
	return false;
}

/**
 * Process text nodes with {expression} interpolation
 * 
 * @param el - Root element to process
 * @param scope - Scope object for evaluation
 * 
 * @example
 * // <div>Hello {name}!</div>
 * processTextNodes(div, { name: 'World' })
 */
export function processTextNodes(el: HTMLElement, scope: any): void {
    const walker = document.createTreeWalker(
        el,
        NodeFilter.SHOW_TEXT,
        null
    );

    const nodesToProcess: { node: Text; template: string }[] = [];

    let node: Node | null;
    while ((node = walker.nextNode())) {
		if (shouldSkipTextNode(node, el, scope)) continue;

        const text = node.textContent || '';
        if (text.includes('{') && text.includes('}')) {
            nodesToProcess.push({
                node: node as Text,
                template: text
            });
        }
    }

    nodesToProcess.forEach(({ node, template }) => {
        const parent = node.parentElement;
        if (!parent) return;

        queueReactiveEffect(parent, () => {
            // Get scope from nearest parent element with scope
            const currentScope = getScopeFromElement(node.parentElement!) || scope;
            node.textContent = interpolate(template, currentScope);
        });
    });
}

/**
 * Process static text nodes (no reactivity, one-time interpolation)
 * 
 * @param el - Root element to process
 * @param scope - Scope object for evaluation
 */
export function processTextNodesStatic(el: HTMLElement, scope: any): void {
    const walker = document.createTreeWalker(
        el,
        NodeFilter.SHOW_TEXT,
        null
    );

    const nodesToProcess: { node: Text; template: string }[] = [];

    let node: Node | null;
    while ((node = walker.nextNode())) {
		if (shouldSkipTextNode(node, el)) continue;
        const text = node.textContent || '';
        if (text.includes('{') && text.includes('}')) {
            nodesToProcess.push({
                node: node as Text,
                template: text
            });
        }
    }

    // One-time interpolation (no reactivity)
    nodesToProcess.forEach(({ node, template }) => {
        node.textContent = interpolate(template, scope);
    });
}
