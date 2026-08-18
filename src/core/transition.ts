/**
 * Transitions System - Smooth animations for enter/leave
 * 
 * Provides built-in transitions and custom transition support for elements.
 * Works with conditional rendering (*if, *for) to animate element appearance.
 * 
 * @example Basic usage
 * ```html
 * <div *if="show" g-transition="fade">Content</div>
 * <div *if="show" g-transition.500="slide-down">Slower slide</div>
 * ```
 */

import { expressionRuntimeMode } from '../runtime/evaluator';

export interface TransitionConfig {
	/** CSS animation name for enter (e.g., 'gyos-fade-in 250ms') */
	enter?: string;
	/** CSS animation name for leave (e.g., 'gyos-fade-out 250ms') */
	leave?: string;
	/** CSS classes to apply at the start of enter transition */
	enterFrom?: string;
	/** CSS classes to apply at the end of enter transition */
	enterTo?: string;
	/** CSS classes to apply at the start of leave transition */
	leaveFrom?: string;
	/** CSS classes to apply at the end of leave transition */
	leaveTo?: string;
	/** Transition duration in milliseconds (default: 250) */
	duration?: number;
	/** Hook called before enter transition starts */
	onBeforeEnter?: (el: HTMLElement) => void;
	/** Hook called after enter transition completes */
	onAfterEnter?: (el: HTMLElement) => void;
	/** Hook called before leave transition starts */
	onBeforeLeave?: (el: HTMLElement) => void;
	/** Hook called after leave transition completes */
	onAfterLeave?: (el: HTMLElement) => void;
}

/**
 * Built-in transitions
 * 
 * Available: fade, slide-down, slide-up, slide-left, slide-right, scale, zoom
 */
const builtInTransitions: Record<string, TransitionConfig> = {
	fade: {
		enterFrom: 'gyos-t-opacity-0',
		enterTo: 'gyos-t-opacity-100',
		leaveFrom: 'gyos-t-opacity-100',
		leaveTo: 'gyos-t-opacity-0',
		duration: 250
	},
	'slide-down': {
		enterFrom: 'gyos-t-translate-y--100 gyos-t-opacity-0',
		enterTo: 'gyos-t-translate-y-0 gyos-t-opacity-100',
		leaveFrom: 'gyos-t-translate-y-0 gyos-t-opacity-100',
		leaveTo: 'gyos-t-translate-y-100 gyos-t-opacity-0',
		duration: 250
	},
	'slide-up': {
		enterFrom: 'gyos-t-translate-y-100 gyos-t-opacity-0',
		enterTo: 'gyos-t-translate-y-0 gyos-t-opacity-100',
		leaveFrom: 'gyos-t-translate-y-0 gyos-t-opacity-100',
		leaveTo: 'gyos-t-translate-y--100 gyos-t-opacity-0',
		duration: 250
	},
	'slide-left': {
		enterFrom: 'gyos-t-translate-x-100 gyos-t-opacity-0',
		enterTo: 'gyos-t-translate-x-0 gyos-t-opacity-100',
		leaveFrom: 'gyos-t-translate-x-0 gyos-t-opacity-100',
		leaveTo: 'gyos-t-translate-x--100 gyos-t-opacity-0',
		duration: 250
	},
	'slide-right': {
		enterFrom: 'gyos-t-translate-x--100 gyos-t-opacity-0',
		enterTo: 'gyos-t-translate-x-0 gyos-t-opacity-100',
		leaveFrom: 'gyos-t-translate-x-0 gyos-t-opacity-100',
		leaveTo: 'gyos-t-translate-x-100 gyos-t-opacity-0',
		duration: 250
	},
	scale: {
		enterFrom: 'gyos-t-scale-50 gyos-t-opacity-0',
		enterTo: 'gyos-t-scale-100 gyos-t-opacity-100',
		leaveFrom: 'gyos-t-scale-100 gyos-t-opacity-100',
		leaveTo: 'gyos-t-scale-50 gyos-t-opacity-0',
		duration: 250
	},
	zoom: {
		enterFrom: 'gyos-t-scale-0 gyos-t-opacity-0',
		enterTo: 'gyos-t-scale-100 gyos-t-opacity-100',
		leaveFrom: 'gyos-t-scale-100 gyos-t-opacity-100',
		leaveTo: 'gyos-t-scale-0 gyos-t-opacity-0',
		duration: 250
	}
};

