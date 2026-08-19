import { resolveCspNonce } from '../../runtime/csp-nonce';
import { expressionRuntimeMode } from '../../runtime/evaluator';

const RAW_TEXT_ELEMENTS = new Set(['iframe', 'noembed', 'noframes', 'plaintext', 'script', 'textarea', 'title', 'xmp']);

function escapeAttribute(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function findTagEnd(html: string, start: number): number {
	let quote = '';
	for (let index = start; index < html.length; index += 1) {
		const character = html[index];
		if (quote) {
			if (character === quote) quote = '';
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character === '>') return index + 1;
	}
	return html.length;
}

function findClosingTag(
	html: string,
	lowerHtml: string,
	name: string,
	start: number
): { start: number; end: number } | null {
	const needle = `</${name}`;
	let position = lowerHtml.indexOf(needle, start);
	while (position !== -1) {
		const boundary = lowerHtml[position + needle.length];
		if (boundary === '>' || /\s/.test(boundary || '')) {
			return {
				start: position,
				end: findTagEnd(html, position + needle.length)
			};
		}
		position = lowerHtml.indexOf(needle, position + needle.length);
	}
	return null;
}

function removeNonceAttribute(openingTag: string): string {
	const prefix = /^<\s*style\b/i.exec(openingTag);
	if (!prefix) return openingTag;

	let output = prefix[0];
	let cursor = prefix[0].length;
	const limit = openingTag.length - 1;
	while (cursor < limit) {
		const attributeStart = cursor;
		while (cursor < limit && /\s/.test(openingTag[cursor])) cursor += 1;
		if (cursor >= limit || openingTag[cursor] === '>') {
			output += openingTag.slice(attributeStart, cursor);
			break;
		}

		const nameStart = cursor;
		while (cursor < limit && !/[\s=/>]/.test(openingTag[cursor])) cursor += 1;
		if (cursor === nameStart) {
			output += openingTag.slice(attributeStart, cursor + 1);
			cursor += 1;
			continue;
		}
		const name = openingTag.slice(nameStart, cursor).toLowerCase();
		while (cursor < limit && /\s/.test(openingTag[cursor])) cursor += 1;
		if (openingTag[cursor] === '=') {
			cursor += 1;
			while (cursor < limit && /\s/.test(openingTag[cursor])) cursor += 1;
			const quote = openingTag[cursor] === '"' || openingTag[cursor] === "'" ? openingTag[cursor] : '';
			if (quote) {
				cursor += 1;
				while (cursor < limit && openingTag[cursor] !== quote) cursor += 1;
				if (openingTag[cursor] === quote) cursor += 1;
			} else {
				while (cursor < limit && !/[\s>]/.test(openingTag[cursor])) cursor += 1;
			}
		}
		if (name !== 'nonce') output += openingTag.slice(attributeStart, cursor);
	}
	return output + openingTag.slice(limit);
}

function withNonce(openingTag: string, nonce: string): string {
	const withoutNonce = removeNonceAttribute(openingTag);
	return `${withoutNonce.slice(0, -1)} nonce="${escapeAttribute(nonce)}">`;
}

export function prepareNavigationHtml(html: string): string {
	if (expressionRuntimeMode() !== 'csp') return html;

	const activeNonce = resolveCspNonce();
	const lowerHtml = html.toLowerCase();
	let output = '';
	let cursor = 0;
	let skippedStyles = 0;

	while (cursor < html.length) {
		const tagStart = html.indexOf('<', cursor);
		if (tagStart === -1) {
			output += html.slice(cursor);
			break;
		}
		output += html.slice(cursor, tagStart);

		if (html.startsWith('<!--', tagStart)) {
			const commentEnd = html.indexOf('-->', tagStart + 4);
			const end = commentEnd === -1 ? html.length : commentEnd + 3;
			output += html.slice(tagStart, end);
			cursor = end;
			continue;
		}

		const tagEnd = findTagEnd(html, tagStart + 1);
		const openingTag = html.slice(tagStart, tagEnd);
		const match = /^<\s*(\/?)\s*([a-z][\w:-]*)/i.exec(openingTag);
		if (!match || match[1]) {
			output += openingTag;
			cursor = tagEnd;
			continue;
		}

		const name = match[2].toLowerCase();
		if (name === 'plaintext') {
			output += html.slice(tagStart);
			break;
		}

		if (name === 'style' || name === 'noscript' || RAW_TEXT_ELEMENTS.has(name)) {
			const closingTag = findClosingTag(html, lowerHtml, name, tagEnd);
			const blockEnd = closingTag?.end ?? html.length;
			if (name === 'noscript') {
				cursor = blockEnd;
				continue;
			}
			if (name === 'style') {
				if (!activeNonce) {
					skippedStyles += 1;
					cursor = blockEnd;
					continue;
				}
				output += withNonce(openingTag, activeNonce);
				output += html.slice(tagEnd, blockEnd);
				cursor = blockEnd;
				continue;
			}

			output += html.slice(tagStart, blockEnd);
			cursor = blockEnd;
			continue;
		}

		output += openingTag;
		cursor = tagEnd;
	}

	if (skippedStyles > 0) {
		console.warn(
			`[GyosJS CSP] Skipped ${skippedStyles} inline MPA style${skippedStyles === 1 ? '' : 's'} because no active document nonce is configured.`
		);
	}
	return output;
}
