import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __routerTest, navigate, refresh, onNavigationEnd, onBeforeSwap } from '../src/core/router/router';

const html = (text: string) => `<!doctype html><html><head><title>${text}</title></head><body g-boost><main id="page" g-outlet><aside id="panel">${text}</aside></main></body></html>`;
const response = (text: string, url = location.href, status = 200) => ({
	ok: status < 400, status, url, headers: new Headers({ 'Content-Type': 'text/html' }), text: async () => html(text)
} as Response);

describe('public GET navigation', () => {
	beforeEach(() => {
		history.replaceState({}, '', '/start');
		__routerTest.resetRouterState();
		document.body.innerHTML = '<main id="page" g-boost g-outlet><aside id="panel">Original</aside></main>';
		vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
		vi.stubGlobal('fetch', vi.fn(async (url: string) => response('Next', url)));
	});
	afterEach(() => { __routerTest.resetRouterState(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

	it('pushes a GET and resolves its own outcome after end hooks', async () => {
		const end = vi.fn(); onNavigationEnd(end);
		const length = history.length;
		const result = await navigate('/next');
		expect(result).toMatchObject({ outcome: 'success', committed: true, status: 200, method: 'GET' });
		expect(end).toHaveBeenCalledTimes(1);
		expect(location.pathname).toBe('/next'); expect(history.length).toBe(length + 1);
		expect(document.querySelector('#panel')?.textContent).toBe('Next');
	});
	it('replaces history without adding an entry', async () => {
		const length = history.length;
		await navigate('/replacement', { history: 'replace' });
		expect(location.pathname).toBe('/replacement'); expect(history.length).toBe(length);
	});
	it('refreshes using a fresh request without changing URL or scrolling', async () => {
		__routerTest.preloadCache.set(location.href, Promise.resolve(response('Stale')));
		const length = history.length;
		await refresh();
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(document.querySelector('#panel')?.textContent).toBe('Next');
		expect(location.pathname).toBe('/start'); expect(history.length).toBe(length);
		expect(window.scrollTo).not.toHaveBeenCalled();
	});
	it('targets a partial without adopting the full document title', async () => {
		document.title = 'Original';
		await navigate('/partial', { target: '#panel', history: 'none', scroll: false });
		expect(document.title).toBe('Original'); expect(location.pathname).toBe('/start');
		expect(document.querySelector('#page #panel')?.textContent).toBe('Next');
	});
	it.each(['https://external.invalid/', 'javascript:alert(1)', 'https://user:secret@localhost/'])('rejects unsafe destinations before requests: %s', async url => {
		await expect(navigate(url)).rejects.toThrow(TypeError); expect(fetch).not.toHaveBeenCalled();
	});
	it('rejects a missing explicit target instead of replacing the page', async () => {
		await expect(navigate('/next', { target: '#missing' })).rejects.toThrow('target');
		expect(fetch).not.toHaveBeenCalled();
	});
	it('returns aborted without requesting for a pre-aborted signal', async () => {
		const abort = new AbortController(); abort.abort();
		expect(await navigate('/next', { signal: abort.signal })).toMatchObject({ outcome: 'aborted', committed: false });
		expect(fetch).not.toHaveBeenCalled();
	});

	it('does not cancel an active request when the next caller is already aborted', async () => {
		let resolve!: (value: Response) => void;
		vi.mocked(fetch).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
		const first = navigate('/first');
		const abort = new AbortController(); abort.abort();
		expect(await navigate('/ignored', { signal: abort.signal })).toMatchObject({ outcome: 'aborted', committed: false });
		resolve(response('First', `${location.origin}/first`));
		expect(await first).toMatchObject({ outcome: 'success', committed: true });
	});
	it('cancels an in-flight request without disposing the visible page', async () => {
		const dispose = vi.fn(); onBeforeSwap(dispose);
		vi.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
			init!.signal!.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
		}));
		const abort = new AbortController(); const pending = navigate('/slow', { signal: abort.signal });
		abort.abort();
		expect(await pending).toMatchObject({ outcome: 'aborted', committed: false });
		expect(dispose).not.toHaveBeenCalled(); expect(document.querySelector('#panel')?.textContent).toBe('Original');
	});
	it('does not confuse results when a newer navigation supersedes a request', async () => {
		vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
			init!.signal!.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
		}));
		const first = navigate('/slow'); const second = navigate('/fast');
		expect(await first).toMatchObject({ outcome: 'aborted', committed: false });
		expect(await second).toMatchObject({ outcome: 'success', committed: true, url: `${location.origin}/fast` });
	});
});
