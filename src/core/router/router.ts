/**
 * GyosJs Router v0
 * MPA boost navigation inspired by Turbo Drive.
 * Implements attribute-driven routing, snapshot caching, and persistent islands.
 */
import { mountAll } from '../component';
import { getScopeFromElement } from '../scope-registry';
import { disposeEffects } from '../../template/cleanup';
import { evaluateExpression } from '../../template/expression';
import { ProgressBar } from '../../utils/progress-bar';
import { showTargetSpinner, hideTargetSpinner } from '../../utils/target-spinner';
import { log } from '../../utils/helpers';
import { cacheInitialPageScripts } from './script';
import { detachPersist, mergePersistIntoLive } from './persist';
import { performSwap } from './swap';
import { handleScroll, saveScrollPosition } from './scroll';
import { diffNodes } from './diff-nodes';
import { shouldDeferToFormValidation } from '../../form/form-submission';
import { prepareNavigationHtml } from './csp-html';

export interface RouterOptions {
	showProgress?: boolean; // Show progress bar during navigation (default: true)
}

interface NavigateOptions {
	url: string;
	method: string;
	trigger?: Element | null;
	form?: HTMLFormElement | null;
	formData?: FormData | null;
	jsonData?: Record<string, any> | null;
	replace?: boolean;
	changeState?: boolean;
	popstate?: boolean;
	savedScroll?: { x: number; y: number };
	targetSelector?: string | null;
	targetOutletIndex?: number | null;
	swapMode?: string;
	currentHead?: boolean;
	historyFragment?: HTMLElement;
	historyEntryId?: string | null;
	scrollSourceEntryId?: string | null;
}

interface RouterHistoryState {
	targetSelector: string | null;
	targetOutletIndex: number | null;
	swapMode: string;
	currentHead: boolean;
}

interface GyosHistoryState {
	gyos?: boolean;
	gyosEntryId?: string;
	gyosRoutes?: Record<string, RouterHistoryState>;
	scroll?: { x: number; y: number };
}

interface Snapshot {
	html: string;
}

const snapshots = new Map<string, Snapshot>();
const preloadCache = new Map<string, Promise<Response>>();
const preloadControllers = new Map<string, AbortController>();
const scrollPositions = new Map<string, { x: number; y: number }>();
const historyFragments = new Map<string, Map<string, HTMLElement>>();
let routerStarted = false;
let navigationSequence = 0;
let historyEntrySequence = 0;
let progressBarEnabled = true;
let currentUrl = canonicalUrl(window.location.href, true);
let currentHistoryEntryId = (history.state as GyosHistoryState | null)?.gyosEntryId || null;

interface NavigationTransaction {
	id: number;
	controller: AbortController;
	interval: ReturnType<typeof setInterval> | null;
	spinner: HTMLElement | null;
	committing: boolean;
	done: Promise<void>;
	resolveDone: () => void;
}

let activeNavigation: NavigationTransaction | null = null;

// Global progress bar instance
let progressBar: ProgressBar | null = null;

const beforeNavigate: any[] = [];
const afterNavigate: any[] = [];

// Expose hooks to register before/after navigation callbacks
export function onBeforeNavigate(callback: (url: string) => void): void {
	beforeNavigate.push(callback);
}

export function onAfterNavigate(callback: (url: string) => void): void {
	afterNavigate.push(callback);
}

export function startRouter(options?: RouterOptions): void {
	// If not has g-boost attribute, do not start router
	if (!document.querySelector('[g-boost]')) return;
	if (routerStarted) return;
	if (typeof window === 'undefined' || typeof document === 'undefined') return;

	progressBarEnabled = options?.showProgress !== false; // Default to true

	// Initialize progress bar
	if (progressBarEnabled) {
		progressBar = new ProgressBar(progressBarEnabled);
	}

	document.addEventListener('click', onClick);
	document.addEventListener('submit', onSubmit);
	document.addEventListener('mouseover', onMouseOverCapture, true);
	window.addEventListener('popstate', onPopState);

	if ('scrollRestoration' in history) {
		history.scrollRestoration = 'manual';
	}

	// Cache scripts from initial page to prevent re-execution on first navigation back
	cacheInitialPageScripts();

	routerStarted = true;
	log('[GyosRouter] started');
}

function hasGlobalBoost(): boolean {
	return !!document.body?.hasAttribute('g-boost');
}

