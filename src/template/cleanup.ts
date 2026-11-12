/**
 * Cleanup utilities for disposing effects and event listeners
 */

import { portalDestroy } from '../core/portal';
import { unmountScope } from '../core/scope-registry';
import { untrack } from '../reactivity/signal';
import { invalidateLifetime } from './lifetime';

/**
 * Dispose all effects attached to an element and its descendants
 * Handles both element effects (__gyos_effects__) and component lifecycle
 */
export function disposeEffects(element: Element = document.body, removeElement: boolean = false): void {
    if (!element) return;
    disposeNode(element);
    if (removeElement) element.remove();
}

export function disposeNode(element: Node, removeElement = false): void {
    untrack(() => disposeNodeInternal(element, removeElement));
}

function disposeNodeInternal(element: Node, removeElement = false): void {
    invalidateLifetime(element);
    const portal = (element as any).__gyos_portal__ as HTMLElement | undefined;
    if (portal) {
        delete (element as any).__gyos_portal__;
        disposeNode(portal, removeElement);
    }
    // Include structural comment anchors. Snapshot before hooks mutate the tree.
    const children = Array.from(element.childNodes);
    const effects = (element as any).__gyos_effects__;
    // Release ownership before callbacks to make reentrant cleanup safe.
    (element as any).__gyos_effects__ = null;
    // Unmount scope if element has one (calls onUnmount + cleans instance.__gyos_effects__)
    if ((element as HTMLElement).hasAttribute?.('g-scope') || (element as any).__gyos_scope__) {
        unmountScope(element as HTMLElement);
    }

    // Dispose effects on this element (template effects like g-show, :class, {text})
    if (effects) {
        effects.forEach((dispose: () => void) => {
            try {
                dispose();
            } catch (error) {
                console.error('[GyosJS] Error disposing effect:', error);
            }
        });
    }

    // Recursively dispose effects on all descendants
    children.forEach(child => disposeNode(child));

    // Restore a portal to its placeholder before removing the owning tree.
    portalDestroy(element as HTMLElement);
    if (removeElement) element.parentNode?.removeChild(element);
}
