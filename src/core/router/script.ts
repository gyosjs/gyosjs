// Cache executed scripts to prevent duplicate execution
const executedScripts = new Set<string>();

/**
 * Simple hash function for script content
 * Used to cache inline scripts
 */
function hashScriptContent(content: string): string {
	let hash = 0;
	for (let i = 0; i < content.length; i++) {
		const char = content.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return `inline:${hash}`;
}

/**
 * Cache all scripts from the initial page load
 * This prevents them from re-executing when navigating back to the first page
 */
export function cacheInitialPageScripts(): void {
	document.querySelectorAll('script').forEach(script => {
		const executeOnce = script.hasAttribute('g-script-once');
		const key = executeOnce
			? script.src || hashScriptContent(script.textContent || '')
			: null;

		if (script.hasAttribute('g-script-wrap')) {
			// Initial scripts have already run by the time the router starts. Remove
			// the marker so a future incoming copy is diffed and wrapped on execution.
			script.removeAttribute('g-script-wrap');
		}
		// Skip scripts not marked g-script-once
		if (!executeOnce || !key) return;

		executedScripts.add(key);
	});
}

/**
 * Check if script should be executed
 * Scripts are not cached and always re-run by default
 * Use g-script-once attribute to mark scripts that should only run once
 */
export function shouldExecuteScript(script: HTMLScriptElement): boolean {
	if (!script.hasAttribute('g-script-once')) {
		return true;
	}

	// script.removeAttribute('g-script-once');

	// Get unique key (src for external, hash for inline)
	const key = script.src || hashScriptContent(script.textContent || '');

	// Skip if already executed
	if (executedScripts.has(key)) {
		return false;
	}

	// Mark as executed and allow
	executedScripts.add(key);
	return true;
}

export function getScriptExecutionKey(script: HTMLScriptElement): string | null {
	if (!script.hasAttribute('g-script-once')) return null;
	return script.src || hashScriptContent(script.textContent || '');
}

export function forgetExecutedScript(script: HTMLScriptElement, executionKey = getScriptExecutionKey(script)): void {
	const key = executionKey;
	if (key) executedScripts.delete(key);
}

export function waitForScriptLoad(
	script: HTMLScriptElement,
	signal?: AbortSignal,
	executionKey = getScriptExecutionKey(script)
): Promise<void> {
	if (!script.src && script.type !== 'module') return Promise.resolve();
	return new Promise<void>(resolve => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			signal?.removeEventListener('abort', onAbort);
			resolve();
		};
		const onAbort = () => {
			forgetExecutedScript(script, executionKey);
			script.remove();
			finish();
		};
		script.addEventListener('load', finish, { once: true });
		script.addEventListener('error', () => {
			forgetExecutedScript(script, executionKey);
			script.remove();
			finish();
		}, { once: true });
		if (signal?.aborted) onAbort();
		else signal?.addEventListener('abort', onAbort, { once: true });
	});
}

async function executeScript(old: HTMLScriptElement, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) {
		old.remove();
		return;
	}
	const executionKey = getScriptExecutionKey(old);
	// Check if script should execute
	if (!shouldExecuteScript(old)) {
		// Keep the node for morph matching, but prevent duplicate execution.
		old.textContent = '';
		return;
	}

	const newScript = document.createElement('script');
	Array.from(old.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
	newScript.textContent = old.hasAttribute('g-script-wrap')
		? wrapScriptExecution(old.textContent)
		: old.textContent;
	newScript.removeAttribute('g-script-wrap');

	const completion = waitForScriptLoad(newScript, signal, executionKey);

	old.replaceWith(newScript);
	await completion;
}

export async function executeScriptsInNodes(nodes: Iterable<Node>, signal?: AbortSignal): Promise<void> {
	const scripts: HTMLScriptElement[] = [];
	for (const node of nodes) {
		if (node instanceof HTMLScriptElement) scripts.push(node);
		if (node instanceof Element) {
			scripts.push(...Array.from(node.querySelectorAll<HTMLScriptElement>('script')));
		}
	}
	for (const script of scripts) {
		await executeScript(script, signal);
		if (signal?.aborted) return;
	}
}

export async function executeScripts(container: HTMLElement, signal?: AbortSignal): Promise<void> {
	await executeScriptsInNodes([container], signal);
}

export function wrapScriptExecution(scriptContent: string): string {
	if (!scriptContent) return scriptContent;
	return `(() => { ${scriptContent} })();`;
}
