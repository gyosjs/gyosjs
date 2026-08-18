import { parse } from 'acorn';
import type { ExpressionRuntime } from './evaluator';

type AstNode = any;

interface EvaluationContext {
	scope: any;
	locals: Record<string, any>;
}

interface Reference {
	get(): any;
	set(value: any): any;
}

class ReturnSignal {
	constructor(readonly value: any) {}
}

const expressionCache = new Map<string, AstNode>();
const programCache = new Map<string, AstNode>();
const forbiddenProperties = new Set(['constructor', '__proto__', 'prototype']);
const optionalChainMiss = Symbol('GyosJS CSP optional chain');

function cspError(message: string, expression: string, node?: AstNode): Error {
	const position = typeof node?.start === 'number' ? ` at position ${node.start}` : '';
	return new Error(`[GyosJS CSP] ${message}${position}: ${expression}`);
}

function parseExpression(expression: string): AstNode {
	const cached = expressionCache.get(expression);
	if (cached) return cached;

	try {
		const program = parse(`(${expression})`, { ecmaVersion: 'latest' }) as AstNode;
		const node = program.body[0]?.expression;
		if (!node) throw cspError('Empty expression', expression);
		expressionCache.set(expression, node);
		return node;
	} catch (error) {
		if (error instanceof Error && error.message.startsWith('[GyosJS CSP]')) throw error;
		const position = typeof (error as any)?.pos === 'number' ? ` at position ${(error as any).pos - 1}` : '';
		throw new Error(`[GyosJS CSP] Invalid expression${position}: ${expression}`);
	}
}

function parseProgram(source: string, allowReturn = false): AstNode {
	const key = `${allowReturn ? 'return' : 'event'}:${source}`;
	const cached = programCache.get(key);
	if (cached) return cached;

	try {
		const program = parse(source, {
			ecmaVersion: 'latest',
			allowReturnOutsideFunction: allowReturn
		}) as AstNode;
		programCache.set(key, program);
		return program;
	} catch (error) {
		const position = typeof (error as any)?.pos === 'number' ? ` at position ${(error as any).pos}` : '';
		throw new Error(`[GyosJS CSP] Invalid expression body${position}: ${source}`);
	}
}

function assertSafeProperty(property: any, expression: string, node: AstNode): PropertyKey {
	if ((typeof property === 'string' || typeof property === 'number') && forbiddenProperties.has(String(property))) {
		throw cspError(`Access to property "${String(property)}" is forbidden`, expression, node);
	}
	if (typeof property !== 'string' && typeof property !== 'number' && typeof property !== 'symbol') {
		throw cspError('Invalid property key', expression, node);
	}
	return property;
}

function resolveIdentifier(name: string, context: EvaluationContext, expression: string, node: AstNode): any {
	if (Object.prototype.hasOwnProperty.call(context.locals, name)) return context.locals[name];
	if (name in context.scope) return context.scope[name];
	if (name === 'undefined') return undefined;
	if (name === 'NaN') return Number.NaN;
	if (name === 'Infinity') return Number.POSITIVE_INFINITY;
	throw cspError(`Undefined identifier "${name}"`, expression, node);
}

function memberParts(node: AstNode, context: EvaluationContext, expression: string): [any, PropertyKey] {
	const object = evaluateNode(node.object, context, expression);
	if (object === optionalChainMiss) return [optionalChainMiss, ''];
	if (object == null) {
		if (node.optional) return [optionalChainMiss, ''];
		throw cspError('Cannot read a property of null or undefined', expression, node);
	}
	const rawProperty = node.computed
		? evaluateNode(node.property, context, expression)
		: node.property.name;
	return [object, assertSafeProperty(rawProperty, expression, node.property)];
}

function resolveReference(node: AstNode, context: EvaluationContext, expression: string): Reference {
	if (node.type === 'Identifier') {
		return {
			get: () => resolveIdentifier(node.name, context, expression, node),
			set: value => {
				if (Object.prototype.hasOwnProperty.call(context.locals, node.name)) context.locals[node.name] = value;
				else context.scope[node.name] = value;
				return value;
			}
		};
	}

	if (node.type === 'MemberExpression') {
		const [object, property] = memberParts(node, context, expression);
		if (object == null) throw cspError('Invalid assignment target', expression, node);
		return {
			get: () => object[property],
			set: value => {
				object[property] = value;
				return value;
			}
		};
	}

	throw cspError('Invalid assignment target', expression, node);
}

