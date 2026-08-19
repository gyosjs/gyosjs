export type CspNonceSource = string | (() => string | null | undefined);

let nonceSource: CspNonceSource | undefined;

/** Configure the active document nonce used for scripts and styles during MPA navigation. */
export function setCspNonce(source: CspNonceSource | undefined): void {
	nonceSource = source;
}

export function resolveCspNonce(): string | undefined {
	const value = typeof nonceSource === 'function' ? nonceSource() : nonceSource;
	return value || undefined;
}

/** Capture the nonce from the CSP auto bundle before DOMContentLoaded. */
export function captureCspNonce(script: HTMLScriptElement | null = null): void {
	if (typeof document === 'undefined') return;

	const current = script ?? (document.currentScript instanceof HTMLScriptElement ? document.currentScript : null);
	const source = current ?? Array.from(document.scripts)
		.reverse()
		.find(item => /(?:^|\/)gyos\.csp\.auto(?:\.esm)?(?:\.min)?\.js(?:[?#]|$)/.test(item.src));
	const nonce = source?.nonce
		|| source?.getAttribute('nonce')
		|| document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
	if (nonce) setCspNonce(nonce);
}
