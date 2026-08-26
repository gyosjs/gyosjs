import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyTransitionStyles } from '../src/core/transition';
import Gyos from '../src/index';
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

	it('does not evaluate aliases in dormant await branches', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const scopeName = `CspAwait${Date.now()}`;

		document.body.innerHTML = `
			<div g-scope="${scopeName}">
				<div *await="slotsPromise">
					<div *then="availableSlots">
						<p *if="availableSlots.length === 0">Empty</p>
					</div>
				</div>
			</div>
		`;
		Gyos.scope(scopeName, { slotsPromise: Promise.resolve([]) });
		Gyos.mountAll();

		await vi.waitFor(() => expect(document.body.textContent).toContain('Empty'));

		expect(consoleError.mock.calls.some(([message]) => String(message).includes('Undefined identifier "availableSlots"'))).toBe(false);
	});

	it('keeps missing identifier diagnostics outside dormant await branches', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

		cspExpressionRuntime.evaluate('missingValue', {});

		expect(consoleError.mock.calls.some(([message]) => String(message).includes('Undefined identifier "missingValue"'))).toBe(true);
	});

	it('renders catch aliases after a CSP await rejection', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const scopeName = `CspAwaitCatch${Date.now()}`;

		document.body.innerHTML = `
			<div g-scope="${scopeName}">
				<div *await="slotsPromise">
					<p *pending>Loading</p>
					<p *then="availableSlots">{availableSlots.length}</p>
					<p *catch="loadError">{loadError.message}</p>
				</div>
			</div>
		`;
		Gyos.scope(scopeName, { slotsPromise: Promise.reject(new Error('Network unavailable')) });
		Gyos.mountAll();

		await vi.waitFor(() => expect(document.body.textContent).toContain('Network unavailable'));

		expect(consoleError.mock.calls.some(([message]) => String(message).includes('Undefined identifier'))).toBe(false);
	});
});
