import { log } from "../../utils/helpers";
import { executeScripts, executeScriptsInNodes } from "./script";

interface SwapOptions {
	syncRootAttributes?: boolean;
	signal?: AbortSignal;
	beforeScripts?: () => Promise<void>;
}

function syncAttributes(target: Element, source: Element): void {
	const sourceAttributes = new Set<string>();
	Array.from(source.attributes).forEach(attribute => {
		sourceAttributes.add(attribute.name);
		if (target.getAttribute(attribute.name) !== attribute.value) {
			target.setAttribute(attribute.name, attribute.value);
		}
	});
	Array.from(target.attributes).forEach(attribute => {
		if (!sourceAttributes.has(attribute.name)) {
			target.removeAttribute(attribute.name);
		}
	});
}

export async function performSwap(
	target: HTMLElement,
	src: HTMLElement,
	mode: string,
	options: SwapOptions = {}
): Promise<HTMLElement> {
	const normalized = (mode || 'inner').toLowerCase();
	// Importing recreates browser-managed elements such as audio/video in the live
	// document. Adopting them from DOMParser's inert document can leave media broken.
	const incoming = document.importNode(src, true);
	const incomingChildren = Array.from(incoming.childNodes);

	let result: HTMLElement;

	if (normalized === 'replace') { 
		// replace: replace the target element with the source element
		log('[GyosRouter] performing replace swap');
		target.replaceWith(incoming);
		result = incoming as HTMLElement;
	} else if (normalized === 'morph') { 
		// morph: morph the target element into the source element
		log('[GyosRouter] performing morph swap');
		if (target.tagName !== incoming.tagName) {
			target.replaceWith(incoming);
			result = incoming as HTMLElement;
		} else {
			morph(target, incoming);
			result = target;
		}
	} else if (normalized === 'append') { 
		// append: append the source element to the target element
		log('[GyosRouter] performing append swap');
		target.append(...incomingChildren);
		result = target;
	} else if (normalized === 'prepend') { 
		// prepend: prepend the source element to the target element
		log('[GyosRouter] performing prepend swap');
		target.prepend(...incomingChildren);
		result = target;
	} else { 
		// inner: move children to preserve node identity (e.g., g-persist state)
		log('[GyosRouter] performing inner swap');
		if (options.syncRootAttributes) {
			syncAttributes(target, incoming);
		}
		target.replaceChildren();
		while (incoming.firstChild) {
			target.appendChild(incoming.firstChild);
		}
		result = target;
	}

	await options.beforeScripts?.();

	// Additive swaps must not re-run scripts that already existed in the target.
	if (normalized === 'append' || normalized === 'prepend') {
		await executeScriptsInNodes(incomingChildren, options.signal);
	} else {
		await executeScripts(result, options.signal);
	}
	return result;
}

