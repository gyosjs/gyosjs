import { describe, expect, it, vi } from 'vitest';
import { ready } from '../src/utils/helpers';

describe('ready', () => {
	it('runs callbacks registered after DOMContentLoaded', async () => {
		const callback = vi.fn();

		ready(callback);

		await vi.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
	});
});