function findGlobalOutlet(): HTMLElement | null {
	return document.querySelector('[g-outlet]');
}

function stripInertFallbackContent(root: ParentNode): void {
	root.querySelectorAll('noscript').forEach(element => element.remove());
}

function parseNavigationDocument(html: string): Document {
	// Chromium applies the active page CSP while DOMParser creates response
	// styles. Reconcile their nonce before parsing to avoid transient violations;
	// diffNodes repeats the check before insertion into the live document.
	const doc = new DOMParser().parseFromString(prepareNavigationHtml(html), 'text/html');
	// DOMParser disables scripting and parses noscript children as active markup.
	// A boosted page runs with scripting enabled, so those fallbacks must stay inert.
	stripInertFallbackContent(doc);
	return doc;
}

function resolveTarget(
	trigger?: Element | null,
	targetSelector?: string | null,
	targetOutletIndex?: number | null
): HTMLElement | null {
	if (targetSelector) {
		try {
			const target = document.querySelector(targetSelector);
			if (target instanceof HTMLElement) return target;
		} catch {
			// Invalid historical selectors fall back to normal outlet resolution.
		}
	}
	if (targetOutletIndex !== undefined && targetOutletIndex !== null) {
		const outlet = document.querySelectorAll<HTMLElement>('[g-outlet]')[targetOutletIndex];
		if (outlet) return outlet;
	}
	if (trigger) {
		// If trigger has g-target (value is selector) attribute, use it
		const sel = trigger.getAttribute('g-target');
		if (sel) {
			// If selector matches an element, return it
			const target = document.querySelector(sel);
			if (target instanceof HTMLElement) return target;
		}

		// Else if trigger is inside an outlet, return it
		const outletAncestor = trigger.closest('[g-outlet]');
		if (outletAncestor instanceof HTMLElement) return outletAncestor;
	}

	// Else return global outlet
	const outlet = findGlobalOutlet();
	return outlet instanceof HTMLElement ? outlet : null;
}

function saveSnapshot(url: string, html: string): void {
	// create HTMLElement by html string to remove scripts and get clean snapshot
	const doc = parseNavigationDocument(html);

	// Ignore hash for snapshot keys
	if (url.includes('#')) url = url.split('#')[0];

	// Remove initial scripts to avoid duplication on restore
	Array.from(doc.scripts).forEach(s => {
		if (s.hasAttribute('g-script-once')) s.textContent = '';
	});
	snapshots.set(url, { html: doc.documentElement.outerHTML });
	log('[GyosRouter] snapshot saved for', url);
}

function getOutletIndex(root: ParentNode, target: HTMLElement): number | null {
	if (!target.hasAttribute('g-outlet')) return null;
	const index = Array.from(root.querySelectorAll<HTMLElement>('[g-outlet]')).indexOf(target);
	return index === -1 ? null : index;
}

function pickSourceFragment(
	doc: Document,
	target: HTMLElement,
	targetOutletIndex: number | null
): HTMLElement {
	if (target.id) {
		const match = doc.getElementById(target.id);
		if (match instanceof HTMLElement) return match;
	}
	if (targetOutletIndex !== null) {
		const outlet = doc.querySelectorAll<HTMLElement>('[g-outlet]')[targetOutletIndex];
		if (outlet) return outlet;
	}

	const outlet = doc.querySelector('[g-outlet]');
	if (outlet instanceof HTMLElement) return outlet;

	return doc.body as HTMLElement;
}

function cleanupTarget(target: HTMLElement): void {
	// Dispose scopes/effects inside target to avoid leaks before swap
	disposeEffects(target);
}

function canonicalUrl(url: string, includeHash = false): string {
	const parsed = new URL(url, window.location.href);
	if (!includeHash) parsed.hash = '';
	return parsed.href;
}

function createHistoryEntryId(): string {
	return `gyos-${Date.now().toString(36)}-${++historyEntrySequence}`;
}

function ensureCurrentHistoryEntryId(persist = true): string {
	if (currentHistoryEntryId) return currentHistoryEntryId;
	const state = (history.state || {}) as GyosHistoryState;
	currentHistoryEntryId = state.gyosEntryId || createHistoryEntryId();
	if (persist && !state.gyosEntryId) {
		history.replaceState({ ...state, gyosEntryId: currentHistoryEntryId }, '');
	}
	return currentHistoryEntryId;
}