/**
 * Register a custom transition
 * 
 * @param name - Transition name
 * @param config - Transition configuration
 * 
 * @example
 * ```javascript
 * Gyos.registerTransition('bounce-in', {
 *   enter: 'bounce-in 500ms cubic-bezier(0.68, -0.55, 0.265, 1.55)',
 *   leave: 'bounce-out 250ms ease-in',
 *   duration: 500
 * });
 * ```
 */
export function registerTransition(name: string, config: TransitionConfig): void {
	builtInTransitions[name] = config;
}

/**
 * Transition manager - Handles enter/leave animations
 */
class TransitionManager {
	private active = new WeakMap<HTMLElement, { phase: 'enter' | 'leave'; cancel: () => void }>();

	cancel(el: HTMLElement): void {
		this.active.get(el)?.cancel();
	}

	enter(el: HTMLElement, config: TransitionConfig, interruptLeave = false): Promise<boolean> {
		if (!el.isConnected) return Promise.resolve(false);
		if (this.active.get(el)?.phase === 'leave' && !interruptLeave) return Promise.resolve(false);
		return this.run(el, config, 'enter', false);
	}

	leave(el: HTMLElement, config: TransitionConfig, removeElement = true): Promise<boolean> {
		return this.run(el, config, 'leave', removeElement);
	}

	private run(
		el: HTMLElement,
		config: TransitionConfig,
		phase: 'enter' | 'leave',
		removeElement: boolean
	): Promise<boolean> {
		this.cancel(el);
		const fromClasses = phase === 'enter' ? config.enterFrom : config.leaveFrom;
		const toClasses = phase === 'enter' ? config.enterTo : config.leaveTo;
		const animation = phase === 'enter' ? config.enter : config.leave;
		const beforeHook = phase === 'enter' ? config.onBeforeEnter : config.onBeforeLeave;
		const afterHook = phase === 'enter' ? config.onAfterEnter : config.onAfterLeave;
		const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
		const duration = reduceMotion ? 0 : (config.duration ?? 250);
		const originalTransition = el.style.transition;
		const originalAnimation = el.style.animation;

		return new Promise(resolve => {
			let settled = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const cleanup = () => {
				if (fromClasses) this.removeClasses(el, fromClasses);
				if (toClasses) this.removeClasses(el, toClasses);
				el.style.transition = originalTransition;
				el.style.animation = originalAnimation;
				el.removeEventListener('transitionend', onEnd);
				el.removeEventListener('animationend', onEnd);
				if (timer !== undefined) clearTimeout(timer);
				this.active.delete(el);
			};
			const finish = (cancelled: boolean) => {
				if (settled) return;
				settled = true;
				cleanup();
				if (!cancelled) {
					afterHook?.(el);
					if (phase === 'leave' && removeElement) el.remove();
				}
				resolve(!cancelled);
			};
			const onEnd = (event: Event) => {
				if (event.target === el) finish(false);
			};

			this.active.set(el, { phase, cancel: () => finish(true) });
			try {
				beforeHook?.(el);
				if (fromClasses) this.applyClasses(el, fromClasses);
				el.offsetHeight;
				el.style.transition = `all ${duration}ms ${phase === 'enter' ? 'ease-out' : 'ease-in'}`;
				if (fromClasses) this.removeClasses(el, fromClasses);
				if (toClasses) this.applyClasses(el, toClasses);
				if (animation) el.style.animation = animation;
				if (duration === 0) {
					queueMicrotask(() => finish(false));
				} else {
					el.addEventListener('transitionend', onEnd);
					el.addEventListener('animationend', onEnd);
					timer = setTimeout(() => finish(false), duration + 50);
				}
			} catch (error) {
				console.error(`[GyosJS] Transition ${phase} error:`, error);
				finish(false);
			}
		});
	}

	/**
	 * Apply CSS classes
	 */
	private applyClasses(el: HTMLElement, classes: string): void {
		classes.split(' ').forEach(cls => {
			if (cls) el.classList.add(cls);
		});
	}

	/**
	 * Remove CSS classes
	 */
	private removeClasses(el: HTMLElement, classes: string): void {
		classes.split(' ').forEach(cls => {
			if (cls) el.classList.remove(cls);
		});
	}

	/**
	 * Get transition config by name or return custom config
	 * 
	 * @param name - Transition name or custom config object
	 * @returns Transition configuration
	 */
	getConfig(name: string | TransitionConfig): TransitionConfig {
		if (typeof name === 'object') {
			return name;
		}

		return builtInTransitions[name] || builtInTransitions.fade;
	}

