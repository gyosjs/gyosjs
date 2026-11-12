import { portalCreate } from "../core/portal";
import { processFormValidation } from "../form/form-validation";
import { StructuralElement } from "../types";
import { processBindings } from "./bindings";
import { processDirectives } from "./directives";
import { processEvents } from "./events";
import { processModel } from "./model";
import { processAwaitDirective, processForDirective, processIfChain, processSwitchDirective, setProcessFunction } from "./structurals/structural";
import { processTextNodes } from "./text";
import { beginEffectCollection, flushEffectCollection } from "./effect-queue";
import { getScopeFromElement } from "../core/scope-registry";
import { hasStructuralParent, isInIgnoredTree, isInStaticTree, walkerDOM } from "../utils/helpers";
import { cleanupGeneration } from './lifetime';

// Mount function injected from component.ts to avoid circular dependency
let mountFunction: ((el: HTMLElement) => void) | null = null;

export function setMountFunction(fn: (el: HTMLElement) => void): void {
    mountFunction = fn;
}

// Inject process function into structural directives module
setProcessFunction(processParse);

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
        // Await branches are detached and parsed only after their alias scope exists.
        // Do not evaluate nested structural expressions during the parent scan.
        if (isAwaitBranchDescendant(el)) return;

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
        // Parent directives parse their clones, not the detached original tree.
        if (!root.contains(element) || elementBelongsToAnotherScope(element, scope)) return;
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

function isAwaitBranchDescendant(element: HTMLElement): boolean {
    let child = element;
    let parent = element.parentElement;

    while (parent && parent !== document.body) {
        if (parent.hasAttribute('*await') && (
            child.hasAttribute('*pending') ||
            child.hasAttribute('*then') ||
            child.hasAttribute('*catch')
        )) {
            return true;
        }

        child = parent;
        parent = parent.parentElement;
    }

    return false;
}

const elementBelongsToAnotherScope = (el: HTMLElement, scope: any): boolean => {
	const owner = getScopeFromElement(el);
	return Boolean(owner && owner !== scope);
};

export function processParse(element: HTMLElement, scope: any, fromStructural = false): void {
	if (isInIgnoredTree(element)) return;
    const generation = cleanupGeneration(element);
    if (fromStructural && element.hasAttribute('g-scope') && mountFunction) {
        mountFunction(element);
        return;
    }
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
		if (cleanupGeneration(element) !== generation) return;
		// Structural processing may replace an element and detach its original subtree.
		if (!document.body.contains(el)) return;
        if (el.attributes.length === 0) return; // Skip if no attributes
        if (elementBelongsToAnotherScope(el, scope)) {
            // (fromStructural allows processing newly created elements inside structurals)
            return; // Skip if inside mounted scope
        }

        const attrs = Array.from(el.attributes);

        const isStatic = isInStaticTree(el);
        if (!isStatic && (el.hasAttribute('g-form') || el.hasAttribute('g-validate') || el.hasAttribute('g-errors'))) {
            // Process form validation (g-form, g-validate, g-errors)
            processFormValidation(el, scope);
        }

        const hasDirective = attrs.some(attr => 
            attr.name.startsWith('g-') && !attr.name.startsWith('g-portal'));
        if (hasDirective) processDirectives(el, scope);

        const hasBinding = attrs.some(attr => attr.name.startsWith(':'));
        if (hasBinding) processBindings(el, scope);

        const hasModel = attrs.some(attr => attr.name.match(/^g-model($|[.])/));
        if (hasModel && !isStatic) processModel(el, scope, element);
    });

    // Process text nodes
    if (cleanupGeneration(element) === generation) {
        processTextNodes(element, scope);
        // Process events
        processEvents(element, scope);
    }

    // Activate all queued effects after scanning
    flushEffectCollection();

    // Handle portals last (after everything is processed)
    if (cleanupGeneration(element) === generation && !isInStaticTree(element) && element.hasAttribute('g-portal')) {
        const targetSelector = element.getAttribute('g-portal')!;
        portalCreate(element, targetSelector);
    }
}
