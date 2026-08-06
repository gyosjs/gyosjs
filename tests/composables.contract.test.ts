import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Gyos from '../src/index';

const flushEffects = async () => {
	await Promise.resolve();
	await Promise.resolve();
};

const response = (body: unknown, status = 200): Response => ({
	ok: status >= 200 && status < 300,
	status,
	json: vi.fn().mockResolvedValue(body)
} as unknown as Response);

describe('documented composable contracts', () => {
	beforeEach(() => {
		vi.useRealTimers();
		const storage = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
			removeItem: (key: string) => storage.delete(key),
			clear: () => storage.clear()
		});
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('fetches on mount, refetches, and exposes HTTP errors', async () => {
		const fetchMock = vi.fn()
			.mockResolvedValueOnce(response({ page: 1 }))
			.mockResolvedValueOnce(response({ page: 2 }))
			.mockResolvedValueOnce(response(null, 503));
		vi.stubGlobal('fetch', fetchMock);

		const request = Gyos.useFetch<{ page: number }>('/api/pages');
		expect(request.loading()).toBe(true);
		expect(request.data()).toBeNull();

		await request.onMount();
		expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/pages');
		expect(request.data()).toEqual({ page: 1 });
		expect(request.error()).toBeNull();
		expect(request.loading()).toBe(false);

		await request.refetch();
		expect(request.data()).toEqual({ page: 2 });

		await request.refetch();
		expect(request.data()).toBeNull();
		expect(request.error()).toEqual(new Error('HTTP error! status: 503'));
		expect(request.loading()).toBe(false);
	});

	it('accepts a response factory without calling global fetch', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const factory = vi.fn().mockResolvedValue(response({ source: 'factory' }));
		const request = Gyos.useFetch<{ source: string }>(factory);

		await request.onMount();

		expect(factory).toHaveBeenCalledTimes(1);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(request.data()).toEqual({ source: 'factory' });
	});

	it('fetches a URL returned by a request factory', async () => {
		const fetchMock = vi.fn().mockResolvedValue(response({ source: 'factory-url' }));
		vi.stubGlobal('fetch', fetchMock);
		const factory = vi.fn(() => '/api/from-factory');
		const request = Gyos.useFetch<{ source: string }>(factory);

		await request.onMount();

		expect(factory).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith('/api/from-factory');
		expect(request.data()).toEqual({ source: 'factory-url' });
	});

	it('increments, decrements, doubles, and resets a counter', async () => {
		const counter = Gyos.useCounter(4);
		expect(counter.count()).toBe(4);
		expect(counter.double()).toBe(8);

		counter.increment();
		counter.increment(3);
		await flushEffects();
		expect(counter.count()).toBe(8);
		expect(counter.double()).toBe(16);

		counter.decrement(2);
		expect(counter.count()).toBe(6);
		counter.reset();
		expect(counter.count()).toBe(4);
	});

	it('toggles state through both aliases and explicit setters', () => {
		const toggle = Gyos.useToggle(true);
		expect(toggle.state()).toBe(true);
		expect(toggle.value).toBe(toggle.state);

		toggle.toggle();
		expect(toggle.value()).toBe(false);
		toggle.setTrue();
		expect(toggle.state()).toBe(true);
		toggle.setFalse();
		expect(toggle.state()).toBe(false);
	});

	it('hydrates, persists, removes, and unsubscribes local storage state', async () => {
		localStorage.setItem('preferences', JSON.stringify({ theme: 'dark' }));
		const stored = Gyos.useLocalStorage('preferences', { theme: 'light' });
		expect(stored.state()).toEqual({ theme: 'dark' });

		stored.state({ theme: 'contrast' });
		await flushEffects();
		expect(localStorage.getItem('preferences')).toBe('{"theme":"contrast"}');

		stored.onUnmount();
		stored.state({ theme: 'ignored' });
		await flushEffects();
		expect(localStorage.getItem('preferences')).toBe('{"theme":"contrast"}');

		stored.remove();
		expect(localStorage.getItem('preferences')).toBeNull();
	});

	it('starts, restarts, stops, and disables intervals deterministically', async () => {
		vi.useFakeTimers();
		const callback = vi.fn();
		const interval = Gyos.useInterval(callback, 25);

		interval.onMount();
		await vi.advanceTimersByTimeAsync(75);
		expect(callback).toHaveBeenCalledTimes(3);

		interval.restart();
		await vi.advanceTimersByTimeAsync(25);
		expect(callback).toHaveBeenCalledTimes(4);
		interval.stop();
		await vi.advanceTimersByTimeAsync(50);
		expect(callback).toHaveBeenCalledTimes(4);
		interval.onUnmount();

		const disabledCallback = vi.fn();
		const disabled = Gyos.useInterval(disabledCallback, null);
		disabled.onMount();
		await vi.advanceTimersByTimeAsync(100);
		expect(disabledCallback).not.toHaveBeenCalled();
		disabled.onUnmount();
	});

	it('replaces an existing interval when start is called again', async () => {
		vi.useFakeTimers();
		const callback = vi.fn();
		const interval = Gyos.useInterval(callback, 20);

		interval.start();
		interval.start();
		await vi.advanceTimersByTimeAsync(20);
		expect(callback).toHaveBeenCalledTimes(1);

		interval.onUnmount();
		await vi.advanceTimersByTimeAsync(40);
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('starts and clears timeouts through lifecycle actions', async () => {
		vi.useFakeTimers();
		const callback = vi.fn();
		const timeout = Gyos.useTimeout(callback, 20);

		timeout.onMount();
		await vi.advanceTimersByTimeAsync(19);
		expect(callback).not.toHaveBeenCalled();
		timeout.clear();
		await vi.advanceTimersByTimeAsync(1);
		expect(callback).not.toHaveBeenCalled();

		timeout.start();
		await vi.advanceTimersByTimeAsync(20);
		expect(callback).toHaveBeenCalledTimes(1);
		timeout.onUnmount();
	});

	it('replaces an existing timeout when start is called again', async () => {
		vi.useFakeTimers();
		const callback = vi.fn();
		const timeout = Gyos.useTimeout(callback, 20);

		timeout.start();
		await vi.advanceTimersByTimeAsync(10);
		timeout.start();
		await vi.advanceTimersByTimeAsync(10);
		expect(callback).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(10);
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('debounces the latest value and cancels pending work on unmount', async () => {
		vi.useFakeTimers();
		const debounced = Gyos.useDebounce('initial', 30);

		debounced.value('first');
		await flushEffects();
		await vi.advanceTimersByTimeAsync(20);
		debounced.value('latest');
		await flushEffects();
		await vi.advanceTimersByTimeAsync(29);
		expect(debounced.debounced()).toBe('initial');
		await vi.advanceTimersByTimeAsync(1);
		expect(debounced.debounced()).toBe('latest');

		debounced.value('cancelled');
		await flushEffects();
		debounced.onUnmount();
		await vi.advanceTimersByTimeAsync(30);
		expect(debounced.debounced()).toBe('latest');
	});

	it('throttles updates against a deterministic clock and disposes its effect', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000);
		const throttled = Gyos.useThrottle('initial', 100);

		throttled.value('too-soon');
		await flushEffects();
		expect(throttled.throttled()).toBe('initial');

		await vi.advanceTimersByTimeAsync(100);
		throttled.value('accepted');
		await flushEffects();
		expect(throttled.throttled()).toBe('accepted');

		throttled.onUnmount();
		await vi.advanceTimersByTimeAsync(100);
		throttled.value('ignored');
		await flushEffects();
		expect(throttled.throttled()).toBe('accepted');
	});

	it('tracks mouse coordinates only while mounted', () => {
		const mouse = Gyos.useMouse();
		mouse.onMount();
		window.dispatchEvent(new MouseEvent('mousemove', { clientX: 18, clientY: 42 }));
		expect(mouse.x()).toBe(18);
		expect(mouse.y()).toBe(42);

		mouse.onUnmount();
		window.dispatchEvent(new MouseEvent('mousemove', { clientX: 90, clientY: 91 }));
		expect(mouse.x()).toBe(18);
		expect(mouse.y()).toBe(42);
	});

	it('tracks window dimensions only while mounted', () => {
		const originalWidth = window.innerWidth;
		const originalHeight = window.innerHeight;
		Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
		Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });

		try {
			const size = Gyos.useWindowSize();
			expect(size.width()).toBe(800);
			expect(size.height()).toBe(600);

			size.onMount();
			Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
			Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
			window.dispatchEvent(new Event('resize'));
			expect(size.width()).toBe(1280);
			expect(size.height()).toBe(720);

			size.onUnmount();
			Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
			window.dispatchEvent(new Event('resize'));
			expect(size.width()).toBe(1280);
		} finally {
			Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
			Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
		}
	});

	it('tracks media queries and removes modern change listeners', () => {
		const controls = new Map<string, {
			matches: boolean;
			listeners: Set<(event: MediaQueryListEvent) => void>;
		}>();
		const matchMedia = vi.fn((query: string) => {
			const control = {
				matches: query.includes('min-width'),
				listeners: new Set<(event: MediaQueryListEvent) => void>()
			};
			controls.set(query, control);
			return {
				get matches() { return control.matches; },
				media: query,
				addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => control.listeners.add(listener),
				removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => control.listeners.delete(listener)
			} as MediaQueryList;
		});
		vi.stubGlobal('matchMedia', matchMedia);

		const media = Gyos.useMediaQuery({ wide: '(min-width: 1000px)', dark: '(prefers-color-scheme: dark)' });
		expect(media.matches.wide()).toBe(true);
		expect(media.matches.dark()).toBe(false);
		media.onMount();

		const dark = controls.get('(prefers-color-scheme: dark)')!;
		dark.matches = true;
		dark.listeners.forEach(listener => listener({ matches: true } as MediaQueryListEvent));
		expect(media.matches.dark()).toBe(true);

		media.onUnmount();
		dark.matches = false;
		dark.listeners.forEach(listener => listener({ matches: false } as MediaQueryListEvent));
		expect(media.matches.dark()).toBe(true);
	});

	it('supports legacy media query listener cleanup', () => {
		const listeners = new Set<(event: MediaQueryListEvent) => void>();
		const addListener = vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.add(listener));
		const removeListener = vi.fn((listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener));
		vi.stubGlobal('matchMedia', vi.fn(() => ({
			matches: false,
			addListener,
			removeListener
		} as unknown as MediaQueryList)));

		const media = Gyos.useMediaQuery({ reducedMotion: '(prefers-reduced-motion: reduce)' });
		media.onMount();
		expect(addListener).toHaveBeenCalledTimes(1);
		listeners.forEach(listener => listener({ matches: true } as MediaQueryListEvent));
		expect(media.matches.reducedMotion()).toBe(true);

		media.onUnmount();
		expect(removeListener).toHaveBeenCalledTimes(1);
		expect(listeners.size).toBe(0);
	});

	it('keeps immediate=false async work idle until execute succeeds', async () => {
		const loader = vi.fn().mockResolvedValue('loaded');
		const state = Gyos.useAsync(loader, false);

		state.onMount();
		expect(loader).not.toHaveBeenCalled();
		expect(state.loading()).toBe(false);

		const execution = state.execute();
		expect(state.loading()).toBe(true);
		await execution;
		expect(state.data()).toBe('loaded');
		expect(state.error()).toBeNull();
		expect(state.loading()).toBe(false);
	});

	it('runs immediate async work on mount and exposes rejected errors', async () => {
		let resolve!: (value: string) => void;
		const pending = new Promise<string>(done => { resolve = done; });
		const immediateLoader = vi.fn(() => pending);
		const immediate = Gyos.useAsync(immediateLoader);

		immediate.onMount();
		expect(immediateLoader).toHaveBeenCalledTimes(1);
		expect(immediate.loading()).toBe(true);
		resolve('ready');
		await flushEffects();
		expect(immediate.data()).toBe('ready');
		expect(immediate.loading()).toBe(false);

		const failure = new Error('load failed');
		const failed = Gyos.useAsync(async () => { throw failure; }, false);
		await failed.execute();
		expect(failed.data()).toBeNull();
		expect(failed.error()).toBe(failure);
		expect(failed.loading()).toBe(false);
	});
});
