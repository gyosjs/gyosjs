// Default export
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

export type {
	ComponentContext,
	Computed,
	Directive,
	DirectiveBinding,
	HydrationStrategy,
	PipeFn,
	Scope,
	Signal,
	SignalOptions,
	ValidatorFn,
	WatchCallback,
	WatchOptions
} from './types';
export type { TransitionConfig } from './core/transition';
export type { RouterOptions } from './core/router/router';
export type { ValidationContext } from './form/validator';

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
	version: '0.1.0'
};

export default Gyos;
