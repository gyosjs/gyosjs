import { afterEach, describe, expect, it } from 'vitest';
import {
	captureCspNonce,
	resolveCspNonce,
	setCspNonce
} from '../src/runtime/csp-nonce';

describe('CSP nonce configuration', () => {
	afterEach(() => {
		setCspNonce(undefined);
		document.head.innerHTML = '';
	});

	it('accepts static and callback nonce sources', () => {
		setCspNonce('static-nonce');
		expect(resolveCspNonce()).toBe('static-nonce');

		setCspNonce(() => 'current-nonce');
		expect(resolveCspNonce()).toBe('current-nonce');
	});

	it('captures the nonce from the CSP auto script', () => {
		const script = document.createElement('script');
		script.nonce = 'script-nonce';

		captureCspNonce(script);

		expect(resolveCspNonce()).toBe('script-nonce');
	});

	it('falls back to the documented meta nonce convention', () => {
		const meta = document.createElement('meta');
		meta.name = 'csp-nonce';
		meta.content = 'meta-nonce';
		document.head.append(meta);

		captureCspNonce();

		expect(resolveCspNonce()).toBe('meta-nonce');
	});
});
