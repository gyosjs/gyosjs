import { PipeFn } from "../types";
import { DEBUG } from "../utils/helpers";

/**
 * Pipe System - Transform values in templates
 * Similar to Angular pipes or Vue filters
 * 
 * @example
 * // In template
 * <p>{price | currency('USD')}</p>
 * <p>{birthday | date('DD/MM/YYYY')}</p>
 * <p>{title | uppercase | truncate(50)}</p>
 * 
 * @example
 * // Register custom pipe
 * Gyos.pipe('reverse', (value) => {
 *   return value.split('').reverse().join('');
 * });
 * 
 * // Use in template
 * <p>{name | reverse}</p>
 */
const pipes = new Map<string, Function>();

/**
 * Register a custom pipe
 * 
 * @param name - Pipe name (used in templates)
 * @param fn - Transform function (first param is value, rest are args)
 * 
 * @example
 * Gyos.pipe('multiply', (value, factor = 2) => {
 *   return value * factor;
 * });
 * 
 * // In template: {count | multiply(3)}
 */
export function pipe(name: string, fn: PipeFn): void {
	pipes.set(name, fn);
}

/**
 * Get a pipe
 */
export function getPipe(name: string): Function | undefined {
	return pipes.get(name);
}

/**
 * Apply pipe to value
 */
export function applyPipe(value: any, pipeName: string, args: any[] = []): any {
	const pipeFn = pipes.get(pipeName);
	if (!pipeFn) {
		DEBUG() && console.warn(`[GyosJS] Pipe "${pipeName}" not found`);
		return value;
	}

	try {
		return pipeFn(value, ...args);
	} catch (e) {
		DEBUG() && console.error(`[GyosJS] Error in pipe "${pipeName}":`, e);
		return value;
	}
}

/**
 * Parse pipe expression: {value | pipe1(arg1, arg2) | pipe2}
 */
export function parsePipeExpression(expr: string): { base: string; pipes: Array<{ name: string; args: string[] }> } {
	// Split by | but not || and respect quotes
	const parts: string[] = [];
	let current = '';
	let inQuote = false;
	let quoteChar = '';
	let i = 0;

	while (i < expr.length) {
		const char = expr[i];
		const prevChar = i > 0 ? expr[i - 1] : '';

		// Track quotes
		if ((char === '"' || char === "'") && prevChar !== '\\') {
			if (!inQuote) {
				inQuote = true;
				quoteChar = char;
			} else if (char === quoteChar) {
				inQuote = false;
				quoteChar = '';
			}
			current += char;
			i++;
		} else if (char === '|' && !inQuote) {
			// Pipe outside quotes
			if (expr[i + 1] === '|') {
				// || operator, keep it
				current += '||';
				i += 2;
			} else {
				// Single | pipe separator
				parts.push(current.trim());
				current = '';
				i++;
			}
		} else {
			current += char;
			i++;
		}
	}
	parts.push(current.trim());

	const base = parts[0];
	const pipeDefs = parts.slice(1).map(pipePart => {
		// Manual parsing instead of regex to handle nested parens/quotes
		const openParen = pipePart.indexOf('(');

		if (openParen === -1) {
			// No args
			return { name: pipePart.trim(), args: [] };
		}

		const name = pipePart.substring(0, openParen).trim();

		// Find matching closing paren (respect quotes)
		let depth = 0;
		let closeParen = -1;
		let inQuote = false;
		let quoteChar = '';

		for (let j = openParen; j < pipePart.length; j++) {
			const char = pipePart[j];
			const prevChar = j > 0 ? pipePart[j - 1] : '';

			if ((char === '"' || char === "'") && prevChar !== '\\') {
				if (!inQuote) {
					inQuote = true;
					quoteChar = char;
				} else if (char === quoteChar) {
					inQuote = false;
					quoteChar = '';
				}
			}

			if (!inQuote) {
				if (char === '(') depth++;
				if (char === ')') {
					depth--;
					if (depth === 0) {
						closeParen = j;
						break;
					}
				}
			}
		}

		if (closeParen === -1) {
			// No matching closing paren
			return { name: pipePart, args: [] };
		}

		const argsStr = pipePart.substring(openParen + 1, closeParen);

		// Smart args parsing - respect quotes
		const args: string[] = [];
		if (argsStr) {
			let current = '';
			let inQuote = false;
			let quoteChar = '';

			for (let j = 0; j < argsStr.length; j++) {
				const char = argsStr[j];

				if ((char === '"' || char === "'") && (j === 0 || argsStr[j - 1] !== '\\')) {
					if (!inQuote) {
						inQuote = true;
						quoteChar = char;
					} else if (char === quoteChar) {
						inQuote = false;
						quoteChar = '';
					}
					current += char;
				} else if (char === ',' && !inQuote) {
					// Comma outside quotes - split here
					args.push(current.trim());
					current = '';
				} else {
					current += char;
				}
			}

			if (current.trim()) {
				args.push(current.trim());
			}
		}

		return { name, args };
	});

	return { base, pipes: pipeDefs };
}

