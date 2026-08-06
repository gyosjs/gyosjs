import { beforeEach, describe, expect, it } from 'vitest';
import { diffNodes } from '../src/core/router/diff-nodes';

describe('router head diff', () => {
	beforeEach(() => {
		document.head.innerHTML = '';
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
});
