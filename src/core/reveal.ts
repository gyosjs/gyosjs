import type { Directive, DirectiveBinding, RevealOptions } from '../types';

interface NormalizedRevealOptions {
	classNames: string[];
	once: boolean;
	rootMargin: string;
	target: 'self' | 'parent';
	threshold: number | number[];
}

interface RevealRecord {
	element: HTMLElement;
	observedTarget: Element;
	options: NormalizedRevealOptions;
	pool: RevealPool;
}

interface RevealPool {
	key: string;
	observer: IntersectionObserver;
	records: Map<Element, Set<RevealRecord>>;
}

const DEFAULT_OPTIONS: NormalizedRevealOptions = {
	classNames: ['is-revealed'],
	once: true,
	rootMargin: '0px 0px -8% 0px',
	target: 'self',
	threshold: 0.1
};

const pools = new Map<string, RevealPool>();
const mountedRecords = new WeakMap<HTMLElement, RevealRecord>();

function clampThreshold(value: unknown): number {
	const number = Number(value);
	if (!Number.isFinite(number)) return DEFAULT_OPTIONS.threshold as number;
	return Math.min(1, Math.max(0, number));
}

function normalizeThreshold(value: unknown): number | number[] {
	if (!Array.isArray(value)) return clampThreshold(value);
	const values = Array.from(new Set(value.map(clampThreshold))).sort((a, b) => a - b);
	return values.length ? values : DEFAULT_OPTIONS.threshold;
}

function normalizeOptions(binding: DirectiveBinding): NormalizedRevealOptions {
	const value = binding.value && typeof binding.value === 'object' && !Array.isArray(binding.value)
		? binding.value as RevealOptions
		: {};
	const args = new Set(binding.arg || []);
	const classNames = typeof value.className === 'string'
		? value.className.split(/\s+/).filter(Boolean)
		: DEFAULT_OPTIONS.classNames;

	return {
		classNames,
		once: typeof value.once === 'boolean' ? value.once : !args.has('repeat'),
		rootMargin: typeof value.rootMargin === 'string' ? value.rootMargin : DEFAULT_OPTIONS.rootMargin,
		target: value.target === 'parent' || args.has('parent') ? 'parent' : 'self',
		threshold: normalizeThreshold(value.threshold ?? DEFAULT_OPTIONS.threshold)
	};
}

function poolKey(options: NormalizedRevealOptions): string {
	return JSON.stringify([options.rootMargin, options.threshold]);
}

function setRevealed(record: RevealRecord, revealed: boolean): void {
	const { element, options } = record;
	if (revealed) {
		element.setAttribute('data-gyos-revealed', '');
		for (const className of options.classNames) element.classList.add(className);
	} else {
		element.removeAttribute('data-gyos-revealed');
		for (const className of options.classNames) element.classList.remove(className);
	}
}

function removeRecord(record: RevealRecord): void {
	if (mountedRecords.get(record.element) !== record) return;
	mountedRecords.delete(record.element);
	const records = record.pool.records.get(record.observedTarget);
	if (records) {
		records.delete(record);
		if (records.size === 0) {
			record.pool.records.delete(record.observedTarget);
			record.pool.observer.unobserve(record.observedTarget);
		}
	}
	if (record.pool.records.size === 0) {
		record.pool.observer.disconnect();
		pools.delete(record.pool.key);
	}
}

function createPool(options: NormalizedRevealOptions): RevealPool | null {
	const key = poolKey(options);
	const existing = pools.get(key);
	if (existing) return existing;

	let pool: RevealPool;
	try {
		const records = new Map<Element, Set<RevealRecord>>();
		const observer = new IntersectionObserver(entries => {
			for (const entry of entries) {
				const current = Array.from(records.get(entry.target) || []);
				for (const record of current) {
					if (entry.isIntersecting) {
						setRevealed(record, true);
						if (record.options.once) removeRecord(record);
					} else if (!record.options.once) {
						setRevealed(record, false);
					}
				}
			}
		}, { rootMargin: options.rootMargin, threshold: options.threshold });
		pool = { key, observer, records };
	} catch {
		return null;
	}

	pools.set(key, pool);
	return pool;
}

function prefersReducedMotion(): boolean {
	return typeof window.matchMedia === 'function'
		&& window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function mountReveal(element: HTMLElement, binding: DirectiveBinding): void {
	unmountReveal(element);
	document.documentElement.classList.add('gyos-reveal-ready');
	const options = normalizeOptions(binding);

	if (options.once && element.hasAttribute('data-gyos-revealed')) {
		for (const className of options.classNames) element.classList.add(className);
		return;
	}

	if (prefersReducedMotion() || typeof window.IntersectionObserver !== 'function') {
		const fallback = { element, options } as RevealRecord;
		setRevealed(fallback, true);
		return;
	}

	const pool = createPool(options);
	if (!pool) {
		const fallback = { element, options } as RevealRecord;
		setRevealed(fallback, true);
		return;
	}

	const observedTarget = options.target === 'parent' ? element.parentElement || element : element;
	const record: RevealRecord = { element, observedTarget, options, pool };
	let records = pool.records.get(observedTarget);
	if (!records) {
		records = new Set();
		pool.records.set(observedTarget, records);
		pool.observer.observe(observedTarget);
	}
	records.add(record);
	mountedRecords.set(element, record);
}

function unmountReveal(element: HTMLElement): void {
	const record = mountedRecords.get(element);
	if (!record) return;
	removeRecord(record);
	if (!record.options.once) setRevealed(record, false);
}

export const revealDirective: Directive = {
	mounted: mountReveal,
	updated(element, binding) {
		const previous = normalizeOptions({ ...binding, value: binding.oldValue });
		const next = normalizeOptions(binding);
		for (const className of previous.classNames) {
			if (!next.classNames.includes(className)) element.classList.remove(className);
		}
		mountReveal(element, binding);
	},
	unmounted: unmountReveal
};
