import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { diffNodes } from '../src/core/router/diff-nodes';
import { cspExpressionRuntime } from '../src/runtime/csp-evaluator';
import { setCspNonce } from '../src/runtime/csp-nonce';
import { setExpressionRuntime } from '../src/runtime/evaluator';
import { standardExpressionRuntime } from '../src/runtime/standard-evaluator';

describe('router head diff', () => {
	beforeEach(() => {
		document.head.innerHTML = '';
		setExpressionRuntime(standardExpressionRuntime);
		setCspNonce(undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		setExpressionRuntime(standardExpressionRuntime);
		setCspNonce(undefined);
	});

	it('keeps an unchanged attribute-less style node stable', async () => {
		document.head.innerHTML = '<style>body { color: red; }</style>';
		const existing = document.head.querySelector('style')!;
		const incoming = document.createElement('style');
		incoming.textContent = 'body { color: red; }';

		await diffNodes([existing], [incoming]);

		expect(document.head.querySelector('style')).toBe(existing);
		expect(document.head.querySelectorAll('style')).toHaveLength(1);
	});

	it('replaces an attribute-less style when its content changes', async () => {
		document.head.innerHTML = '<style>body { color: red; }</style>';
		const existing = document.head.querySelector('style')!;
		const incoming = document.createElement('style');
		incoming.textContent = 'body { color: blue; }';

		await diffNodes([existing], [incoming]);

		expect(document.head.querySelector('style')).not.toBe(existing);
		expect(document.head.querySelector('style')!.textContent).toContain('blue');
	});

	it('handles duplicate deterministic keys without collapsing nodes', async () => {
		document.head.innerHTML = '<meta name="robots" content="index"><meta name="robots" content="index">';
		const current = Array.from(document.head.querySelectorAll('meta'));
		const nextDoc = new DOMParser().parseFromString(`
			<head><meta name="robots" content="index"><meta name="robots" content="index"></head>
		`, 'text/html');
		const incoming = Array.from(nextDoc.head.querySelectorAll('meta'));

		await diffNodes(current, incoming);

		expect(document.head.querySelectorAll('meta')).toHaveLength(2);
		expect(document.head.querySelectorAll('meta')[0]).toBe(current[0]);
		expect(document.head.querySelectorAll('meta')[1]).toBe(current[1]);
	});

	it('deduplicates styles and links across response nonces while preserving the active nonce', async () => {
		setExpressionRuntime(cspExpressionRuntime);
		setCspNonce(() => document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content);
		document.head.innerHTML = `
			<meta name="csp-nonce" content="active-nonce">
			<link rel="stylesheet" href="/app.css" nonce="active-nonce">
			<style nonce="active-nonce">body { color: red; }</style>
		`;
		const current = Array.from(document.head.querySelectorAll('meta, link, style'));
		const existingLink = document.head.querySelector('link')!;
		const existingStyle = document.head.querySelector('style')!;
		const nextDoc = new DOMParser().parseFromString(`
			<head>
				<meta name="csp-nonce" content="response-nonce">
				<link rel="stylesheet" href="/app.css" nonce="response-nonce">
				<style nonce="response-nonce">body { color: red; }</style>
			</head>
		`, 'text/html');

		await diffNodes(current, Array.from(nextDoc.head.querySelectorAll('meta, link, style')));

		expect(document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content).toBe('active-nonce');
		expect(document.head.querySelector('link')).toBe(existingLink);
		expect(document.head.querySelector('style')).toBe(existingStyle);
		expect(document.head.querySelector('link')?.getAttribute('nonce')).toBe('active-nonce');
		expect(document.head.querySelector('style')?.getAttribute('nonce')).toBe('active-nonce');
	});

	it('reconciles changed styles and head scripts to the active document nonce', async () => {
		setExpressionRuntime(cspExpressionRuntime);
		setCspNonce('active-nonce');
		document.head.innerHTML = '<style nonce="active-nonce">body { color: red; }</style>';
		const current = Array.from(document.head.querySelectorAll('style, script'));
		const nextDoc = new DOMParser().parseFromString(`
			<head>
				<style nonce="response-nonce">body { color: blue; }</style>
				<script nonce="response-nonce">window.__headScript = true;</script>
			</head>
		`, 'text/html');

		await diffNodes(current, Array.from(nextDoc.head.querySelectorAll('style, script')));

		expect(document.head.querySelector('style')?.textContent).toContain('blue');
		expect(document.head.querySelector('style')?.getAttribute('nonce')).toBe('active-nonce');
		expect(document.head.querySelector('script')?.getAttribute('nonce')).toBe('active-nonce');
	});

	it('skips new inline styles and scripts when CSP mode has no active nonce', async () => {
		setExpressionRuntime(cspExpressionRuntime);
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const nextDoc = new DOMParser().parseFromString(`
			<head>
				<style nonce="response-nonce">body { color: blue; }</style>
				<script nonce="response-nonce">window.__unsafeScript = true;</script>
				<link rel="stylesheet" href="/app.css" nonce="response-nonce">
			</head>
		`, 'text/html');

		await diffNodes([], Array.from(nextDoc.head.querySelectorAll('style, script, link')));

		expect(document.head.querySelector('style')).toBeNull();
		expect(document.head.querySelector('script')).toBeNull();
		expect(document.head.querySelector('link')?.hasAttribute('nonce')).toBe(false);
		expect(warning).toHaveBeenCalledTimes(2);
	});
});
