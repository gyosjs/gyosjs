import { beforeEach, describe, expect, it } from 'vitest';
import {
	cacheInitialPageScripts,
	executeScripts,
	forgetExecutedScript,
	shouldExecuteScript,
	wrapScriptExecution
} from '../src/core/router/script';

describe('router scripts', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('caches an initial once-only script without pretending it was wrapped before execution', () => {
		const content = 'window.__gyos_unique_once_wrap_test__ = true;';
		document.body.innerHTML = `
			<script g-script-once g-script-wrap>${content}</script>
		`;

		cacheInitialPageScripts();

		const initial = document.querySelector('script')!;
		expect(initial.hasAttribute('g-script-wrap')).toBe(false);
		expect(initial.textContent).toBe(content);

		const incoming = document.createElement('script');
		incoming.setAttribute('g-script-once', '');
		incoming.setAttribute('g-script-wrap', '');
		incoming.textContent = content;
		expect(shouldExecuteScript(incoming)).toBe(false);
	});

	it('always executes ordinary scripts and deduplicates once-only inline scripts', () => {
		const ordinary = document.createElement('script');
		ordinary.textContent = 'window.ordinary = true;';
		expect(shouldExecuteScript(ordinary)).toBe(true);
		expect(shouldExecuteScript(ordinary)).toBe(true);

		const content = 'window.__gyos_once_contract__ = true;';
		const first = document.createElement('script');
		first.setAttribute('g-script-once', '');
		first.textContent = content;
		const second = first.cloneNode(true) as HTMLScriptElement;
		expect(shouldExecuteScript(first)).toBe(true);
		expect(shouldExecuteScript(second)).toBe(false);
	});

	it('deduplicates once-only external scripts by resolved source URL', () => {
		const source = `/assets/once-${Date.now()}.js`;
		const first = document.createElement('script');
		first.setAttribute('g-script-once', '');
		first.src = source;
		const second = document.createElement('script');
		second.setAttribute('g-script-once', '');
		second.src = source;

		expect(shouldExecuteScript(first)).toBe(true);
		expect(shouldExecuteScript(second)).toBe(false);
	});

	it('allows a failed once-only external script to retry', () => {
		const source = `/assets/retry-${Date.now()}.js`;
		const failed = document.createElement('script');
		failed.setAttribute('g-script-once', '');
		failed.src = source;
		const retry = failed.cloneNode(true) as HTMLScriptElement;

		expect(shouldExecuteScript(failed)).toBe(true);
		forgetExecutedScript(failed);
		expect(shouldExecuteScript(retry)).toBe(true);
	});

	it('releases the original once key when a wrapped module script fails', async () => {
		const content = `window.__gyos_wrapped_retry_${Date.now()} = true;`;
		const container = document.createElement('div');
		container.innerHTML = `<script type="module" g-script-once g-script-wrap>${content}</script>`;
		const retry = container.querySelector('script')!.cloneNode(true) as HTMLScriptElement;

		const execution = executeScripts(container);
		container.querySelector('script')!.dispatchEvent(new Event('error'));
		await execution;

		expect(shouldExecuteScript(retry)).toBe(true);
	});

	it('wraps non-empty inline scripts in an isolated function scope', () => {
		expect(wrapScriptExecution('const local = true;')).toBe(
			'(() => { const local = true; })();'
		);
		expect(wrapScriptExecution('')).toBe('');
	});
});
