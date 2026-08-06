import { portalCreate } from "../core/portal";
import { processFormValidation } from "../form/form-validation";
import { StructuralElement } from "../types";
import { processBindings, processBindingsStatic } from "./bindings";
import { processDirectives, processDirectivesStatic } from "./directives";
import { processEvents } from "./events";
import { processModel } from "./model";
import { processAwaitDirective, processForDirective, processIfChain, processSwitchDirective, setProcessFunction } from "./structurals/structural";
import { processTextNodes, processTextNodesStatic } from "./text";
import { beginEffectCollection, flushEffectCollection } from "./effect-queue";
import { getAllMountedScopes } from "../core/scope-registry";
import { hasStructuralParent, isInIgnoredTree, walkerDOM } from "../utils/helpers";

// Mount function injected from component.ts to avoid circular dependency
let mountFunction: ((el: HTMLElement) => void) | null = null;

export function setMountFunction(fn: (el: HTMLElement) => void): void {
    mountFunction = fn;
}

// Inject process function into structural directives module
setProcessFunction(processParse);

/**
 * Pre-process g-static elements (find and render them before reactive processing)
 */
function processStaticElements(el: HTMLElement, scope: any): void {

    el.removeAttribute('g-static');
    // Mark element as static so children know to skip
    (el as any).__gyos_static__ = true;

    // Render once with initial values (no effects)
    processTextNodesStatic(el, scope);
    processDirectivesStatic(el, scope);
    processBindingsStatic(el, scope);
}

/**
 * Process structural directives (*if and *for) in a single pass
 * Finds all structural directives, sorts by depth, and processes parent-first
 * 
 * @param root - Root element to process
 * @param scope - Current scope for evaluation
 */
function processStructuralDirectives(elements: HTMLElement[], scope: any): void {
    const structuralElements: Array<StructuralElement> = [];
    const root = elements[0];

    elements.forEach(el => {
        const hasIf = el.hasAttribute('*if');
        const hasFor = el.hasAttribute('*for');
        const hasSwitch = el.hasAttribute('*switch');
        const hasAwait = el.hasAttribute('*await');

        if (hasIf || hasFor || hasSwitch || hasAwait) {
            // Calculate depth
            let depth = 0;
            let node: Node | null = el;
            while (node && node !== root) {
                depth++;
                node = node.parentNode;
            }

            let type: 'if' | 'for' | 'switch' | 'await' = 'if';
            if (hasFor) type = 'for';
            else if (hasSwitch) type = 'switch';
            else if (hasAwait) type = 'await';

            structuralElements.push({
                element: el,
                type,
                depth
            });
        }
    });

    // Sort by depth (process parents before children)
    structuralElements.sort((a, b) => a.depth - b.depth);

    // Process each structural directive
    structuralElements.forEach(({ element, type }) => {
        if (type === 'for') {
            processForDirective(element, scope);
        } else if (type === 'if') {
            processIfChain(element, scope);
        } else if (type === 'switch') {
            processSwitchDirective(element, scope);
        } else if (type === 'await') {
            processAwaitDirective(element, scope);
        }
    });
}

const elementInScope = (el: HTMLElement): boolean => {
    const mountedScopes = Array.from(getAllMountedScopes());
    return mountedScopes.some(([mountedEl, _]) => mountedEl.contains(el) && mountedEl !== el);
}

export function processParse(element: HTMLElement, scope: any, fromStructural = false): void {
	if (isInIgnoredTree(element)) return;
    beginEffectCollection();
    const allElements: HTMLElement[] = [
		element,
		...walkerDOM(element, node => !isInIgnoredTree(node), NodeFilter.FILTER_REJECT)
	];

    // If called from structural (fromStructural = true), mount any g-scope elements first
    if (fromStructural && mountFunction) {
        const scopeElements = element.querySelectorAll('[g-scope]');
		scopeElements.forEach(el => {
			if (!isInIgnoredTree(el) && !hasStructuralParent(el)) mountFunction!(el as HTMLElement);
		});
    }

    // IMPORTANT: Process structural directives FIRST!
    processStructuralDirectives(allElements, scope);

    allElements.forEach(el => {
		// Structural processing may replace an element and detach its original subtree.
		if (!document.body.contains(el)) return;
        if (el.attributes.length === 0) return; // Skip if no attributes
        if (elementInScope(el) && !fromStructural) {
            // (fromStructural allows processing newly created elements inside structurals)
            return; // Skip if inside mounted scope
        }

        const attrs = Array.from(el.attributes);

        if (el.hasAttribute('g-static')) {
            // Pre-process g-static elements (mark and render them before reactive processing)
            processStaticElements(el, scope);
        }

        if (el.hasAttribute('g-form')) {
            // Process form validation (g-form, g-validate, g-errors)
            processFormValidation(el, scope);
        }

        const hasDirective = attrs.some(attr => 
            attr.name.startsWith('g-') && !attr.name.startsWith('g-portal'));
        if (hasDirective) processDirectives(el, scope, element);

        const hasBinding = attrs.some(attr => attr.name.startsWith(':'));
        if (hasBinding) processBindings(el, scope, element);

        const hasModel = attrs.some(attr => attr.name.match(/^g-model($|[.])/));
        if (hasModel) processModel(el, scope, element);
    });

    // Process text nodes
    processTextNodes(element, scope);
    // Process events
    processEvents(element, scope);

    // Activate all queued effects after scanning
    flushEffectCollection();

    // Handle portals last (after everything is processed)
    if (element.hasAttribute('g-portal')) {
        const targetSelector = element.getAttribute('g-portal')!;
        portalCreate(element, targetSelector);
    }
}