function setHistoryFragment(entryId: string, neighbourId: string, fragment: HTMLElement): void {
	let routes = historyFragments.get(entryId);
	if (!routes) {
		routes = new Map();
		historyFragments.set(entryId, routes);
	}
	routes.set(neighbourId, fragment.cloneNode(true) as HTMLElement);
}

function getHistoryFragment(entryId: string, neighbourId: string): HTMLElement | undefined {
	const fragment = historyFragments.get(entryId)?.get(neighbourId);
	return fragment?.cloneNode(true) as HTMLElement | undefined;
}

function cloneHistoryTarget(target: HTMLElement): HTMLElement {
	const clone = target.cloneNode(true) as HTMLElement;
	clone.querySelectorAll('.gyos-target-spinner').forEach(spinner => spinner.remove());
	return clone;
}

function rememberScrollPosition(entryId: string | null): void {
	if (!entryId) return;
	scrollPositions.set(entryId, {
		x: window.scrollX,
		y: window.scrollY
	});
}

function isActiveNavigation(transaction: NavigationTransaction): boolean {
	return activeNavigation?.id === transaction.id && !transaction.controller.signal.aborted;
}

function assertActiveNavigation(transaction: NavigationTransaction): void {
	if (isActiveNavigation(transaction)) return;
	throw new DOMException('Navigation superseded', 'AbortError');
}

function cancelNavigation(transaction: NavigationTransaction): void {
	transaction.controller.abort();
	if (transaction.interval) {
		clearInterval(transaction.interval);
		transaction.interval = null;
	}
	if (transaction.spinner) {
		hideTargetSpinner(transaction.spinner);
		transaction.spinner = null;
	}
}

function waitForNavigation<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(new DOMException('Navigation superseded', 'AbortError'));
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(new DOMException('Navigation superseded', 'AbortError'));
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(
			value => {
				signal.removeEventListener('abort', onAbort);
				resolve(value);
			},
			error => {
				signal.removeEventListener('abort', onAbort);
				reject(error);
			}
		);
	});
}

function consumeViewTransitionRejection(promise: Promise<unknown> | undefined): void {
	// Chrome rejects these when a newer transition skips the current one. The
	// update callback remains the navigation source of truth and is awaited below.
	void promise?.catch(() => undefined);
}

function runNavigationHooks(callbacks: Array<(url: string) => void>, url: string): void {
	callbacks.forEach(callback => {
		try {
			callback(url);
		} catch (error) {
			console.error('[GyosRouter] navigation hook error', error);
		}
	});
}

function mergeFormDataIntoUrl(url: URL, formData: FormData): URL {
	formData.forEach((value, key) => {
		if (typeof value === 'string') {
			url.searchParams.append(key, value);
		} else {
			url.searchParams.append(key, value.name);
		}
	});
	return url;
}

function buildRequest(opts: NavigateOptions): { finalUrl: string; init: RequestInit } {
	const method = (opts.method || 'GET').toUpperCase();
	const headers = new Headers({
		'X-Gyos-Boost': '1',
		Accept: 'text/html,application/xhtml+xml'
	});

	const init: RequestInit = {
		method,
		headers,
		redirect: 'follow',
		mode: 'same-origin'
	};

	let url = new URL(opts.url, window.location.href);

	const isGet = method === 'GET';

	if (opts.formData) {
		// Prefer FormData when provided (files preserved)
		if (isGet) {
			url = mergeFormDataIntoUrl(url, opts.formData);
		} else {
			init.body = opts.formData;
		}
	} else if (opts.jsonData) {
		const appendParam = (key: string, value: any) => {
			if (typeof value === 'object') {
				url.searchParams.append(key, JSON.stringify(value));
			} else {
				url.searchParams.append(key, String(value));
			}
		};

		if (isGet) {
			Object.entries(opts.jsonData).forEach(([k, v]) => appendParam(k, v));
		} else {
			headers.set('Content-Type', 'application/json');
			init.body = JSON.stringify(opts.jsonData);
		}
	}

	return { finalUrl: url.toString(), init };
}