function evaluateCall(node: AstNode, context: EvaluationContext, expression: string): any {
	const args = node.arguments.map((argument: AstNode) => {
		if (argument.type === 'SpreadElement') throw cspError('Spread arguments are not supported', expression, argument);
		return evaluateNode(argument, context, expression);
	});

	if (node.callee.type === 'MemberExpression') {
		const [object, property] = memberParts(node.callee, context, expression);
		if (object === optionalChainMiss) return optionalChainMiss;
		const method = object[property];
		if (method == null && node.optional) return optionalChainMiss;
		if (typeof method !== 'function') throw cspError('Called value is not a function', expression, node.callee);
		return method.apply(object, args);
	}

	const callable = evaluateNode(node.callee, context, expression);
	if (callable === optionalChainMiss) return optionalChainMiss;
	if (callable == null && node.optional) return optionalChainMiss;
	if (typeof callable !== 'function') throw cspError('Called value is not a function', expression, node.callee);
	return callable.apply(context.scope, args);
}

function applyAssignment(operator: string, current: any, value: any, expression: string, node: AstNode): any {
	switch (operator) {
		case '=': return value;
		case '+=': return current + value;
		case '-=': return current - value;
		case '*=': return current * value;
		case '/=': return current / value;
		case '%=': return current % value;
		case '**=': return current ** value;
		case '&&=': return current && value;
		case '||=': return current || value;
		case '??=': return current ?? value;
		default: throw cspError(`Unsupported assignment operator "${operator}"`, expression, node);
	}
}

function evaluateNode(node: AstNode, context: EvaluationContext, expression: string): any {
	switch (node.type) {
		case 'Literal':
			if (node.regex || typeof node.value === 'bigint') throw cspError('Unsupported literal', expression, node);
			return node.value;
		case 'Identifier':
			return resolveIdentifier(node.name, context, expression, node);
		case 'ArrayExpression':
			return node.elements.map((element: AstNode | null) => {
				if (!element) return undefined;
				if (element.type === 'SpreadElement') throw cspError('Spread elements are not supported', expression, element);
				return evaluateNode(element, context, expression);
			});
		case 'ObjectExpression': {
			const result: Record<PropertyKey, any> = {};
			for (const property of node.properties) {
				if (property.type !== 'Property' || property.kind !== 'init' || property.method) {
					throw cspError('Object methods, getters, setters, and spread are not supported', expression, property);
				}
				const rawKey = property.computed
					? evaluateNode(property.key, context, expression)
					: property.key.name ?? property.key.value;
				const key = assertSafeProperty(rawKey, expression, property.key);
				result[key] = property.shorthand
					? resolveIdentifier(property.key.name, context, expression, property.key)
					: evaluateNode(property.value, context, expression);
			}
			return result;
		}
		case 'MemberExpression': {
			const [object, property] = memberParts(node, context, expression);
			return object === optionalChainMiss ? optionalChainMiss : object[property];
		}
		case 'ChainExpression': {
			const value = evaluateNode(node.expression, context, expression);
			return value === optionalChainMiss ? undefined : value;
		}
		case 'CallExpression':
			return evaluateCall(node, context, expression);
		case 'UnaryExpression': {
			if (node.operator === 'delete') throw cspError('The delete operator is not supported', expression, node);
			const value = evaluateNode(node.argument, context, expression);
			switch (node.operator) {
				case '!': return !value;
				case '+': return +value;
				case '-': return -value;
				case 'typeof': return typeof value;
				case 'void': return undefined;
				default: throw cspError(`Unsupported unary operator "${node.operator}"`, expression, node);
			}
		}
		case 'BinaryExpression': {
			const left = evaluateNode(node.left, context, expression);
			const right = evaluateNode(node.right, context, expression);
			switch (node.operator) {
				case '+': return left + right;
				case '-': return left - right;
				case '*': return left * right;
				case '/': return left / right;
				case '%': return left % right;
				case '**': return left ** right;
				case '==': return left == right;
				case '!=': return left != right;
				case '===': return left === right;
				case '!==': return left !== right;
				case '<': return left < right;
				case '<=': return left <= right;
				case '>': return left > right;
				case '>=': return left >= right;
				case 'in': return left in right;
				case 'instanceof': return left instanceof right;
				default: throw cspError(`Unsupported binary operator "${node.operator}"`, expression, node);
			}
		}
		case 'LogicalExpression': {
			const left = evaluateNode(node.left, context, expression);
			if (node.operator === '&&') return left && evaluateNode(node.right, context, expression);
			if (node.operator === '||') return left || evaluateNode(node.right, context, expression);
			if (node.operator === '??') return left ?? evaluateNode(node.right, context, expression);
			throw cspError(`Unsupported logical operator "${node.operator}"`, expression, node);
		}
		case 'ConditionalExpression':
			return evaluateNode(node.test, context, expression)
				? evaluateNode(node.consequent, context, expression)
				: evaluateNode(node.alternate, context, expression);
		case 'AssignmentExpression': {
			const reference = resolveReference(node.left, context, expression);
			const current = node.operator === '=' ? undefined : reference.get();
			if (node.operator === '&&=' && !current) return current;
			if (node.operator === '||=' && current) return current;
			if (node.operator === '??=' && current != null) return current;
			const value = evaluateNode(node.right, context, expression);
			return reference.set(applyAssignment(node.operator, current, value, expression, node));
		}
		case 'UpdateExpression': {
			const reference = resolveReference(node.argument, context, expression);
			const current = reference.get();
			const next = node.operator === '++' ? current + 1 : current - 1;
			reference.set(next);
			return node.prefix ? next : current;
		}
		case 'SequenceExpression': {
			let value: any;
			for (const item of node.expressions) value = evaluateNode(item, context, expression);
			return value;
		}
		default:
			throw cspError(`Unsupported syntax "${node.type}"`, expression, node);
	}
}

