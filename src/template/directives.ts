/**
 * Directive Processing
 * Handles built-in directives (g-show, g-html, g-text) and custom directives
 */
import { getDirective } from '../core/directive';
import { evaluateExpression } from './expression';
import { isInIgnoredTree, isInStaticParent } from '../utils/helpers';
import { queueReactiveEffect } from './effect-queue';
import { applyEnterTransition, applyLeaveTransition, parseTransitionConfig } from './structurals/transition-helpers';
import { transitionManager } from '../core/transition';

/**
 * Process built-in and custom directives
 * 
 * Built-in directives:
 * - g-show: Toggle element visibility
 * - g-html: Set innerHTML reactively
 * - g-text: Set textContent reactively
 * 
 * Custom directives: Registered via Gyos.directive()
 * 
 * @param el - Root element to process
 * @param scope - Scope object for evaluation
 */
export function processDirectives(element: HTMLElement, scope: any, root: HTMLElement): void {
	if (isInIgnoredTree(element)) return;

    // Skip if inside g-static parent
    if (isInStaticParent(element, root)) return;

    // Built-in directives: g-show
    if (element.hasAttribute('g-show')) {
        const expr = element.getAttribute('g-show')!;
		const originalDisplay = element.style.display === 'none' ? '' : element.style.display;
		let initialized = false;
		let runId = 0;
        queueReactiveEffect(element, () => {
            const value = evaluateExpression(expr, scope);
			const visible = Boolean(value);
			const currentRun = ++runId;
			transitionManager.cancel(element);

			if (!initialized) {
				initialized = true;
				element.style.display = visible ? originalDisplay : 'none';
				return () => transitionManager.cancel(element);
			}

			if (!parseTransitionConfig(element, scope)) {
				element.style.display = visible ? originalDisplay : 'none';
				return () => transitionManager.cancel(element);
			}

			if (visible) {
				element.style.display = originalDisplay;
				void applyEnterTransition(element, scope, true);
			} else if (element.style.display !== 'none') {
				void applyLeaveTransition(element, scope, false).then(completed => {
					if (completed !== false && currentRun === runId) element.style.display = 'none';
				});
			}

			return () => transitionManager.cancel(element);
        });
    }

    // g-html: Set innerHTML
    if (element.hasAttribute('g-html')) {
        const expr = element.getAttribute('g-html')!;
        queueReactiveEffect(element, () => {
            const value = evaluateExpression(expr, scope);
            element.innerHTML = value;
        });
    }

    // g-text: Set textContent
    if (element.hasAttribute('g-text')) {
        const expr = element.getAttribute('g-text')!;
        queueReactiveEffect(element, () => {
            const value = evaluateExpression(expr, scope);
            element.textContent = value;
        });
    }

    // Process custom directives (g-focus, g-tooltip, g-clickoutside, etc.)
    Array.from(element.attributes).forEach(attr => {
        // Skip built-in and framework directives
        if (attr.name.startsWith('g-') &&
            !['g-scope', 'g-show', 'g-html', 'g-text', 'g-model', 'g-static', 'g-portal', 'g-transition', 'g-hydrate', 'g-provide'].includes(attr.name)) {

            const directiveName = attr.name.slice(2).replace(/:.+$/, ''); // Remove 'g-' prefix and any arguments
            const directive = getDirective(directiveName);
            const args = attr.name.split(':');
            let arg: string[] | undefined = undefined;
            if (args.length > 1) arg = args.slice(1); // Get arguments as array

            if (directive) {
                // g-on needs the handler itself. The general evaluator intentionally
                // invokes bare functions to support function-style computed values.
				const evaluateValue = () => {
					if (attr.value.trim() === '') return undefined;
					return directiveName === 'on' && typeof scope[attr.value] === 'function'
						? scope[attr.value]
						: evaluateExpression(attr.value, scope, false);
				};
				const value = evaluateValue();
				let oldValue = directive.mounted ? value : undefined;
				let initialized = !directive.mounted;

                // Call mounted hook
                if (directive.mounted) {
                    directive.mounted(element, {
                        value, arg,
                        oldValue: undefined,
                    }, scope);
                }

				if (directive.unmounted) {
					let active = true;
					const cleanup = () => {
						if (!active) return;
						active = false;
						directive.unmounted!(element);
					};
					if (!(element as any).__gyos_effects__) {
						(element as any).__gyos_effects__ = [];
					}
					(element as any).__gyos_effects__.push(cleanup);
				}

                // Setup reactive update if has updated hook
                if (directive.updated) {
                    queueReactiveEffect(element, () => {
						const newValue = evaluateValue();
						if (!initialized) {
							initialized = true;
							oldValue = newValue;
							return;
						}
						if (Object.is(oldValue, newValue)) return;

                        directive.updated!(element, {
                            value: newValue,
							oldValue,
                            arg,
                        }, scope);
						oldValue = newValue;
                    });
                }
            }
        }
    });
}

/**
 * Process static directives (no reactivity)
 * 
 * @param el - Root element to process
 * @param scope - Scope object for evaluation
 */
export function processDirectivesStatic(el: HTMLElement, scope: any): void {
    const directives = Array.from(el.querySelectorAll('[g-show], [g-html], [g-text]'))
		.filter(element => !isInIgnoredTree(element));

    directives.forEach(elem => {
        const element = elem as HTMLElement;

        // g-show
        if (element.hasAttribute('g-show')) {
            const expr = element.getAttribute('g-show')!;
            const value = evaluateExpression(expr, scope);
            element.style.display = value ? '' : 'none';
        }

        // g-html
        if (element.hasAttribute('g-html')) {
            const expr = element.getAttribute('g-html')!;
            const value = evaluateExpression(expr, scope);
            element.innerHTML = value;
        }

        // g-text
        if (element.hasAttribute('g-text')) {
            const expr = element.getAttribute('g-text')!;
            const value = evaluateExpression(expr, scope);
            element.textContent = value;
        }
    });
}
