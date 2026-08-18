import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cspExpressionRuntime, __cspEvaluatorTest } from '../src/runtime/csp-evaluator';
import { setExpressionRuntime } from '../src/runtime/evaluator';
import { standardExpressionRuntime } from '../src/runtime/standard-evaluator';
import { evaluateExpression } from '../src/template/expression';

describe('CSP expression runtime', () => {
	beforeEach(() => {
		__cspEvaluatorTest.clearCache();
		setExpressionRuntime(cspExpressionRuntime);
	});

	afterEach(() => {
		setExpressionRuntime(standardExpressionRuntime);
		vi.restoreAllMocks();
	});

	it('evaluates reads, operators, collections, and optional chains', () => {
		const scope = {
			count: 3,
			active: true,
			user: { profile: { name: 'Gyos' } },
			missing: null
		};

		expect(evaluateExpression("active && count > 2 ? user.profile.name + 'JS' : 'no'", scope, false)).toBe('GyosJS');
		expect(evaluateExpression('[count, count + 1]', scope, false)).toEqual([3, 4]);
		expect(evaluateExpression("{ name: user.profile.name, enabled: active }", scope, false)).toEqual({
			name: 'Gyos',
			enabled: true
		});
		expect(evaluateExpression('missing?.profile?.name', scope, false)).toBeUndefined();
		expect(evaluateExpression('missing?.profile.name', scope, false)).toBeUndefined();
	});

	it('preserves method receivers and calls named scope methods', () => {
		const scope = {
			items: [1],
			step: 2,
			increment(amount: number) {
				this.step += amount;
				return this.step;
			}
		};

		expect(cspExpressionRuntime.execute('items.push(step)', scope)).toBe(2);
		expect(scope.items).toEqual([1, 2]);
		expect(cspExpressionRuntime.execute('increment(3)', scope)).toBe(5);
		expect(scope.step).toBe(5);
	});

	it('executes assignments, updates, multiple statements, and event locals', () => {
		const scope = { count: 1, active: false, eventType: '' };
		const event = new Event('submit');

		cspExpressionRuntime.execute('count += 2; active = !active; eventType = $event.type', scope, event);

		expect(scope).toEqual({ count: 3, active: true, eventType: 'submit' });
		expect(cspExpressionRuntime.execute('count++', scope)).toBe(3);
		expect(scope.count).toBe(4);
	});

	it('writes through inherited loop properties', () => {
		const parent = { count: 1 };
		const child: any = {};
		Object.defineProperty(child, 'count', {
			get: () => parent.count,
			set: value => { parent.count = value; },
			enumerable: true
		});

		cspExpressionRuntime.execute('count = count + 4', child);

		expect(parent.count).toBe(5);
	});

	it('parses data-only inline scopes and simple gm method bodies', () => {
		const scope = cspExpressionRuntime.parseScope("{ count: 2, labels: ['a', 'b'] }")!;
		const multiply = cspExpressionRuntime.createMethod(['amount'], 'count += amount; return count * 2');

		expect(scope).toEqual({ count: 2, labels: ['a', 'b'] });
		expect(multiply.call(scope, 3)).toBe(10);
		expect(scope.count).toBe(5);
	});

	it('rejects globals, constructor chains, and unsupported function syntax', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(cspExpressionRuntime.evaluate('window.location', {})).toBeUndefined();
		expect(cspExpressionRuntime.evaluate('value.constructor', { value: {} })).toBeUndefined();
		expect(cspExpressionRuntime.evaluate('items.filter(item => item.active)', { items: [] })).toBeUndefined();

		expect(error).toHaveBeenCalledTimes(3);
		expect(error.mock.calls.map(call => String(call[0])).join('\n')).toContain('[GyosJS CSP]');
	});

	it('caches parsed AST by expression and program mode', () => {
		cspExpressionRuntime.evaluate('count + 1', { count: 1 });
		cspExpressionRuntime.evaluate('count + 1', { count: 2 });
		cspExpressionRuntime.execute('count++', { count: 1 });
		cspExpressionRuntime.execute('count++', { count: 2 });

		expect(__cspEvaluatorTest.cacheSize()).toBe(2);
	});
});