function preload(url: string): void {
	const cacheKey = canonicalUrl(url, true);
	if (preloadCache.has(cacheKey)) return;

	log('[GyosRouter] preloading', cacheKey);
	const controller = new AbortController();
	const request = fetch(cacheKey, {
		headers: {
			'X-Gyos-Boost': '1',
			Accept: 'text/html,application/xhtml+xml'
		},
		signal: controller.signal,
		mode: 'same-origin'
	});
	preloadCache.set(cacheKey, request);
	preloadControllers.set(cacheKey, controller);
	request.catch(() => {
		preloadCache.delete(cacheKey);
		preloadControllers.delete(cacheKey);
	});
}

async function updateHead(fromDoc: Document, signal?: AbortSignal): Promise<void> {
	const allowedSelector = 'meta, link, style:not(#gyos-transitions), script';
	const currentNodes = Array.from(document.head.querySelectorAll(allowedSelector));
	const nextNodes = Array.from(fromDoc.head.querySelectorAll(allowedSelector));

	await diffNodes(currentNodes, nextNodes, document.head, signal);
}

async function scriptNotInOutletTarget(
	fromDoc: Document,
	target: HTMLElement,
	source: HTMLElement,
	signal?: AbortSignal
): Promise<void>
{
	// scripts in current document and it not in target outlet
	const currentScripts = Array.from(document.scripts).filter(s => !target.contains(s) && !document.head.contains(s));
	// scripts in fromDoc and it not in source outlet
	const incomingScripts = Array.from(fromDoc.scripts).filter(s => !source.contains(s) && !fromDoc.head.contains(s));
	
	// Diff and update scripts not in outlet/target
	await diffNodes(currentScripts, incomingScripts, document.body, signal);
}

function resolveIncomingScriptUrls(root: ParentNode, baseUrl: string): void {
	root.querySelectorAll<HTMLScriptElement>('script[src]').forEach(script => {
		const source = script.getAttribute('src');
		if (source) script.src = new URL(source, baseUrl).href;
	});
}