function morph(target: HTMLElement, src: HTMLElement): void {
    // Simple keyed morph keyed by tag + id + data-gyos-persist-id + data-gyos-key
    const isPersist = (node: Node | null) => node instanceof Element && !!node.closest('[g-persist]');
    const isPersistComment = (node: Node | null): boolean => {
        return node?.nodeType === Node.COMMENT_NODE && !!node.nodeValue?.includes('g-persist:');
    };
    const getPersistKey = (node: Node | null): string | null => {
        if (node instanceof Element) {
            return node.getAttribute('g-persist') || null;
        }
        if (isPersistComment(node)) {
            // Extract key from comment: <!-- g-persist:player --> → "player"
            const match = node!.nodeValue!.match(/g-persist:(\S+)/);
            return match ? match[1] : null;
        }
        return null;
    };
    const keyFor = (el: Element): string =>
        `${el.tagName}|${(el as HTMLElement).id || ''}|${(el as HTMLElement).dataset.gyosPersistId || ''}|${(el as HTMLElement).dataset.gyosKey || ''}`;
	const explicitKeyFor = (node: Node | null): string | null => {
		if (!(node instanceof HTMLElement)) return null;
		const { id, dataset } = node;
		if (!id && !dataset.gyosPersistId && !dataset.gyosKey) return null;
		return keyFor(node);
	};

	type FormState =
		| { kind: 'input'; type: string; value?: string; checked?: boolean }
		| { kind: 'select'; values: string[] }
		| { kind: 'textarea'; value: string };

	const captureDirtyFormState = (element: Element): FormState | null => {
		if (element instanceof HTMLInputElement) {
			const checkable = element.type === 'checkbox' || element.type === 'radio';
			const valueDirty = element.type !== 'file' && element.value !== element.defaultValue;
			const checkedDirty = checkable && element.checked !== element.defaultChecked;
			if (!valueDirty && !checkedDirty) return null;
			return {
				kind: 'input',
				type: element.type,
				value: valueDirty ? element.value : undefined,
				checked: checkedDirty ? element.checked : undefined
			};
		}
		if (element instanceof HTMLSelectElement) {
			const options = Array.from(element.options);
			if (!options.some(option => option.selected !== option.defaultSelected)) return null;
			return {
				kind: 'select',
				values: options.filter(option => option.selected).map(option => option.value)
			};
		}
		if (element instanceof HTMLTextAreaElement && element.value !== element.defaultValue) {
			return { kind: 'textarea', value: element.value };
		}
		return null;
	};

	const restoreDirtyFormState = (element: Element, state: FormState | null): void => {
		if (!state) return;
		if (state.kind === 'input' && element instanceof HTMLInputElement) {
			if (element.type !== state.type) return;
			if (state.value !== undefined) element.value = state.value;
			if (state.checked !== undefined) element.checked = state.checked;
			return;
		}
		if (state.kind === 'select' && element instanceof HTMLSelectElement) {
			const values = new Set(state.values);
			const hasMatchingOption = values.size === 0
				|| Array.from(element.options).some(option => values.has(option.value));
			if (hasMatchingOption) {
				Array.from(element.options).forEach(option => {
					option.selected = values.has(option.value);
				});
			}
			return;
		}
		if (state.kind === 'textarea' && element instanceof HTMLTextAreaElement) {
			element.value = state.value;
		}
	};

	const morphNode = (fromNode: Node | null, toNode: Node | null) => {
        if (!fromNode || !toNode) return;
        if (fromNode === toNode) return;

        // Text nodes
        if (fromNode.nodeType === Node.TEXT_NODE && toNode.nodeType === Node.TEXT_NODE) {
            if (fromNode.textContent !== toNode.textContent) {
                fromNode.textContent = toNode.textContent;
            }
            return;
        }

        if (!(fromNode instanceof Element) || !(toNode instanceof Element)) {
            // Fallback: replace node
            (fromNode as any).replaceWith(toNode.cloneNode(true));
            return;
        }

        // Persist islands remain untouched
        if (isPersist(fromNode) || isPersist(toNode)) {
            return;
        }

        if (fromNode.tagName !== toNode.tagName) {
            fromNode.replaceWith(toNode.cloneNode(true));
            return;
        }

		const dirtyFormState = captureDirtyFormState(fromNode);

        // Sync attributes
		syncAttributes(fromNode, toNode);

        const filterNodes = (list: NodeListOf<ChildNode> | ChildNode[]): ChildNode[] =>
            Array.from(list).filter(
                node => !(node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim() === '')
            );

        const toChildren = filterNodes(toNode.childNodes);
        let fromChildren = filterNodes(fromNode.childNodes);

        // Build map of existing persist elements/comments by their persist key
        const fromPersistMap = new Map<string, Node>();
        fromChildren.forEach(child => {
            const persistKey = getPersistKey(child);
            if (persistKey) {
                fromPersistMap.set(persistKey, child);
            }
        });

        // Process children
        let idx = 0;
        while (idx < toChildren.length || idx < fromChildren.length) {
            const toChild = toChildren[idx] || null;
			let fromChild = fromChildren[idx] || null;

			// Move an existing keyed child into the requested position before morphing it.
			const requestedKey = explicitKeyFor(toChild);
			if (requestedKey && explicitKeyFor(fromChild) !== requestedKey) {
				const matchingIndex = fromChildren.findIndex(
					(candidate, candidateIndex) => candidateIndex > idx && explicitKeyFor(candidate) === requestedKey
				);
				if (matchingIndex !== -1) {
					fromNode.insertBefore(fromChildren[matchingIndex], fromChild);
					fromChildren = filterNodes(fromNode.childNodes);
					fromChild = fromChildren[idx] || null;
				} else if (toChild) {
					fromNode.insertBefore(toChild.cloneNode(true), fromChild);
					fromChildren = filterNodes(fromNode.childNodes);
					fromChild = fromChildren[idx] || null;
				}
			}

            // Check if either is persist comment/element
            const toPersistKey = getPersistKey(toChild);
            const fromPersistKey = getPersistKey(fromChild);

            // If toChild is persist, check if we already have matching persist in fromChildren
            if (toPersistKey) {
                const existingPersist = fromPersistMap.get(toPersistKey);
                if (existingPersist) {
                    // Already exists, keep old persist (don't insert toChild)
                    idx++;
                    continue;
                }
                // New persist element/comment not in old tree, insert it
                fromNode.insertBefore(toChild.cloneNode(true), fromChild || null);
                fromChildren = filterNodes(fromNode.childNodes);
                idx++;
                continue;
            }

            // If fromChild is persist, keep it (toChild is guaranteed non-persist here)
            if (fromPersistKey) {
                idx++;
                continue;
            }

            if (!fromChild && toChild) {
                fromNode.appendChild(toChild.cloneNode(true));
                fromChildren = filterNodes(fromNode.childNodes);
                idx++;
                continue;
            }

            if (fromChild && !toChild) {
                if (!isPersist(fromChild) && !isPersistComment(fromChild)) {
                    fromChild.remove();
                    fromChildren = filterNodes(fromNode.childNodes);
                    continue; // re-evaluate same idx
                }
                idx++;
                continue;
            }

            if (!fromChild || !toChild) {
                idx++;
                continue;
            }

            const fromKey = fromChild instanceof Element ? keyFor(fromChild) : '';
            const toKey = toChild instanceof Element ? keyFor(toChild) : '';

            if (fromKey && toKey && fromKey === toKey) {
                morphNode(fromChild, toChild);
                idx++;
                continue;
            }

            if (!fromKey && !toKey && fromChild.nodeType === toChild.nodeType) {
                morphNode(fromChild, toChild);
                idx++;
                continue;
            }

            if (!isPersist(fromChild) && !isPersistComment(fromChild)) {
                fromChild.replaceWith(toChild.cloneNode(true));
                fromChildren = filterNodes(fromNode.childNodes);
            }
            idx++;
        }

		restoreDirtyFormState(fromNode, dirtyFormState);
    };

    morphNode(target, src);
}