	/**
	 * Get all available transition names
	 * 
	 * @returns Array of transition names
	 */
	getAvailableTransitions(): string[] {
		return Object.keys(builtInTransitions);
	}
}

// Singleton instance
export const transitionManager = new TransitionManager();

/**
 * Get transition config from element attribute
 * 
 * Supports:
 * - `g-transition="fade"` - Built-in transition
 * - `g-transition.500="fade"` - Custom duration (500ms)
 * 
 * @param source - Registered transition name or element containing a transition attribute
 * @returns Transition configuration or null
 * 
 * @example
 * ```html
 * <div g-transition="fade">Default 250ms fade</div>
 * <div g-transition.500="slide-down">500ms slide</div>
 * ```
 */
export function getTransitionConfig(source: HTMLElement | string): TransitionConfig | null {
	if (typeof source === 'string') {
		return builtInTransitions[source] || null;
	}

	const transitionAttr = Array.from(source.attributes).find(attribute =>
		attribute.name === 'g-transition' || attribute.name.startsWith('g-transition.')
	);
	if (!transitionAttr) return null;
	const attr = transitionAttr.value;

	try {
		// Try to parse as JSON for custom config
		const customConfig = JSON.parse(attr);
		return customConfig;
	} catch {
		// Use built-in transition by name
		const config = builtInTransitions[attr];
		if (!config) {
			console.warn(`[GyosJS] Unknown transition: "${attr}". Using "fade" as fallback.`);
			return builtInTransitions.fade;
		}

		// Check for duration modifier (e.g., g-transition.500="fade")
		if (transitionAttr.name.startsWith('g-transition.')) {
			const durationMatch = transitionAttr.name.match(/g-transition\.(\d+)/);
			if (durationMatch) {
				return {
					...config,
					duration: parseInt(durationMatch[1], 10)
				};
			}
		}

		return config;
	}
}

/**
 * Apply built-in transition utility styles to document
 * 
 * Called automatically on component mount. Adds CSS classes and keyframes
 * used by built-in transitions (opacity, transform, scale, etc.)
 * 
 * @example
 * ```javascript
 * // Usually called automatically, but can be called manually:
 * Gyos.applyTransitionStyles();
 * ```
 */
export function applyTransitionStyles(): void {
	if (typeof document === 'undefined') return;
	if (expressionRuntimeMode() === 'csp') return;

	const styleId = 'gyos-transitions';
	if (document.getElementById(styleId)) return;

	const style = document.createElement('style');
	style.id = styleId;
	style.textContent = `
    /* Opacity utilities */
    .gyos-t-opacity-0 { opacity: 0; }
    .gyos-t-opacity-100 { opacity: 1; }
    
    /* Transform - Translate Y */
    .gyos-t-translate-y-0 { transform: translateY(0); }
    .gyos-t-translate-y--100 { transform: translateY(-100%); }
    .gyos-t-translate-y-100 { transform: translateY(100%); }
    
    /* Transform - Translate X */
    .gyos-t-translate-x-0 { transform: translateX(0); }
    .gyos-t-translate-x--100 { transform: translateX(-100%); }
    .gyos-t-translate-x-100 { transform: translateX(100%); }
    
    /* Transform - Scale */
    .gyos-t-scale-0 { transform: scale(0); }
    .gyos-t-scale-50 { transform: scale(0.5); }
    .gyos-t-scale-100 { transform: scale(1); }
    
    /* Animation Keyframes */
    @keyframes gyos-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
    }
    
    @keyframes gyos-fade-out {
		from { opacity: 1; }
		to { opacity: 0; }
    }
    
    @keyframes gyos-slide-down {
		from { transform: translateY(-100%); opacity: 0; }
		to { transform: translateY(0); opacity: 1; }
    }
    
    @keyframes gyos-slide-up {
		from { transform: translateY(100%); opacity: 0; }
		to { transform: translateY(0); opacity: 1; }
    }
    
    @keyframes gyos-scale-in {
		from { transform: scale(0); opacity: 0; }
		to { transform: scale(1); opacity: 1; }
    }
    
    @keyframes gyos-scale-out {
		from { transform: scale(1); opacity: 1; }
		to { transform: scale(0); opacity: 0; }
    }

    [g-cloak] {
		display: none !important;
    }`;

	document.head.appendChild(style);
}
