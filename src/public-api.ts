// Shared public surface used by the standard and CSP entries.
import { scope, mountAll, mount, mountTree } from './core/component';
import { getAllMountedScopes as mountedScopes } from './core/scope-registry';
import { applyDirective, directive } from './core/directive';
import { pipe } from './core/pipe';
import { provide, inject, getGlobalContainer } from './core/di';
import { store, hasStore, removeStore, getStoreNames } from './core/store';
import { on, emit, off, once, getEventListeners, clearAllEvents } from './core/events';
import { validator, validate, getValidator, getValidatorNames } from './form/validator';
import { signal, computed, effect, batch, isSignal, isComputed, unref, untrack } from './reactivity/signal';
import {
	useFetch,
	useCounter,
	useToggle,
	useLocalStorage,
	useInterval,
	useTimeout,
	useDebounce,
	useThrottle,
	useMouse,
	useWindowSize,
	useMediaQuery,
	useAsync
} from './core/composables';
import { applyTransitionStyles, registerTransition, getTransitionConfig } from './core/transition';
import { onAfterNavigate, onBeforeNavigate, startRouter } from './core/router/router';
import { debounce, nextTick, ready, throttle } from './utils/helpers';
import { disposeEffects as cleanup } from './template/cleanup';
import { markRaw, shallow } from './core/reactive';
import { portalCreate, portalDestroy } from './core/portal';
import { setCspNonce } from './runtime/csp-nonce';

export type {
	ComponentContext,
	Computed,
	Directive,
	DirectiveBinding,
	HydrationStrategy,
	PipeFn,
	RevealOptions,
	Scope,
	ScopeDefinition,
	ScopeFactory,
	Signal,
	SignalOptions,
	ValidatorFn,
	WatchCallback,
	WatchOptions
} from './types';
export type { TransitionConfig } from './core/transition';
export type { RouterOptions } from './core/router/router';
export type { ValidationContext } from './form/validator';
export type { CspNonceSource } from './runtime/csp-nonce';

// Named exports for tree-shaking
export {
	scope,
	mount,
	mountAll,
	mountTree,
	cleanup,
	mountedScopes,
	markRaw,
	shallow,
	directive,
	pipe,
	provide,
	inject,
	getGlobalContainer,
	store,
	hasStore,
	removeStore,
	getStoreNames,
	on,
	emit,
	off,
	once,
	getEventListeners,
	clearAllEvents,
	validator,
	validate,
	getValidator,
	getValidatorNames,
	signal,
	computed,
	effect,
	batch,
	isSignal,
	isComputed,
	unref,
	untrack,
	registerTransition,
	getTransitionConfig,
	useFetch,
	useCounter,
	useToggle,
	useLocalStorage,
	useInterval,
	useTimeout,
	useDebounce,
	useThrottle,
	useMouse,
	useWindowSize,
	useMediaQuery,
	useAsync,
	nextTick,
	debounce,
	throttle,
	ready,
	applyDirective,
	applyTransitionStyles,
	startRouter,
	onBeforeNavigate,
	onAfterNavigate,
	portalCreate,
	portalDestroy,
	setCspNonce,
};

// Default export remains for convenience (no side effects here)
const Gyos = {
	scope,
	mount,
	mountAll,
	mountTree,
	cleanup,
	mountedScopes,
	markRaw,
	shallow,
	directive,
	pipe,
	provide,
	inject,
	getGlobalContainer,
	store,
	hasStore,
	removeStore,
	getStoreNames,
	on,
	emit,
	off,
	once,
	getEventListeners,
	clearAllEvents,
	validator,
	validate,
	getValidator,
	getValidatorNames,
	signal,
	computed,
	effect,
	batch,
	isSignal,
	isComputed,
	unref,
	untrack,
	registerTransition,
	getTransitionConfig,
	useFetch,
	useCounter,
	useToggle,
	useLocalStorage,
	useInterval,
	useTimeout,
	useDebounce,
	useThrottle,
	useMouse,
	useWindowSize,
	useMediaQuery,
	useAsync,
	nextTick,
	debounce,
	throttle,
	ready,
	applyDirective,
	applyTransitionStyles,
	startRouter,
	onBeforeNavigate,
	onAfterNavigate,
	portalCreate,
	portalDestroy,
	setCspNonce,
	version: '0.3.1'
};

export default Gyos;
