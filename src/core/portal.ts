/**
 * Portal/Teleport System - Render content in different DOM location
 * Useful for modals, tooltips, notifications that need to break out of parent containers
 * 
 * @example
 * // Portal to body (for modals)
 * <div g-portal="body">
 *   <div class="modal">Modal content</div>
 * </div>
 * 
 * @example
 * // Portal to specific element
 * <div g-portal="#notifications">
 *   <div class="toast">Toast message</div>
 * </div>
 */

import { DEBUG } from "../utils/helpers";

/**
 * Create a portal - Move element to target location
 * 
 * @param sourceEl - Element to teleport
 * @param targetSelector - CSS selector for destination
 * 
 * @example
 * portalCreate(modalEl, 'body');
 * portalCreate(tooltipEl, '#tooltip-container');
 */
export function portalCreate(sourceEl: HTMLElement, targetSelector: string): void {
	if (!sourceEl) return;
	const target = document.querySelector(targetSelector);
	if (!target) {
		console.warn(`[GyosJS] Portal target "${targetSelector}" not found`);
		return;
	}

	// Create placeholder comment to mark original position
	const placeholder = document.createComment('g-portal');
	sourceEl.parentNode?.insertBefore(placeholder, sourceEl);

	// Store original parent for restoration
	(sourceEl as any).__portal_placeholder__ = placeholder;
	(sourceEl as any).__portal_target__ = target;

	// Move the entire element to target
	target.appendChild(sourceEl);

	DEBUG() && console.log('[Portal] Created - moved element to', targetSelector);
}

/**
 * Destroy a portal - Restore element to original position
 * 
 * @param sourceEl - Element to restore
 * 
 * @example
 * portalDestroy(modalEl); // Returns modal to original location
 */
export function portalDestroy(sourceEl: HTMLElement): void {
	if (!sourceEl) return;
	const placeholder = (sourceEl as any).__portal_placeholder__;

	if (placeholder && placeholder.parentNode) {
		// Move element back to original position
		placeholder.parentNode.insertBefore(sourceEl, placeholder);
		placeholder.remove();

		delete (sourceEl as any).__portal_placeholder__;
		delete (sourceEl as any).__portal_target__;

		DEBUG() && console.log('[Portal] Destroyed - restored element to original position');
	}
}