/**
 * Reactive attribute bindings (:class, :style, :aria-*, :data-*, and custom attributes).
 */
import { evaluateExpression } from './expression';
import { getScopeFromElement } from '../core/scope-registry';
import { isInIgnoredTree, isInStaticParent, DEBUG, walkerDOM } from '../utils/helpers';
import { queueReactiveEffect } from './effect-queue';

function handleClassBinding(el: HTMLElement, value: unknown): void {
	if (typeof value === 'string') {
		el.className = value;
	} else if (value && typeof value === 'object') {
		Object.entries(value).forEach(([className, condition]) => {
			el.classList.toggle(className, Boolean(condition));
		});
	}
}

function handleStyleBinding(el: HTMLElement, value: unknown): void {
	if (typeof value === 'string') {
		el.setAttribute('style', value);
	} else if (value && typeof value === 'object') {
		Object.entries(value).forEach(([property, propertyValue]) => {
			(el.style as any)[property] = propertyValue ?? '';
		});
	} else if (value == null || value === false) {
		el.removeAttribute('style');
	}
}

const booleanAttributes = new Set([
	'allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'controls',
	'defer', 'disabled', 'formnovalidate', 'hidden', 'inert', 'ismap', 'itemscope',
	'loop', 'multiple', 'muted', 'nomodule', 'novalidate', 'open', 'playsinline',
	'readonly', 'required', 'reversed', 'selected'
]);
const booleanPropertyNames: Record<string, string> = {
	allowfullscreen: 'allowFullscreen',
	formnovalidate: 'formNoValidate',
	ismap: 'isMap',
	itemscope: 'itemScope',
	nomodule: 'noModule',
	novalidate: 'noValidate',
	playsinline: 'playsInline',
	readonly: 'readOnly'
};
const urlAttributes = new Set(['action', 'background', 'cite', 'formaction', 'href', 'poster', 'src', 'xlink:href']);
const activeUrlElements = new Set(['BASE', 'EMBED', 'IFRAME', 'LINK', 'OBJECT', 'SCRIPT']);

function isAllowedBindingName(attrName: string): boolean {
	const normalized = attrName.toLowerCase();
	if (!normalized || normalized.startsWith('@') || normalized.startsWith(':') || normalized.startsWith('*')) return false;
	if (/^on/i.test(normalized) || normalized === 'srcdoc' || normalized === 'xmlns') return false;
	return !normalized.startsWith('g-') && !normalized.startsWith('gd-') && !normalized.startsWith('gm-');
}

function isSafeBoundUrl(element: HTMLElement, attrName: string, value: unknown): boolean {
	if (!urlAttributes.has(attrName)) {
		return !(attrName === 'data' && element.tagName === 'OBJECT');
	}
	if (value === null || value === undefined || value === false) return true;
	if (activeUrlElements.has(element.tagName)) return false;

	const normalized = String(value).trim().replace(/[\u0000-\u0020]+/g, '').toLowerCase();
	if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:')) return false;
	if (!normalized.startsWith('data:')) return true;
	return attrName === 'src'
		&& element instanceof HTMLImageElement
		&& /^data:image\/(?:png|gif|jpe?g|webp|avif);base64,/i.test(normalized);
}

function syncBooleanProperty(element: HTMLElement, attrName: string, value: boolean): void {
	const propertyName = booleanPropertyNames[attrName] || attrName;
	if (propertyName in element) {
		try {
			(element as any)[propertyName] = value;
		} catch {
			// Some reflected DOM properties are read-only in older engines.
		}
	}
}

function applyAttributeBinding(element: HTMLElement, rawAttrName: string, value: unknown): void {
	const attrName = rawAttrName.toLowerCase();
	if (!isAllowedBindingName(attrName)) {
		element.removeAttribute(attrName);
		DEBUG() && console.warn(`[GyosJS] Blocked unsafe :${attrName} binding`);
		return;
	}
	if (!isSafeBoundUrl(element, attrName, value)) {
		element.removeAttribute(attrName);
		DEBUG() && console.warn(`[GyosJS] Blocked unsafe :${attrName} URL`);
		return;
	}

	if (booleanAttributes.has(attrName)) {
		const enabled = Boolean(value);
		element.toggleAttribute(attrName, enabled);
		syncBooleanProperty(element, attrName, enabled);
		return;
	}

	if (value === null || value === undefined || (value === false && !attrName.startsWith('aria-') && !attrName.startsWith('data-'))) {
		element.removeAttribute(attrName);
		return;
	}

	const stringValue = String(value);
	if (attrName === 'value' && 'value' in element) {
		(element as HTMLInputElement).value = stringValue;
	}
	element.setAttribute(attrName, stringValue);
}

function boundAttributes(element: Element): Attr[] {
	return Array.from(element.attributes).filter(attribute => attribute.name.startsWith(':'));
}

export function processBindings(element: HTMLElement, scope: any, root: HTMLElement): void {
	if (isInIgnoredTree(element) || isInStaticParent(element, root)) return;
	if (element.hasAttribute('*if') || element.hasAttribute('*for')) return;

	for (const attribute of boundAttributes(element)) {
		const attrName = attribute.name.slice(1);
		const expression = attribute.value;
		queueReactiveEffect(element, () => {
			const currentScope = getScopeFromElement(element) || scope;
			const value = evaluateExpression(expression, currentScope);
			if (attrName === 'class') handleClassBinding(element, value);
			else if (attrName === 'style') handleStyleBinding(element, value);
			else applyAttributeBinding(element, attrName, value);
		});
	}
}

export function processBindingsStatic(root: HTMLElement, scope: any): void {
	const elements = [root, ...walkerDOM(root, element => !isInIgnoredTree(element), NodeFilter.FILTER_REJECT)];
	for (const element of elements) {
		if (isInIgnoredTree(element)) continue;
		for (const attribute of boundAttributes(element)) {
			const attrName = attribute.name.slice(1);
			const value = evaluateExpression(attribute.value, scope);
			if (attrName === 'class') handleClassBinding(element, value);
			else if (attrName === 'style') handleStyleBinding(element, value);
			else applyAttributeBinding(element, attrName, value);
		}
	}
}
