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
		enterFrom: 'opacity-0',
		enterTo: 'opacity-100',
		leaveFrom: 'opacity-100',
		leaveTo: 'opacity-0',
		duration: 250
	},
	'slide-down': {
		enterFrom: 'translate-y--100 opacity-0',
		enterTo: 'translate-y-0 opacity-100',
		leaveFrom: 'translate-y-0 opacity-100',
		leaveTo: 'translate-y-100 opacity-0',
		duration: 250
	},
	'slide-up': {
		enterFrom: 'translate-y-100 opacity-0',
		enterTo: 'translate-y-0 opacity-100',
		leaveFrom: 'translate-y-0 opacity-100',
		leaveTo: 'translate-y--100 opacity-0',
		duration: 250
	},
	'slide-left': {
		enterFrom: 'translate-x-100 opacity-0',
		enterTo: 'translate-x-0 opacity-100',
		leaveFrom: 'translate-x-0 opacity-100',
		leaveTo: 'translate-x--100 opacity-0',
		duration: 250
	},
	'slide-right': {
		enterFrom: 'translate-x--100 opacity-0',
		enterTo: 'translate-x-0 opacity-100',
		leaveFrom: 'translate-x-0 opacity-100',
		leaveTo: 'translate-x-100 opacity-0',
		duration: 250
	},
	scale: {
		enterFrom: 'scale-50 opacity-0',
		enterTo: 'scale-100 opacity-100',
		leaveFrom: 'scale-100 opacity-100',
		leaveTo: 'scale-50 opacity-0',
		duration: 250
	},
	zoom: {
		enterFrom: 'scale-0 opacity-0',
		enterTo: 'scale-100 opacity-100',
		leaveFrom: 'scale-100 opacity-100',
		leaveTo: 'scale-0 opacity-0',
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
	private leavingElements = new WeakSet<HTMLElement>();

	/**
	 * Enter transition - Animates element appearing
	 * 
	 * @param el - Element to animate
	 * @param config - Transition configuration
	 */
	async enter(el: HTMLElement, config: TransitionConfig): Promise<void> {
		if (!el.isConnected || this.leavingElements.has(el)) return;
		try {
			const duration = config.duration || 250;

			// Call before hook
			if (config.onBeforeEnter) {
				config.onBeforeEnter(el);
			}

			// Apply enter-from state
			if (config.enterFrom) {
				this.applyClasses(el, config.enterFrom);
			}

			// Force reflow to ensure classes are applied
			el.offsetHeight;

			// Add transition
			el.style.transition = `all ${duration}ms ease-out`;

			// Apply enter-to state
			if (config.enterFrom) {
				this.removeClasses(el, config.enterFrom);
			}
			if (config.enterTo) {
				this.applyClasses(el, config.enterTo);
			}

			// Or use animation
			if (config.enter) {
				el.style.animation = config.enter;
			}

			// Wait for transition to complete
			await this.waitForTransition(el, duration);
			if (!el.isConnected || this.leavingElements.has(el)) return;

			// Cleanup
			el.style.transition = '';
			el.style.animation = '';
			if (config.enterTo) {
				this.removeClasses(el, config.enterTo);
			}

			// Call after hook
			if (config.onAfterEnter) {
				config.onAfterEnter(el);
			}
		} catch (error) {
			console.error('[GyosJS] Transition enter error:', error);
		}
	}

	/**
	 * Leave transition - Animates element disappearing
	 * 
	 * @param el - Element to animate
	 * @param config - Transition configuration
	 */
	async leave(el: HTMLElement, config: TransitionConfig): Promise<void> {
		this.leavingElements.add(el);
		try {
			const duration = config.duration || 250;

			// Call before hook
			if (config.onBeforeLeave) {
				config.onBeforeLeave(el);
			}

			// Apply leave-from state
			if (config.leaveFrom) {
				this.applyClasses(el, config.leaveFrom);
			}

			// Force reflow
			el.offsetHeight;

			// Add transition
			el.style.transition = `all ${duration}ms ease-in`;

			// Apply leave-to state
			if (config.leaveFrom) {
				this.removeClasses(el, config.leaveFrom);
			}
			if (config.leaveTo) {
				this.applyClasses(el, config.leaveTo);
			}

			// Or use animation
			if (config.leave) {
				el.style.animation = config.leave;
			}

			// Wait for transition to complete
			await this.waitForTransition(el, duration);

			// Call after hook
			if (config.onAfterLeave) {
				config.onAfterLeave(el);
			}

			// Remove element
			el.remove();
		} catch (error) {
			console.error('[GyosJS] Transition leave error:', error);
			// Still remove element on error
			el.remove();
		} finally {
			this.leavingElements.delete(el);
		}
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
	 * Wait for transition to complete
	 */
	private waitForTransition(el: HTMLElement, duration: number): Promise<void> {
		return new Promise(resolve => {
			let settled = false;
			let timeoutId: ReturnType<typeof setTimeout> | undefined;
			const finish = () => {
				if (settled) return;
				settled = true;
				el.removeEventListener('transitionend', handler);
				el.removeEventListener('animationend', handler);
				if (timeoutId !== undefined) clearTimeout(timeoutId);
				resolve();
			};
			const handler = (event: Event) => {
				if (event.target === el) finish();
			};

			el.addEventListener('transitionend', handler);
			el.addEventListener('animationend', handler);

			// Fallback timeout
			timeoutId = setTimeout(finish, duration + 50);
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

	const styleId = 'gyos-transitions';
	if (document.getElementById(styleId)) return;

	const style = document.createElement('style');
	style.id = styleId;
	style.textContent = `
    /* Opacity utilities */
    .opacity-0 { opacity: 0; }
    .opacity-100 { opacity: 1; }
    
    /* Transform - Translate Y */
    .translate-y-0 { transform: translateY(0); }
    .translate-y--100 { transform: translateY(-100%); }
    .translate-y-100 { transform: translateY(100%); }
    
    /* Transform - Translate X */
    .translate-x-0 { transform: translateX(0); }
    .translate-x--100 { transform: translateX(-100%); }
    .translate-x-100 { transform: translateX(100%); }
    
    /* Transform - Scale */
    .scale-0 { transform: scale(0); }
    .scale-50 { transform: scale(0.5); }
    .scale-100 { transform: scale(1); }
    
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
