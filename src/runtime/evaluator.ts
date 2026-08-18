import type { Scope } from '../types';

export interface ExpressionRuntime {
	readonly mode: 'standard' | 'csp';
	evaluate(expression: string, scope: any): any;
	execute(expression: string, scope: any, event?: Event): any;
	parseScope(expression: string): Scope | undefined;
	createMethod(parameters: string[], body: string): (...args: any[]) => any;
}

let activeRuntime: ExpressionRuntime | undefined;

export function setExpressionRuntime(runtime: ExpressionRuntime): void {
	activeRuntime = runtime;
}

export function expressionRuntime(): ExpressionRuntime {
	if (!activeRuntime) {
		throw new Error('[GyosJS] Expression runtime is not configured. Import GyosJS from a public entry point.');
	}
	return activeRuntime;
}

export function expressionRuntimeMode(): ExpressionRuntime['mode'] {
	return activeRuntime?.mode ?? 'standard';
}