function isNavigableHtmlResponse(response: Response): boolean {
	try {
		if (response.url && new URL(response.url, window.location.href).origin !== window.location.origin) {
			return false;
		}
	} catch {
		return false;
	}

	const disposition = response.headers.get('Content-Disposition') || '';
	if (/\battachment\b/i.test(disposition)) return false;

	const contentType = (response.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
	return contentType === 'text/html' || contentType === 'application/xhtml+xml';
}

function fallbackFromBoost(opts: NavigateOptions, url: string, requestSent: boolean): void {
	const method = (opts.method || 'GET').toUpperCase();
	if (method === 'GET') {
		window.location.href = url;
		return;
	}

	if (!requestSent && opts.form) {
		HTMLFormElement.prototype.submit.call(opts.form);
		return;
	}

	console.error(`[GyosRouter] ${method} navigation could not be boosted; the request will not be replayed.`);
}

async function navigate(opts: NavigateOptions): Promise<void> {
	while (activeNavigation) {
		const previous = activeNavigation;
		if (previous.committing) {
			log('[GyosRouter] Waiting for previous DOM commit');
			await previous.done;
			continue;
		}
		log('[GyosRouter] Cancelling previous navigation');
		cancelNavigation(previous);
		break;
	}

	let resolveDone!: () => void;
	const done = new Promise<void>(resolve => { resolveDone = resolve; });
	const transaction: NavigationTransaction = {
		id: ++navigationSequence,
		controller: new AbortController(),
		interval: null,
		spinner: null,
		committing: false,
		done,
		resolveDone
	};
	activeNavigation = transaction;

	const hasTargetSpinner = opts.trigger?.hasAttribute('g-router-spin');

	const setRand = () => {
		if (isActiveNavigation(transaction) && progressBar?.getCurrentProgress()! < 70) {
			progressBar?.setProgress(progressBar?.getCurrentProgress() + Math.random() * 8);
		}
	};

	try {
		runNavigationHooks(beforeNavigate, opts.url);
		progressBar?.start();

		// popstate already points history at the destination entry. Keep the visible
		// page's position under currentUrl without overwriting that destination state.
		rememberScrollPosition(opts.scrollSourceEntryId ?? currentHistoryEntryId);
		if (!opts.popstate) saveScrollPosition();

		// Pick target element to swap
		let target = resolveTarget(opts.trigger, opts.targetSelector, opts.targetOutletIndex);
		if (!target) {
			if (isActiveNavigation(transaction)) fallbackFromBoost(opts, opts.url, false);
			return;
		}

		const swapMode = (opts.swapMode || opts.trigger?.getAttribute('g-swap') || 'inner').toLowerCase();
		const removeTriggerAfterCommit = opts.trigger instanceof HTMLElement
			&& opts.trigger.hasAttribute('g-router-remove');
		const destructiveSwap = !['append', 'prepend'].includes(swapMode);
		const isFullOutletNavigation = target === findGlobalOutlet();
		const targetOutletIndex = getOutletIndex(document, target);
		const targetSelector = isFullOutletNavigation
			? null
			: opts.targetSelector || opts.trigger?.getAttribute('g-target') || (target.id ? `#${target.id}` : null);
		const currentHead = opts.currentHead ?? opts.trigger?.hasAttribute('g-current-head') ?? false;
		const routerHistoryState: RouterHistoryState = {
			targetSelector,
			targetOutletIndex: isFullOutletNavigation ? null : targetOutletIndex,
			// History restores a complete saved destination, so additive modes must
			// not be replayed or they would duplicate content on every back/forward.
			swapMode: isFullOutletNavigation ? 'inner' : 'morph',
			currentHead
		};

		// Show spinner in target if g-router-spin is present
		if (hasTargetSpinner) transaction.spinner = showTargetSpinner(target, swapMode);

		const { finalUrl, init } = buildRequest(opts);

		// Add abort signal to request
		init.signal = transaction.controller.signal;

		let html: string | undefined;
		let response: Response | undefined = undefined;
		const urlWithoutHash = canonicalUrl(finalUrl);
		if (opts.popstate && opts.historyFragment) {
			log('[GyosRouter] restoring history fragment for', finalUrl);
		} else if (opts.popstate && snapshots.has(urlWithoutHash)) {
			log('[GyosRouter] restoring snapshot for', finalUrl);
			html = snapshots.get(urlWithoutHash)!.html;
		} else {
			// Check preload cache if GET
			const preloadKey = canonicalUrl(finalUrl, true);
			if (opts.method.toUpperCase() === 'GET' && preloadCache.has(preloadKey)) {
				log('[GyosRouter] using preload cache for', finalUrl);
				try {
					response = await waitForNavigation(preloadCache.get(preloadKey)!, transaction.controller.signal);
				} catch (error) {
					preloadCache.delete(preloadKey);
					preloadControllers.get(preloadKey)?.abort();
					preloadControllers.delete(preloadKey);
					if ((error as Error).name === 'AbortError') throw error;
					assertActiveNavigation(transaction);
					window.location.href = finalUrl;
					return;
				}
				preloadCache.delete(preloadKey); // consume cache
				preloadControllers.delete(preloadKey);
			} else {
				try {
					// Update progress to rand 20 - 30%
					progressBar?.setProgress(Math.random() * 10 + 20);

					transaction.interval = setInterval(setRand, 300);

					response = await fetch(finalUrl, init);
					assertActiveNavigation(transaction);
					// Update progress to rand 70 - 80% after fetch
					progressBar?.setProgress(Math.random() * 10 + 70);
					if (transaction.interval) clearInterval(transaction.interval);
					transaction.interval = null;
				} catch (error) {
					// Check if navigation was cancelled
					if ((error as Error).name === 'AbortError') {
						log('[GyosRouter] Navigation cancelled');
						return;
					}
					if (isActiveNavigation(transaction)) fallbackFromBoost(opts, finalUrl, true);
					return;
				}
			}
			assertActiveNavigation(transaction);

			// If response not ok, fallback to full navigation
			if (!response || !response.ok || !isNavigableHtmlResponse(response)) {
				if (isActiveNavigation(transaction)) fallbackFromBoost(opts, finalUrl, true);
				return;
			}

			html = await response.text();
			assertActiveNavigation(transaction);
			if (!opts.popstate && target.hasAttribute('g-snapshot')) {
				saveSnapshot(canonicalUrl(response.url || finalUrl), html);
			}
		}

		// Parse HTML
		const doc = html
			? parseNavigationDocument(html)
			: document.implementation.createHTMLDocument();

		// Pick source fragment
		const src = opts.historyFragment || pickSourceFragment(doc, target, targetOutletIndex);
		stripInertFallbackContent(src);
		assertActiveNavigation(transaction);

		// Final URL is response.url because in headers there could be redirects
		// because response.url never include hash, we need to manually merge it
		let targetUrl = response?.url || finalUrl;
		if (finalUrl.includes('#') && response?.url) {
			targetUrl += finalUrl.substring(finalUrl.indexOf('#'));
		}
		resolveIncomingScriptUrls(doc, targetUrl);
		if (opts.historyFragment) resolveIncomingScriptUrls(src, targetUrl);

		const triggerChangesState = opts.trigger?.hasAttribute('g-change-state') || false;
		const keepsCurrentState = opts.trigger?.hasAttribute('g-current-state') || false;
		const redirectedSubmission = opts.method.toUpperCase() !== 'GET' && response?.redirected === true;
		const changesState = !keepsCurrentState && (
			opts.changeState === true || triggerChangesState || redirectedSubmission
		);

		const performUpdate = async () => {
			assertActiveNavigation(transaction);
			transaction.committing = true;
			// Update progress to rand 80 - 90% before swap
			progressBar?.setProgress(Math.random() * 10 + 80);
			const outgoingHistoryFragment = changesState && !opts.replace && !isFullOutletNavigation
				? cloneHistoryTarget(target!)
				: null;
			let historyEdge: { currentEntryId: string; nextEntryId: string } | null = null;
			let committedRoots: Node[] = [];
			let finalized = false;
			const finalizeCommit = () => {
				if (finalized) return;
				finalized = true;
				const mountRoots = committedRoots.filter(
					(root): root is HTMLElement => root instanceof HTMLElement && root.isConnected
				);
				mergePersistIntoLive(target!);
				if (historyEdge) {
					setHistoryFragment(historyEdge.nextEntryId, historyEdge.currentEntryId, target!);
				}
				mountAll(mountRoots.length > 0 ? mountRoots : undefined);
			};

			if (destructiveSwap) {
				detachPersist(target!);
				cleanupTarget(target!);
			}

			// Page scripts should observe the destination URL, including scripts in
			// partial responses whose relative sources were normalized above.
			if (changesState) {
				if (opts.replace) {
					const entryId = ensureCurrentHistoryEntryId(false);
					history.replaceState({
						...(history.state || {}),
						gyos: true,
						gyosEntryId: entryId
					}, '', targetUrl);
				} else {
					const currentEntryId = ensureCurrentHistoryEntryId(false);
					const nextEntryId = createHistoryEntryId();
					const currentState = (history.state || {}) as GyosHistoryState;
					history.replaceState({
						...currentState,
						gyos: true,
						gyosEntryId: currentEntryId,
						gyosRoutes: {
							...(currentState.gyosRoutes || {}),
							[nextEntryId]: routerHistoryState
						}
					}, '');
					history.pushState({
						gyos: true,
						gyosEntryId: nextEntryId,
						gyosRoutes: { [currentEntryId]: routerHistoryState }
					}, '', targetUrl);

					// Partial history restores only the changed fragment. Full outlet
					// navigations continue to use complete page snapshots or refetching.
					if (outgoingHistoryFragment) {
						setHistoryFragment(currentEntryId, nextEntryId, outgoingHistoryFragment);
						historyEdge = { currentEntryId, nextEntryId };
					}
					currentHistoryEntryId = nextEntryId;
				}
			}
			// The global outlet is also the incoming layout root. Keep its node for
			// inner swaps, but update attributes such as g-scope and layout classes.
			try {
					target = await performSwap(target!, src, swapMode, {
					syncRootAttributes: isFullOutletNavigation,
					signal: transaction.controller.signal,
						beforeScripts: async () => {
						if (!isFullOutletNavigation || currentHead) return;
						const incomingTitle = doc.querySelector('title');
						if (incomingTitle) {
							document.title = incomingTitle.textContent || document.title;
						}
						await updateHead(doc, transaction.controller.signal);
						assertActiveNavigation(transaction);
						},
						onCommitted: (committedTarget, roots) => {
							target = committedTarget;
							committedRoots = roots;
						}
					});
				assertActiveNavigation(transaction);

				if (isFullOutletNavigation) {
					await scriptNotInOutletTarget(doc, target, src, transaction.controller.signal);
					assertActiveNavigation(transaction);
				}
			} finally {
				// A popstate can abort pending scripts after the DOM has already swapped.
				// Always reconnect persisted islands and mount the committed DOM first.
				finalizeCommit();
			}

			// Handle scroll after mount scopes
			if (changesState) {
				handleScroll(targetUrl, opts.trigger);
			} else if (opts.popstate) {
				handleScroll(targetUrl, opts.trigger, opts.savedScroll);
			} else {
				const state = history.state;
				handleScroll(targetUrl, opts.trigger, state?.scroll);
			}

		};

		// Apply view transition if available
		if ((document as any).startViewTransition) {
			const transition = (document as any).startViewTransition(() => performUpdate());
			consumeViewTransitionRejection(transition?.ready);
			consumeViewTransitionRejection(transition?.finished);
			if (transition?.updateCallbackDone) {
				await transition.updateCallbackDone;
			}
		} else {
			await performUpdate();
		}

		assertActiveNavigation(transaction);
		if (removeTriggerAfterCommit && opts.trigger instanceof HTMLElement && opts.trigger.isConnected) {
			disposeEffects(opts.trigger);
			opts.trigger.remove();
		}
		if (hasTargetSpinner) hideTargetSpinner(transaction.spinner);
		transaction.spinner = null;
		runNavigationHooks(afterNavigate, targetUrl);
		log('[GyosRouter] navigated to', targetUrl);
		currentUrl = changesState
			? canonicalUrl(targetUrl, true)
			: canonicalUrl(window.location.href, true);
		if (opts.popstate && opts.historyEntryId) {
			currentHistoryEntryId = opts.historyEntryId;
		}
	} catch (error) {
		// Check if navigation was cancelled
		if ((error as Error).name === 'AbortError') {
			log('[GyosRouter] Navigation cancelled (outer)');
			return;
		}
		if (isActiveNavigation(transaction)) {
			console.error('[GyosRouter] navigation error', error);
			fallbackFromBoost(opts, opts.url, true);
		}
	} finally {
		if (transaction.interval) clearInterval(transaction.interval);
		if (transaction.spinner) hideTargetSpinner(transaction.spinner);
		if (activeNavigation?.id === transaction.id) {
			activeNavigation = null;
			progressBar?.complete();
		}
		transaction.resolveDone();
	}
}

function shouldBoost(el: Element): boolean {
	if (el.closest('[g-no-boost]')) return false;
	return el.hasAttribute('g-boost') || hasGlobalBoost();
}

function onClickRouter(element: Element) : void {
	log('[GyosRouter] g-router-link clicked');
	const routerAttr = 'g-router-link';
	const methodAttr = 'g-router-method';
	const paramsAttr = 'g-router-params';
	const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
	const url = element.getAttribute(routerAttr);
	const method = element.getAttribute(methodAttr) || 'GET';

	if (!url || !allowedMethods.includes(method.toUpperCase())) return;
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url, window.location.href);
	} catch {
		return;
	}
	if (parsedUrl.origin !== window.location.origin) return;

	try {
		const scope = getScopeFromElement(element as HTMLElement);
		const jsonData = evaluateExpression(
			decodeURIComponent(element.getAttribute(paramsAttr) || '')
		, scope, false);

		// The default changeState is false, as this is commonly used for: load more, infinite scroll, etc.
		navigate({
			url: parsedUrl.toString(), method, trigger: element, jsonData, changeState: false
		});
	} catch (error) {
		console.error('[GyosRouter] g-router-link navigation error, falling back', error);
		return; // this case not link (tag a) or form so do nothing
	}
}

