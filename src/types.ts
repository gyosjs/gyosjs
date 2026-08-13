/**
 * Signal - Reactive primitive (callable)
 * Can be called as function: signal() = read, signal(value) = write
 */
export interface Signal<T = any> {
	(): T;                                    // Call without args = read
	(value: T): T;                           // Call with arg = write
	value: T;                                // Property getter/setter
	readonly peek: T;                        // Non-tracking read
	update(fn: (value: T) => T): void;      // Update with function
	subscribe(fn: () => void): () => void;  // Subscribe to changes,
	__gyos_signal__: true;                       // Marker property
	__gyos_debug_id__?: number;             // Debug identifier
	__gyos_debug_label__?: string;          // Optional debug label
}

export interface SignalOptions<T = any> {
	debugLabel?: string;
	equals?: (a: T, b: T) => boolean;
}

/**
 * Computed - Derived reactive value (callable, read-only)
 * Can be called as function: computed() = read value
 */
export interface Computed<T = any> {
	(): T;                                   // Call to read value
	readonly value: T;                       // Property getter
	readonly peek: T;                        // Non-tracking read
	subscribe(fn: () => void): () => void;  // Subscribe to changes
	__gyos_computed__: true;                   // Marker property
}

/**
 * Scope definition
 */
export interface Scope {
	[key: string]: any;
	onMount?(): void | Promise<void>;
	onUnmount?(): void;
	onUpdate?(): void;
}

export type ScopeFactory = (context: ComponentContext) => Scope;
export type ScopeDefinition = Scope | ScopeFactory;

/**
 * Component context
 */
export interface ComponentContext {
	inject<T = any>(key: string): T;
	provide(key: string, value: any): void;
	$refs: Record<string, HTMLElement>;
	$emit(event: string, ...args: any[]): void;
	$on(event: string, handler: Function): () => void;
	$watch(key: string, handler: WatchCallback, options?: WatchOptions): () => void;
	$effect(fn: () => void | (() => void)): () => void;
}

/**
 * Watch callback
 */
export type WatchCallback<T = any> = (newValue: T, oldValue: T) => void;

/**
 * Watch options
 */
export interface WatchOptions {
	immediate?: boolean;
	debounce?: number;
	deep?: boolean;
}

/**
 * Directive definition
 */
export interface Directive {
	mounted?(el: HTMLElement, binding: DirectiveBinding, scope?: Scope): void;
	updated?(el: HTMLElement, binding: DirectiveBinding, scope?: Scope): void;
	unmounted?(el: HTMLElement): void;
}

/**
 * Directive binding
 */
export interface DirectiveBinding {
	value: any;
	oldValue: any;
	arg?: string[];
}

export interface RevealOptions {
	className?: string;
	once?: boolean;
	rootMargin?: string;
	target?: 'self' | 'parent';
	threshold?: number | number[];
}

/**
 * Pipe function
 */
export type PipeFn<T = any, R = any> = (value: T, ...args: any[]) => R;

/**
 * Validator function
 */
export type ValidatorFn = (value: any, ...args: any[]) => boolean | string | Promise<boolean | string>;

/**
 * Hydration strategy
 */
export type HydrationStrategy = 'idle' | 'visible' | 'interaction' | `media(${string})`;

export interface StructuralElement { 
	element: HTMLElement; 
	type: 'if' | 'for' | 'switch' | 'await'; 
	depth: number 
}
