/**
 * Composables - Reusable reactive logic
 */
import { signal, computed, effect } from '../reactivity/signal';
import type { Signal } from '../types';

/**
 * useFetch - Fetch data composable
 */
export function useFetch<T = any>(
	url: string | (() => string | Response | Promise<string | Response>)
) {
	const data = signal<T | null>(null);
	const loading = signal(true);
	const error = signal<Error | null>(null);

	const fetchData = async () => {
		loading.value = true;
		error.value = null;
		data.value = null;

		try {
			const request = typeof url === 'function' ? await url() : url;
			const response = typeof request === 'string' ? await fetch(request) : request;

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			data.value = await response.json();
		} catch (e) {
			error.value = e as Error;
		} finally {
			loading.value = false;
		}
	};

	return {
		data,
		loading,
		error,
		refetch: fetchData,
		onMount: fetchData
	};
}

/**
 * useCounter - Counter composable
 */
export function useCounter(initialValue = 0) {
	const count = signal(initialValue);
	const double = computed(() => count.value * 2);

	const increment = (step = 1) => {
		count.update(v => v + step);
	};

	const decrement = (step = 1) => {
		count.value -= step;
	};

	const reset = () => {
		count.update(() => initialValue);
	};

	return {
		count,
		double,
		increment,
		decrement,
		reset
	};
}

/**
 * useToggle - Toggle composable
 */
export function useToggle(initialValue = false) {
	const state = signal(initialValue);

	const toggle = () => {
		state.value = !state.value;
	};

	const setTrue = () => {
		state.value = true;
	};

	const setFalse = () => {
		state.value = false;
	};

	return {
		state,
		toggle,
		setTrue,
		setFalse,
		value: state
	};
}

/**
 * useLocalStorage - LocalStorage composable
 */
export function useLocalStorage<T>(key: string, defaultValue?: T) {
	const stored = localStorage.getItem(key);
	const initial = stored ? JSON.parse(stored) : (defaultValue ?? '');

	const state = signal<T>(initial);

	// Watch for changes and save to localStorage
	const save = () => localStorage.setItem(key, JSON.stringify(state.value));

	// Subscribe to changes
	const unsubscribe = state.subscribe(save);

	return {
		state,
		remove: () => localStorage.removeItem(key),
		onUnmount: unsubscribe
	};
}

/**
 * useInterval - Interval composable
 */
export function useInterval(callback: () => void, delay: number | null) {
	let intervalId: number | null = null;

	const start = () => {
		stop();
		if (delay !== null) {
			intervalId = setInterval(callback, delay) as any;
		}
	};

	const stop = () => {
		if (intervalId !== null) {
			clearInterval(intervalId);
			intervalId = null;
		}
	};

	return {
		start,
		stop,
		onMount: () => start(),
		onUnmount: () => stop(),
		restart: () => {
			stop();
			start();
		}
	};
}

/**
 * useTimeout - Timeout composable
 */
export function useTimeout(callback: () => void, delay: number) {
	let timeoutId: number | null = null;

	const start = () => {
		clear();
		timeoutId = setTimeout(() => {
			timeoutId = null;
			callback();
		}, delay) as any;
	};

	const clear = () => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
			timeoutId = null;
		}
	};

	return {
		start,
		clear,
		onMount: () => start(),
		onUnmount: () => clear()
	};
}

/**
 * useDebounce - Debounce composable
 */
export function useDebounce(initialValue = '', delay: number) {
	const value = signal(initialValue);
	const debouncedValue = signal(initialValue);
	let timeoutId: number | null = null;

	// Use effect to track value changes
	const dispose = effect(() => {
		const newValue = value.value;
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}

		timeoutId = setTimeout(() => {
			debouncedValue.value = newValue;
		}, delay) as any;
	});

	const onUnmount = () => {
		dispose();
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}
	}

	return {
		value,
		debounced: computed(() => debouncedValue.value),
		onUnmount
	};
}

/**
 * useThrottle - Throttle composable
 */
export function useThrottle(initialValue = '', delay: number) {
	const value = signal(initialValue);
	const throttledValue = signal(initialValue);
	let lastCall = 0;

	// Use effect to track value changes
	const dispose = effect(() => {
		const newValue = value.value;
		const now = Date.now();

		if (now - lastCall >= delay) {
			lastCall = now;
			throttledValue.value = newValue;
		}
	});

	const onUnmount = () => {
		dispose();
	}

	return {
		value,
		throttled: computed(() => throttledValue.value),
		onUnmount
	};
}

/**
 * useMouse - Mouse position composable
 */
export function useMouse() {
	const x = signal(0);
	const y = signal(0);

	const updatePosition = (e: MouseEvent) => {
		x.value = e.clientX;
		y.value = e.clientY;
	};

	const onMount = () => {
		window.addEventListener('mousemove', updatePosition);
	};

	const onUnmount = () => {
		window.removeEventListener('mousemove', updatePosition);
	};

	return { x, y, onMount, onUnmount };
}

/**
 * useWindowSize - Window size composable
 */
export function useWindowSize() {
	const width = signal(window.innerWidth);
	const height = signal(window.innerHeight);

	const updateSize = () => {
		width.value = window.innerWidth;
		height.value = window.innerHeight;
	};

	const onMount = () => {
		window.addEventListener('resize', updateSize);
	};

	const onUnmount = () => {
		window.removeEventListener('resize', updateSize);
	};

	return { width, height, onMount, onUnmount };
}

/**
 * useMediaQuery - Media query composable
 */
export function useMediaQuery(queries: { [key: string]: string }) {

	const matches: Record<string, Signal<boolean>> = {};
	const mqls: Record<string, MediaQueryList> = {};
	const listeners: Record<string, (e: MediaQueryListEvent) => void> = {};
	const keys = Object.keys(queries);

	// init signals with current state and prepare listeners
	for (const key of keys) {
		const mql = window.matchMedia(queries[key]);
		mqls[key] = mql;
		matches[key] = signal<boolean>(mql.matches);
		listeners[key] = (e: MediaQueryListEvent) => {
			matches[key].value = e.matches;
		};
	}

	const onMount = () => {
		for (const key of keys) {
			const mql = mqls[key];
			const listener = listeners[key];
			if (mql.addEventListener) {
				mql.addEventListener('change', listener);
			} else {
				(mql as any).addListener(listener);
			}
		}
	};

	const onUnmount = () => {
		for (const key of keys) {
			const mql = mqls[key];
			const listener = listeners[key];
			if (mql.removeEventListener) {
				mql.removeEventListener('change', listener);
			} else {
				(mql as any).removeListener(listener);
			}
		}
	};

	return { matches, onMount, onUnmount };
}

/**
 * useAsync - Async state composable
 */
export function useAsync<T>(asyncFn: () => Promise<T>, immediate = true) {
	const data = signal<T | null>(null);
	const loading = signal(false);
	const error = signal<Error | null>(null);

	const execute = async () => {
		loading.value = true;
		error.value = null;

		try {
			data.value = await asyncFn();
		} catch (e) {
			error.value = e as Error;
		} finally {
			loading.value = false;
		}
	};

	return {
		data,
		loading,
		error,
		execute,
		onMount: () => {
			if (immediate) execute();
		}
	};
}
