/**
 * Cleanup utilities for disposing effects and event listeners
 */

import { portalDestroy } from '../core/portal';
import { unmountScope } from '../core/scope-registry';

/**
 * Dispose all effects attached to an element and its descendants
 * Handles both element effects (__gyos_effects__) and component lifecycle
 */
export function disposeEffects(element: Element = document.body, removeElement: boolean = false): void {
    if (!element) return;
    // Unmount scope if element has one (calls onUnmount + cleans instance.__gyos_effects__)
    if ((element as HTMLElement).hasAttribute?.('g-scope') || (element as any).__gyos_scope__) {
        unmountScope(element as HTMLElement);
    }

    // Dispose effects on this element (template effects like g-show, :class, {text})
    if ((element as any).__gyos_effects__) {
        const effects = (element as any).__gyos_effects__;
        effects.forEach((dispose: () => void) => {
            try {
                dispose();
            } catch (error) {
                console.error('[GyosJS] Error disposing effect:', error);
            }
        });
        (element as any).__gyos_effects__ = null;
    }

    // Recursively dispose effects on all descendants
    const descendants = element.querySelectorAll('*');
    descendants.forEach((child) => {
        // Unmount child scopes
        if ((child as HTMLElement).hasAttribute?.('g-scope') || (child as any).__gyos_scope__) {
            unmountScope(child as HTMLElement);
        }

        // Dispose child template effects
        if ((child as any).__gyos_effects__) {
            const effects = (child as any).__gyos_effects__;
            effects.forEach((dispose: () => void) => {
                try {
                    dispose();
                } catch (error) {
                    console.error('[GyosJS] Error disposing child effect:', error);
                }
            });
            (child as any).__gyos_effects__ = null;
        }
    });

    // portal cleanup could be added here if needed
    portalDestroy(element as HTMLElement);

    if (removeElement) element.remove();
}