function onClick(event: MouseEvent): void {
	if (event.defaultPrevented) return;
	if (event.button !== 0) return;
	if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

	const target = event.target as Element | null;
	if (!target) return;

	// If has attribute g-router-link, treat as boost link
	const hasRouterLink = target.closest('[g-router-link]');

	if (hasRouterLink) {
		if (hasRouterLink.closest('[g-no-boost]')) return;
		event.preventDefault();
		onClickRouter(hasRouterLink as Element);
		return;
	}

	const link = target.closest('a');
	if (!link) return;
	const href = link.getAttribute('href');
	if (!href) return;

	const url = new URL(href, window.location.href);
	if (url.origin !== window.location.origin) return;
	if (url.hash && canonicalUrl(url.href) === canonicalUrl(window.location.href)) return;
	if (link.closest('[g-no-boost]')) return;
	if (link.hasAttribute('download')) return;
	if (link.getAttribute('target') && link.getAttribute('target') !== '_self') return;

	if (!shouldBoost(link)) return;

	event.preventDefault();
	// The default changeState is true, as this is commonly used for: navigation, etc.
	navigate({ url: url.toString(), method: 'GET', trigger: link, changeState: true });
}

function onMouseOverCapture(event: MouseEvent): void {
	const target = event.target as Element | null;
	if (!target) return;

	const link = target.closest('a[g-preload]');
	if (!link) return;

	const href = link.getAttribute('href');
	if (!href) return;

	const url = new URL(href, window.location.href);
	if (url.origin !== window.location.origin) return;

	preload(url.toString());
}

