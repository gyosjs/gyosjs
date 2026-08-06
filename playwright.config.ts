import { defineConfig } from '@playwright/test';

const useSystemChrome = process.platform === 'win32' && !process.env.CI;

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: {
		baseURL: 'http://127.0.0.1:4173',
		channel: useSystemChrome ? 'chrome' : undefined,
		headless: true,
		trace: 'retain-on-failure'
	},
	webServer: {
		command: 'npm run dev:e2e',
		url: 'http://127.0.0.1:4173/router/layout-base.html',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