function evaluateProgram(program: AstNode, context: EvaluationContext, source: string, allowReturn: boolean): any {
	let value: any;
	for (const statement of program.body) {
		if (statement.type === 'EmptyStatement') continue;
		if (statement.type === 'ExpressionStatement') {
			value = evaluateNode(statement.expression, context, source);
			continue;
		}
		if (allowReturn && statement.type === 'ReturnStatement') {
			throw new ReturnSignal(statement.argument ? evaluateNode(statement.argument, context, source) : undefined);
		}
		throw cspError(`Unsupported statement "${statement.type}"`, source, statement);
	}
	return value;
}

function report(error: unknown): undefined {
	console.error(error instanceof Error ? error.message : '[GyosJS CSP] Unknown expression error', error);
	return undefined;
}

export const cspExpressionRuntime: ExpressionRuntime = {
	mode: 'csp',

	evaluate(expression, scope) {
		try {
			const direct = scope?.[expression];
			if (typeof direct === 'function') return direct.call(scope);
			return evaluateNode(parseExpression(expression), { scope, locals: {} }, expression);
		} catch (error) {
			return report(error);
		}
	},

	execute(expression, scope, event) {
		const direct = scope?.[expression];
		if (typeof direct === 'function') return direct.call(scope, event);
		return evaluateProgram(
			parseProgram(expression),
			{ scope, locals: { $event: event } },
			expression,
			false
		);
	},

	parseScope(expression) {
		try {
			const value = evaluateNode(parseExpression(expression), { scope: {}, locals: {} }, expression);
			if (!value || typeof value !== 'object' || Array.isArray(value)) {
				throw cspError('Inline g-scope must evaluate to an object', expression);
			}
			return value;
		} catch (error) {
			return report(error);
		}
	},

	createMethod(parameters, body) {
		let program: AstNode;
		try {
			program = parseProgram(body, true);
		} catch (error) {
			report(error);
			return () => undefined;
		}

		return function(this: any, ...args: any[]): any {
			const locals: Record<string, any> = {};
			parameters.forEach((parameter, index) => {
				locals[parameter] = args[index];
			});
			try {
				return evaluateProgram(program, { scope: this, locals }, body, true);
			} catch (error) {
				if (error instanceof ReturnSignal) return error.value;
				return report(error);
			}
		};
	}
};

export const __cspEvaluatorTest = {
	clearCache(): void {
		expressionCache.clear();
		programCache.clear();
	},
	cacheSize(): number {
		return expressionCache.size + programCache.size;
	}
};
