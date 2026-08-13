/**
 * Reactive attribute bindings (:class, :style, :aria-*, :data-*, and custom attributes).
 */
import { evaluateExpression } from './expression';
import { getScopeFromElement } from '../core/scope-registry';
import { isInIgnoredTree, isInStaticParent, DEBUG, walkerDOM } from '../utils/helpers';
import { queueReactiveEffect } from './effect-queue';

interface ClassBindingState {
	staticClasses: Set<string>;
	dynamicClasses: Set<string>;
}

interface StyleValue {
	priority: string;
	value: string;
}

interface StyleBindingState {
	staticStyles: Map<string, StyleValue>;
	dynamicProperties: Set<string>;
}

function createClassBindingState(el: HTMLElement): ClassBindingState {
	return {
		staticClasses: new Set(el.classList),
		dynamicClasses: new Set()
	};
}

function classNamesFromBinding(value: unknown): Set<string> {
	if (typeof value === 'string') {
		return new Set(value.split(/\s+/).filter(Boolean));
	}
	if (value && typeof value === 'object') {
		return new Set(
			Object.entries(value)
				.filter(([, condition]) => Boolean(condition))
				.flatMap(([className]) => className.split(/\s+/).filter(Boolean))
		);
	}
	return new Set();
}

function handleClassBinding(el: HTMLElement, value: unknown, state: ClassBindingState): void {
	const nextClasses = classNamesFromBinding(value);
	if (value && typeof value === 'object') {
		for (const [className, condition] of Object.entries(value)) {
			if (!condition) {
				for (const token of className.split(/\s+/).filter(Boolean)) el.classList.remove(token);
			}
		}
	}

	for (const className of state.dynamicClasses) {
		if (!nextClasses.has(className) && !state.staticClasses.has(className)) {
			el.classList.remove(className);
		}
	}
	for (const className of nextClasses) {
		el.classList.add(className);
	}

	state.dynamicClasses = nextClasses;
}

function readStyleValues(style: CSSStyleDeclaration): Map<string, StyleValue> {
	const values = new Map<string, StyleValue>();
	for (let index = 0; index < style.length; index++) {
		const property = style.item(index);
		values.set(property, {
			priority: style.getPropertyPriority(property),
			value: style.getPropertyValue(property)
		});
	}
	return values;
}

function normalizeStyleProperty(property: string): string {
	if (property.startsWith('--') || property.includes('-')) return property.toLowerCase();
	return property.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

function styleValuesFromBinding(value: unknown): {
	mentioned: Set<string>;
	values: Map<string, StyleValue>;
} {
	const scratch = document.createElement('div').style;
	const mentioned = new Set<string>();

	if (typeof value === 'string') {
		scratch.cssText = value;
		for (const property of readStyleValues(scratch).keys()) mentioned.add(property);
	} else if (value && typeof value === 'object') {
		for (const [property, propertyValue] of Object.entries(value)) {
			const normalized = normalizeStyleProperty(property);
			mentioned.add(normalized);
			if (propertyValue == null || propertyValue === false) continue;
			if (property.startsWith('--')) scratch.setProperty(property, String(propertyValue));
			else (scratch as any)[property] = propertyValue;
		}
	}

	return { mentioned, values: readStyleValues(scratch) };
}

function createStyleBindingState(el: HTMLElement): StyleBindingState {
	return {
		staticStyles: readStyleValues(el.style),
		dynamicProperties: new Set()
	};
}

function restoreStaticStyle(el: HTMLElement, property: string, state: StyleBindingState): void {
	const original = state.staticStyles.get(property);
	if (original) el.style.setProperty(property, original.value, original.priority);
	else el.style.removeProperty(property);
}

function handleStyleBinding(el: HTMLElement, value: unknown, state: StyleBindingState): void {
	const next = styleValuesFromBinding(value);
	for (const property of state.dynamicProperties) {
		if (!next.mentioned.has(property)) restoreStaticStyle(el, property, state);
	}
	for (const property of next.mentioned) {
		const styleValue = next.values.get(property);
		if (styleValue) el.style.setProperty(property, styleValue.value, styleValue.priority);
		else el.style.removeProperty(property);
	}
	state.dynamicProperties = next.mentioned;
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
		const classState = attrName === 'class' ? createClassBindingState(element) : undefined;
		const styleState = attrName === 'style' ? createStyleBindingState(element) : undefined;
		queueReactiveEffect(element, () => {
			const currentScope = getScopeFromElement(element) || scope;
			const value = evaluateExpression(expression, currentScope);
			if (attrName === 'class') handleClassBinding(element, value, classState!);
			else if (attrName === 'style') handleStyleBinding(element, value, styleState!);
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
			if (attrName === 'class') handleClassBinding(element, value, createClassBindingState(element));
			else if (attrName === 'style') handleStyleBinding(element, value, createStyleBindingState(element));
			else applyAttributeBinding(element, attrName, value);
		}
	}
}
