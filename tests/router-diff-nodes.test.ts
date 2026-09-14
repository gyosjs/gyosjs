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

	it('keeps equivalent relative resources across page bases without awaiting pending scripts', async () => {
		document.head.innerHTML = '<script async src="provider.js"></script><link rel="stylesheet" href="theme.css">';
		const current = Array.from(document.head.children);
		const next = new DOMParser().parseFromString('<head><script async src="https://site.test/a/provider.js"></script><link rel="stylesheet" href="https://site.test/a/theme.css"></head>', 'text/html');
		await diffNodes(current, Array.from(next.head.children), document.head, undefined, 'https://site.test/a/start');
		expect(Array.from(document.head.children)).toEqual(current);
		await diffNodes(current, Array.from(next.head.children), document.head, undefined, 'https://site.test/b/next');
		expect(Array.from(document.head.children)).toEqual(current);
	});

	it.each(['src="/provider.js?v=2"', 'src="/provider.js" type="module"', 'src="/provider.js" integrity="sha384-new"', 'src="/provider.js" crossorigin="anonymous"'])('distinguishes changed script attributes: %s', async attrs => {
		document.head.innerHTML = '<script src="/provider.js"></script>';
		const old = document.head.firstElementChild!;
		const next = new DOMParser().parseFromString(`<head><script ${attrs}></script></head>`, 'text/html');
		const promise = diffNodes([old], Array.from(next.head.children));
		const inserted = document.head.querySelector('script')!;
		expect(inserted).not.toBe(old);
		inserted.dispatchEvent(new Event('load'));
		await promise;
	});

	it('retains opted-in head nodes by key, while ordinary page metadata still changes', async () => {
		document.head.innerHTML = '<script g-head-persist="analytics" src="/sdk.js"></script><style g-head-persist="widget">.widget{color:red}</style><meta name="description" content="old">';
		const retained = Array.from(document.head.children).slice(0, 2);
		const next = new DOMParser().parseFromString('<head><meta name="description" content="new"><script g-head-persist="analytics" src="/sdk.js?v=2"></script></head>', 'text/html');
		await diffNodes(Array.from(document.head.children), Array.from(next.head.children));
		expect(document.head.querySelector('script')).toBe(retained[0]);
		expect(document.head.querySelector('style')).toBe(retained[1]);
		expect(document.head.querySelector('meta')?.content).toBe('new');
		await diffNodes(Array.from(document.head.children), []);
		expect(Array.from(document.head.children)).toEqual(retained);
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
