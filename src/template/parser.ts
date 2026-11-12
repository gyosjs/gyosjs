/**
 * Template Parser - Orchestrator
 * Coordinates all template processing modules
 */

// Import template processors
import { processParse } from './process';

/**
 * Parse and bind template to scope
 */
export function parseTemplate(el: HTMLElement, scope: any, onReady?: () => void): void {
	// Store scope in element for reactive access by effects
	(el as any).__gyos_scope__ = scope;

	// Parse immediately (hydration is handled by component.ts)
	processParse(el, scope);

	// Call onReady callback after parsing
	if (onReady) {
		onReady();
	}
}
