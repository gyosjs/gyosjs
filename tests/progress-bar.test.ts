import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressBar } from '../src/utils/progress-bar';

describe('router progress bar', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		document.body.innerHTML = '';
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('does not let an old completion reset a newer navigation', () => {
		const progress = new ProgressBar();
		progress.start();
		progress.complete();

		vi.advanceTimersByTime(300);
		progress.start();
		progress.setProgress(50);
		vi.advanceTimersByTime(300);

		expect(progress.getCurrentProgress()).toBe(50);
		expect(document.getElementById('gyos-progress-bar')!.style.width).toBe('50%');
	});
});