// Built-in pipes

/**
 * Currency pipe - Format number as currency
 * 
 * @example
 * {price | currency} → $99.99
 * {price | currency('EUR', 'de-DE')} → 99,99 €
 */
pipe('currency', (value: number, currency = 'USD', locale = 'en-US') => {
	return new Intl.NumberFormat(locale, {
		style: 'currency',
		currency
	}).format(value);
});

/**
 * Date pipe - Format date with pattern
 * Supports: YYYY, MM, DD, HH, mm, ss
 * 
 * @example
 * {now | date} → 11/12/2025
 * {now | date('DD/MM/YYYY HH:mm')} → 12/11/2025 14:30
 */
pipe('date', (value: Date | string | number, format = 'MM/DD/YYYY') => {
	const date = value instanceof Date ? value : new Date(value);

	// Simple formatting (in real impl, use a library)
	const pad = (n: number) => n.toString().padStart(2, '0');

	return format
		.replace('YYYY', date.getFullYear().toString())
		.replace('MM', pad(date.getMonth() + 1))
		.replace('DD', pad(date.getDate()))
		.replace('HH', pad(date.getHours()))
		.replace('mm', pad(date.getMinutes()))
		.replace('ss', pad(date.getSeconds()));
});

/**
 * Slug pipe - Convert to URL-friendly slug
 * 
 * @example
 * {title | slug} → "hello-world"
 * {"My Blog Post!" | slug} → "my-blog-post"
 */
pipe('slug', (value: string) => {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-');
});

/**
 * Truncate pipe - Shorten text with suffix
 * 
 * @example
 * {longText | truncate(20)} → "This is a long te..."
 * {longText | truncate(20, '…')} → "This is a long te…"
 */
pipe('truncate', (value: string, length = 100, suffix = '...') => {
	if (value.length <= length) return value;
	return value.substring(0, length) + suffix;
});

/**
 * Uppercase pipe
 * 
 * @example
 * {name | uppercase} → "JOHN"
 */
pipe('uppercase', (value: string) => {
	return value.toUpperCase();
});

/**
 * Lowercase pipe
 * 
 * @example
 * {name | lowercase} → "john"
 */
pipe('lowercase', (value: string) => {
	return value.toLowerCase();
});

/**
 * Capitalize pipe - First letter uppercase, rest lowercase
 * 
 * @example
 * {name | capitalize} → "John"
 * {"hELLO" | capitalize} → "Hello"
 */
pipe('capitalize', (value: string) => {
	return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
});

/**
 * Fallback pipe - Return fallback value if empty/null/undefined
 * 
 * @example
 * {username || 'Guest' | fallback('Guest')}
 * {image | fallback('/placeholder.png')}
 */
pipe('fallback', (value: any, fallbackValue: any) => {
	return value || fallbackValue;
});

/**
 * JSON pipe - Stringify object with indentation
 * 
 * @example
 * {user | json} → Pretty printed JSON
 * {data | json(0)} → Compact JSON
 */
pipe('json', (value: any, indent = 2) => {
	return JSON.stringify(value, null, indent);
});

/**
 * Number pipe - Format number with fixed decimals
 * 
 * @example
 * {price | number(2)} → "99.99"
 * {percentage | number(1)} → "75.5"
 */
pipe('number', (value: number, decimals = 0) => {
	return value.toFixed(decimals);
});

/**
 * Pluralize pipe - Add 's' if count != 1
 * 
 * @example
 * {count | pluralize('item')} → "3 items" or "1 item"
 * {count | pluralize('person', 'people')} → "3 people" or "1 person"
 */
pipe('pluralize', (count: number, singular: string, plural?: string) => {
	const word = count === 1 ? singular : (plural || singular + 's');
	return `${count} ${word}`;
});

/**
 * Percent pipe - Format as percentage
 * 
 * @example
 * {0.75 | percent} → "75%"
 * {0.333 | percent(1)} → "33.3%"
 */
pipe('percent', (value: number, decimals = 0) => {
	return (value * 100).toFixed(decimals) + '%';
});

/**
 * Join pipe - Join array with separator
 * 
 * @example
 * {tags | join(', ')} → "javascript, react, vue"
 * {items | join(' | ')} → "item1 | item2"
 */
pipe('join', (arr: any[], separator = ', ') => {
	return Array.isArray(arr) ? arr.join(separator) : arr;
});

/**
 * Limit pipe - Limit array length
 * 
 * @example
 * {items | limit(3)} → First 3 items
 */
pipe('limit', (arr: any[], count: number) => {
	return Array.isArray(arr) ? arr.slice(0, count) : arr;
});

/**
 * Reverse pipe - Reverse string or array
 * 
 * @example
 * {name | reverse} → "nhoJ"
 * {items | reverse} → Reversed array
 */
pipe('reverse', (value: string | any[]) => {
	if (typeof value === 'string') {
		return value.split('').reverse().join('');
	}
	if (Array.isArray(value)) {
		return [...value].reverse();
	}
	return value;
});
