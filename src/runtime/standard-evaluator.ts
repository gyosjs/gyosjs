import type { ExpressionRuntime } from './evaluator';

export const standardExpressionRuntime: ExpressionRuntime = {
	mode: 'standard',

	evaluate(expression, scope) {
		const method = scope?.[expression];
		if (typeof method === 'function') return method.call(scope);

		try {
			const safeExpression = `try { return ${expression} } catch(e) { return undefined }`;
			const evaluate = new Function('$scope', `with($scope) { ${safeExpression} }`);
			return evaluate(scope);
		} catch (error) {
			console.error('[GyosJS] Error evaluating expression:', expression, error);
			return undefined;
		}
	},

	execute(expression, scope, event) {
		const method = scope?.[expression];
		if (typeof method === 'function') return method.call(scope, event);

		const execute = new Function('$event', `with(this) { ${expression} }`);
		return execute.call(scope, event);
	},

	parseScope(expression) {
		const parse = new Function(`return (${expression})`);
		return parse();
	},

	createMethod(parameters, body) {
		return new Function(parameters.join(', '), `with(this) { ${body} }`) as (...args: any[]) => any;
	}
};
