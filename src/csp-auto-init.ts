import Gyos, { mountAll, ready, startRouter } from './public-api';
import { cspExpressionRuntime } from './runtime/csp-evaluator';
import { setExpressionRuntime } from './runtime/evaluator';
import { captureCspNonce } from './runtime/csp-nonce';

setExpressionRuntime(cspExpressionRuntime);

/** Browser auto-init entry for strict Content Security Policy deployments. */
if (typeof window !== 'undefined') {
	captureCspNonce();
	(window as any).Gyos = Gyos;
	(window as any).GYOS_DEBUG ??= false;
	(window as any).GYOS_DEBUG_VERBOSE ??= false;
	(window as any).GYOS_DEBUG_WARN_SUBSCRIBERS ??= false;

	ready(() => {
		startRouter();
		mountAll();
	});
}

export default Gyos;
