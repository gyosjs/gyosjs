import { cspExpressionRuntime } from './runtime/csp-evaluator';
import { setExpressionRuntime } from './runtime/evaluator';

setExpressionRuntime(cspExpressionRuntime);

export * from './public-api';
export { default } from './public-api';
