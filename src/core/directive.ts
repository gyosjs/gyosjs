/**
 * Custom Directive System
 * Allows creating reusable DOM manipulation behaviors
 * 
 * @example
 * // Register a directive
 * Gyos.directive('focus', {
 *   mounted(el) {
 *     el.focus();
 *   }
 * });
 * 
 * // Use in HTML
 * // <input g-focus />
 */
import type { Directive } from '../types';
import { getScopeFromElement } from './scope-registry';

const directives = new Map<string, Directive>();

/**
 * Register a custom directive
 * 
 * @param name - Directive name (without 'g-' prefix)
 * @param def - Directive definition with lifecycle hooks or simple function
 * 
 * @example
 * // Full definition
 * Gyos.directive('tooltip', {
 *   mounted(el, binding) {
 *     el.title = binding.value;
 *   },
 *   updated(el, binding) {
 *     el.title = binding.value;
 *   },
 *   unmounted(el) {
 *     el.title = '';
 *   }
 * });
 * 
 * @example
 * // Shorthand (function applies to both mounted and updated)
 * Gyos.directive('color', (el, binding) => {
 *   el.style.color = binding.value;
 * });
 */
export function directive(name: string, def: Directive | Function): void {
	if (typeof def === 'function') {
		directives.set(name, {
			mounted: def as any,
			updated: def as any
		});
	} else {
		directives.set(name, def);
	}
}

/**
 * Get a directive
 */
export function getDirective(name: string): Directive | undefined {
	return directives.get(name);
}

/**
 * Apply directive to element
 */
export function applyDirective(
	el: HTMLElement,
	name: string,
	value: any,
	arg?: string[]
): () => void {
	const dir = directives.get(name);
	if (!dir) {
		console.warn(`[GyosJS] Directive "${name}" not found`);
		return () => { };
	}

	const binding = {
		value,
		oldValue: undefined,
		arg,
	};

	// Call mounted hook
	if (dir.mounted) {
		dir.mounted(el, binding);
	}

	// Return cleanup function
	return () => {
		if (dir.unmounted) {
			dir.unmounted(el);
		}
	};
}

// Built-in directives

/**
 * g-cloak directive (hide until ready)
 */
directive('cloak', {
	mounted(el, binding) {
		setTimeout(() => el.removeAttribute('g-cloak')
		, binding.value ? binding.value : 0);
	}
});

/**
 * g-focus directive (auto-focus element)
 * 
 * @example
 * <input g-focus />
 */
directive('focus', {
	mounted(el) {
		el.focus();
	}
});

/**
 * g-tooltip directive (show tooltip on hover)
 * 
 * @example
 * <button g-tooltip="'Click me!'">Hover</button>
 */
directive('tooltip', {
	mounted(el, binding) {
		el.title = binding.value;
	},
	updated(el, binding) {
		el.title = binding.value;
	}
});

/**
 * g-on directive (listen to channel events)
 * 
 * @example
 * <div g-on(eventName)="handlerFunction"></div>
 */
directive('on', {
	mounted(el, binding) {
		const eventName = binding.arg ? binding.arg[0] : undefined;
		if (!eventName) {
			console.warn('[GyosJS] g-on directive: Event name argument is required');
			return;
		}
		const scope = getScopeFromElement(el);
		const handlerName = binding.value;
		const handler = (typeof handlerName === 'function') 
			? handlerName
			: scope?.[handlerName];

		if (typeof handler !== 'function') {
			console.warn(`[GyosJS] g-on directive: Handler "${handlerName}" is not a function`);
			return;
		}

		if (!scope) {
			console.warn('[GyosJS] g-on directive: No parent scope found');
			return;
		}
		const unsubscribe = scope.$on(eventName, handler.bind(scope));
		(el as any).__gyos_effects__ = (el as any).__gyos_effects__ || [];
		(el as any).__gyos_effects__.push(unsubscribe);
	}
});

/**
 * g-markdown directive (Convert text to Markdown)
 * 
 * @example
 * <div g-markdown="content"></div>
 */
function escapeMarkdownHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function isSafeMarkdownUrl(value: string, image: boolean): boolean {
	const normalized = value.trim().replace(/[\u0000-\u0020]+/g, '').toLowerCase();
	if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) return false;
	if (!normalized.startsWith('data:')) return true;
	return image && /^data:image\/(?:png|gif|jpe?g|webp|avif);base64,/i.test(normalized);
}

directive('markdown', {
	updated(el, binding) {
		const content = escapeMarkdownHtml(String(binding.value || ''));
		const html = content
			.replace(/^### (.*$)/gim, '<h3>$1</h3>')
			.replace(/^## (.*$)/gim, '<h2>$1</h2>')
			.replace(/^# (.*$)/gim, '<h1>$1</h1>')
			.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
			.replace(/^- (.*$)/gim, '<li>$1</li>')
			.replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
			.replace(/\*(.*)\*/gim, '<i>$1</i>')
			.replace(/!\[(.*?)\]\((.*?)\)/gim, (_match, alt, url) =>
				isSafeMarkdownUrl(url, true) ? `<img alt="${alt}" src="${url}" />` : alt
			)
			.replace(/\[(.*?)\]\((.*?)\)/gim, (_match, label, url) =>
				isSafeMarkdownUrl(url, false) ? `<a href="${url}">${label}</a>` : label
			)
			.replace(/`(.*)`/gim, '<code>$1</code>')
			.replace(/\n/gim, '<br />');
		el.innerHTML = html;
	},
});
