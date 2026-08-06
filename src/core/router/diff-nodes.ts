import { getScriptExecutionKey, shouldExecuteScript, waitForScriptLoad, wrapScriptExecution } from "./script";

function serializeAttributes(el: Element): string {
	return Array.from(el.attributes)
		.map(attr => `${attr.name}=${attr.value}`)
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

function elementKey(el: Element): string {
	const tag = el.tagName.toLowerCase();
	const content = tag === 'script' || tag === 'style' ? hashContent(el.textContent || '') : '';
	return `${tag}|${serializeAttributes(el)}|${content}`;
}

function keyedNodes(nodes: Element[]): Array<{ key: string; node: Element }> {
	const occurrences = new Map<string, number>();
	return nodes.map(node => {
		const baseKey = elementKey(node);
		const occurrence = occurrences.get(baseKey) || 0;
		occurrences.set(baseKey, occurrence + 1);
		return { key: `${baseKey}|${occurrence}`, node };
	});
}

export async function diffNodes(
	currentNodes: Element[],
	nextNodes: Element[],
	container: HTMLElement = document.head,
	signal?: AbortSignal
): Promise<void> {
	const current = keyedNodes(currentNodes);
	const next = keyedNodes(nextNodes);
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
				script.textContent = node.hasAttribute('g-script-wrap')
					? wrapScriptExecution(node.textContent || '')
					: node.textContent || '';
				script.removeAttribute('g-script-wrap');
				const completion = waitForScriptLoad(script, signal, executionKey);
				container.appendChild(script);
				await completion;
				continue;
			}

			container.appendChild(document.importNode(node, true));
		}
	}
}
