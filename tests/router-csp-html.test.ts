import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareNavigationHtml } from '../src/core/router/csp-html';
import { cspExpressionRuntime } from '../src/runtime/csp-evaluator';
import { setCspNonce } from '../src/runtime/csp-nonce';
import { setExpressionRuntime } from '../src/runtime/evaluator';
import { standardExpressionRuntime } from '../src/runtime/standard-evaluator';

describe('router CSP response preparation', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		setCspNonce(undefined);
		setExpressionRuntime(standardExpressionRuntime);
	});

	it('leaves response HTML unchanged in the standard runtime', () => {
		const html = '<style nonce="response">body { color: red; }</style>';
		expect(prepareNavigationHtml(html)).toBe(html);
	});

	it('reconciles real style tags without modifying raw text or comments', () => {
		setExpressionRuntime(cspExpressionRuntime);
		setCspNonce('active&nonce');
		const script = `<script>const fixture = '<style nonce="response">script text</style>';</script>`;
		const comment = '<!-- <style nonce="response">comment text</style> -->';
		const html = `${script}${comment}<style media="screen" data-note="keep nonce='nested'" nonce="response">body { color: red; }</style>`;

		const prepared = prepareNavigationHtml(html);

		expect(prepared).toContain(script);
		expect(prepared).toContain(comment);
		expect(prepared).toContain(
			`<style media="screen" data-note="keep nonce='nested'" nonce="active&amp;nonce">body { color: red; }</style>`
		);
	});

	it('removes inline styles and noscript fallbacks when no active nonce exists', () => {
		setExpressionRuntime(cspExpressionRuntime);
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const html = `
			<noscript><style>fallback</style></noscript>
			<style nonce="response">live style</style>
			<main>Content</main>
		`;

		const prepared = prepareNavigationHtml(html);

		expect(prepared).not.toContain('<noscript');
		expect(prepared).not.toContain('live style');
		expect(prepared).toContain('<main>Content</main>');
		expect(warning).toHaveBeenCalledOnce();
	});
});
