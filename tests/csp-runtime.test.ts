import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyTransitionStyles } from '../src/core/transition';
import { cspExpressionRuntime } from '../src/runtime/csp-evaluator';
import { setExpressionRuntime } from '../src/runtime/evaluator';
import { standardExpressionRuntime } from '../src/runtime/standard-evaluator';
import { parseTransitionName } from '../src/template/structurals/transition-helpers';
import { hideTargetSpinner, showTargetSpinner } from '../src/utils/target-spinner';

describe('CSP runtime styles', () => {
	beforeEach(() => {
		setExpressionRuntime(cspExpressionRuntime);
		document.head.innerHTML = '';
		document.body.innerHTML = '<main id="target"></main>';
	});

	afterEach(() => {
		setExpressionRuntime(standardExpressionRuntime);
		document.head.innerHTML = '';
		document.body.innerHTML = '';
	});

	it('never injects transition or target spinner style elements', () => {
		applyTransitionStyles();
		const spinner = showTargetSpinner(document.getElementById('target')!, 'append');

		expect(document.getElementById('gyos-transitions')).toBeNull();
		expect(document.getElementById('gyos-target-spinner-styles')).toBeNull();
		expect(spinner.className).toBe('gyos-target-spinner');

		hideTargetSpinner(spinner);
	});

	it('treats plain transition names as literals and evaluates only explicit expressions', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(parseTransitionName('fade', {})).toBe('fade');
		expect(parseTransitionName('slide-down', {})).toBe('slide-down');
		expect(parseTransitionName("'scale'", {})).toBe('scale');
		expect(parseTransitionName('{transitionName}', { transitionName: 'zoom' })).toBe('zoom');
		expect(consoleError).not.toHaveBeenCalled();
	});
});
