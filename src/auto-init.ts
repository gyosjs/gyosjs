import Gyos, { applyTransitionStyles, startRouter, mountAll, ready } from './index';

/**
 * Browser auto-init entry.
 * Attaches Gyos to window, sets debug defaults, injects transitions, starts router,
 * and mounts on DOMContentLoaded.
 */
if (typeof window !== 'undefined') {
	(window as any).Gyos = Gyos;
	(window as any).GYOS_DEBUG ??= false;
	(window as any).GYOS_DEBUG_VERBOSE ??= false;
	(window as any).GYOS_DEBUG_WARN_SUBSCRIBERS ??= false;

	ready(() => {
		applyTransitionStyles();
		startRouter();
		mountAll();
	});
}

export default Gyos;
