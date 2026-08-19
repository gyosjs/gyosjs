import { getScriptExecutionKey, shouldExecuteScript, waitForScriptLoad, wrapScriptExecution } from "./script";
import { expressionRuntimeMode } from '../../runtime/evaluator';
import { resolveCspNonce } from '../../runtime/csp-nonce';

interface DiffContext {
	csp: boolean;
	activeNonce?: string;
}

function isNonceMeta(el: Element): boolean {
	return el.tagName === 'META' && el.getAttribute('name')?.toLowerCase() === 'csp-nonce';
}

function isStylesheetLink(el: Element): boolean {
	return el.tagName === 'LINK'
		&& (el.getAttribute('rel') || '').toLowerCase().split(/\s+/).includes('stylesheet');
}

function usesCspNonce(el: Element): boolean {
	return el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || isStylesheetLink(el);
}

function serializeAttributes(el: Element, context: DiffContext): string {
	const attributes = new Map<string, string>();
	Array.from(el.attributes).forEach(attr => {
		if (context.csp && usesCspNonce(el) && attr.name.toLowerCase() === 'nonce') return;
		if (context.csp && isNonceMeta(el) && attr.name.toLowerCase() === 'content') return;
		attributes.set(attr.name, attr.value);
	});
	if (context.csp && usesCspNonce(el) && context.activeNonce) {
		attributes.set('nonce', context.activeNonce);
	}
	if (context.csp && isNonceMeta(el) && context.activeNonce) {
		attributes.set('content', context.activeNonce);
	}
	return Array.from(attributes)
		.map(([name, value]) => `${name}=${value}`)
		.sort()
		.join('|');
}

function hashContent(content: string): string {
	let hash = 0;
	for (let index = 0; index < content.length; index++) {
		hash = ((hash << 5) - hash + content.charCodeAt(index)) | 0;
	}
	return String(hash);
}

function elementKey(el: Element, context: DiffContext): string {
	const tag = el.tagName.toLowerCase();
	const content = tag === 'script' || tag === 'style' ? hashContent(el.textContent || '') : '';
	return `${tag}|${serializeAttributes(el, context)}|${content}`;
}

function keyedNodes(nodes: Element[], context: DiffContext): Array<{ key: string; node: Element }> {
	const occurrences = new Map<string, number>();
	return nodes.map(node => {
		const baseKey = elementKey(node, context);
		const occurrence = occurrences.get(baseKey) || 0;
		occurrences.set(baseKey, occurrence + 1);
		return { key: `${baseKey}|${occurrence}`, node };
	});
}

function canInsertNode(node: Element, context: DiffContext): boolean {
	if (!context.csp) return true;
	if (isNonceMeta(node)) return Boolean(context.activeNonce);
	if (node.tagName === 'STYLE') return Boolean(context.activeNonce);
	if (node.tagName === 'SCRIPT' && !node.hasAttribute('src')) return Boolean(context.activeNonce);
	return true;
}

function reconcileCspAttributes(node: Element, context: DiffContext): void {
	if (!context.csp) return;
	if (isNonceMeta(node)) {
		if (context.activeNonce) node.setAttribute('content', context.activeNonce);
		return;
	}
	if (!usesCspNonce(node)) return;
	node.removeAttribute('nonce');
	if (context.activeNonce) node.setAttribute('nonce', context.activeNonce);
}

function warnSkippedNode(node: Element): void {
	if (node.tagName === 'STYLE') {
		console.warn('[GyosJS CSP] Skipped an inline MPA style because no active document nonce is configured.');
	} else if (node.tagName === 'SCRIPT' && !node.hasAttribute('src')) {
		console.warn('[GyosJS CSP] Skipped an inline MPA script because no active document nonce is configured.');
	}
}

export async function diffNodes(
	currentNodes: Element[],
	nextNodes: Element[],
	container: HTMLElement = document.head,
	signal?: AbortSignal
): Promise<void> {
	const csp = expressionRuntimeMode() === 'csp';
	const context: DiffContext = {
		csp,
		activeNonce: csp ? resolveCspNonce() : undefined
	};
	const current = keyedNodes(currentNodes, context);
	const next = keyedNodes(nextNodes, context);
	const currentKeys = new Set(current.map(item => item.key));
	const nextKeys = new Set(next.map(item => item.key));

	// Remove nodes that are not in the new head
	current.forEach(({ key, node }) => {
		if (!nextKeys.has(key)) {
			node.remove();
		}
	});

	// Add nodes that are missing
	for (const { key, node } of next) {
		if (signal?.aborted) return;
		if (!currentKeys.has(key)) {
			if (!canInsertNode(node, context)) {
				warnSkippedNode(node);
				continue;
			}
			if (node.tagName === 'STYLE') {
				const style = document.createElement('style');
				Array.from(node.attributes).forEach(attr => style.setAttribute(attr.name, attr.value));
				reconcileCspAttributes(style, context);
				// CSP checks inline styles as their CSS text is attached. Set the active
				// nonce first so a response nonce never produces a transient violation.
				style.textContent = node.textContent || '';
				container.appendChild(style);
				continue;
			}
			if (node.tagName === 'SCRIPT') {
				const originalScript = node as HTMLScriptElement;
				const executionKey = getScriptExecutionKey(originalScript);
				// Check if script should execute
				if (!shouldExecuteScript(originalScript)) {
					node.remove();
					continue;
				}

				const script = document.createElement('script');
				Array.from(node.attributes).forEach(attr => script.setAttribute(attr.name, attr.value));
				reconcileCspAttributes(script, context);
				script.textContent = node.hasAttribute('g-script-wrap')
					? wrapScriptExecution(node.textContent || '')
					: node.textContent || '';
				script.removeAttribute('g-script-wrap');
				const completion = waitForScriptLoad(script, signal, executionKey);
				container.appendChild(script);
				await completion;
				continue;
			}

			const imported = document.importNode(node, true) as Element;
			reconcileCspAttributes(imported, context);
			container.appendChild(imported);
		}
	}
}
