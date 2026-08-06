/**
 * Template Parser - Orchestrator
 * Coordinates all template processing modules
 */

// Import template processors
import { processTextNodesStatic } from './text';
import { processDirectivesStatic } from './directives';
import { processBindingsStatic } from './bindings';
import { processParse } from './process';
import { DEBUG } from '../utils/helpers';

/**
 * Parse and bind template to scope
 */
export function parseTemplate(el: HTMLElement, scope: any, onReady?: () => void): void {
	// Store scope in element for reactive access by effects
	(el as any).__gyos_scope__ = scope;

	// Parse immediately (hydration is handled by component.ts)
	parseTemplateNow(el, scope);

	// Call onReady callback after parsing
	if (onReady) {
		onReady();
	}
}

/**
 * Actually parse template (called immediately or after hydration)
 */
function parseTemplateNow(element: HTMLElement, scope: any): void {
	// Check for g-static - render once with initial values, then freeze
	const isStatic = element.hasAttribute('g-static');
	if (isStatic) {
		DEBUG() && console.log('[parseTemplate] Element marked as g-static, rendering once without reactivity');
		element.removeAttribute('g-static');
		// Mark element as static so children know to skip
		(element as any).__gyos_static__ = true;

		// Render once with initial values (no effects)
		processTextNodesStatic(element, scope);
		processDirectivesStatic(element, scope);
		processBindingsStatic(element, scope);
		return; // Skip reactive processing
	}

	processParse(element, scope);
}