function onSubmit(event: Event): void {
	if (event.defaultPrevented) return;

	const form = event.target as HTMLFormElement | null;
	if (!form || form.tagName.toLowerCase() !== 'form') return;

	if (form.closest('[g-no-boost]')) return;
	if (!(form.hasAttribute('g-boost') || hasGlobalBoost())) return;
	if (shouldDeferToFormValidation(form)) return;

	event.preventDefault();

	const action = form.action || window.location.href;
	const method = (form.method || 'GET').toUpperCase();
	const url = new URL(action, window.location.href);
	if (url.origin !== window.location.origin) {
		window.location.href = url.toString();
		return;
	}

	const formData = new FormData(form);
	navigate({ url: url.toString(), method, trigger: form, form, formData, changeState: method === 'GET' });
}

function onPopState(event: PopStateEvent): void {
	const url = window.location.href;
	const sourceEntryId = currentHistoryEntryId;
	const destinationState = (event.state || {}) as GyosHistoryState;
	const destinationEntryId = destinationState.gyosEntryId || null;
	const routerState = sourceEntryId
		? destinationState.gyosRoutes?.[sourceEntryId]
		: undefined;

	// Hash-only history changes belong to the browser and do not require a fetch.
	if (canonicalUrl(url) === canonicalUrl(currentUrl) && (!destinationEntryId || destinationEntryId === sourceEntryId)) {
		currentUrl = canonicalUrl(url, true);
		currentHistoryEntryId = destinationEntryId || sourceEntryId;
		return;
	}

	event.preventDefault();
	// The browser changes location before popstate fires. Stop any pending page
	// script immediately, then let navigate() wait for its DOM finalizer.
	if (activeNavigation?.committing) cancelNavigation(activeNavigation);
	// The browser has already moved to the destination history entry. Keep the
	// router's entry pointer aligned before any restored page script can navigate.
	currentHistoryEntryId = destinationEntryId;
	// No snapshot, do a normal navigation without changing history (changeState: false)
	navigate({
		url,
		method: 'GET',
		replace: true,
		changeState: false,
		popstate: true,
		savedScroll: (destinationEntryId ? scrollPositions.get(destinationEntryId) : undefined) || destinationState.scroll,
		targetSelector: routerState?.targetSelector,
		targetOutletIndex: routerState?.targetOutletIndex,
		swapMode: routerState?.swapMode,
		currentHead: routerState?.currentHead,
		historyFragment: sourceEntryId && destinationEntryId
			? getHistoryFragment(destinationEntryId, sourceEntryId)
			: undefined,
		historyEntryId: destinationEntryId,
		scrollSourceEntryId: sourceEntryId
	});
}

function resetRouterState(): void {
	document.removeEventListener('click', onClick);
	document.removeEventListener('submit', onSubmit);
	document.removeEventListener('mouseover', onMouseOverCapture, true);
	window.removeEventListener('popstate', onPopState);
	if (activeNavigation) cancelNavigation(activeNavigation);
	activeNavigation = null;
	navigationSequence = 0;
	historyEntrySequence = 0;
	routerStarted = false;
	progressBar = null;
	progressBarEnabled = true;
	snapshots.clear();
	preloadControllers.forEach(controller => controller.abort());
	preloadControllers.clear();
	preloadCache.clear();
	scrollPositions.clear();
	historyFragments.clear();
	currentUrl = canonicalUrl(window.location.href, true);
	currentHistoryEntryId = (history.state as GyosHistoryState | null)?.gyosEntryId || null;
	beforeNavigate.length = 0;
	afterNavigate.length = 0;
}

// Expose minimal internals for tests (not part of public API)
export const __routerTest = {
	navigate,
	saveSnapshot,
	snapshots,
	preloadCache,
	resetRouterState
};
