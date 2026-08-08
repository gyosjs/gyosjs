import { defineConfig } from '@playwright/test';

const useSystemChrome = process.platform === 'win32' && !process.env.CI;

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	timeout: 45_000,
	workers: 2,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: {
		baseURL: 'http://127.0.0.1:4173',
		headless: true,
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: {
				browserName: 'chromium',
				channel: useSystemChrome ? 'chrome' : undefined
			}
		},
		{ name: 'firefox', use: { browserName: 'firefox' } },
		{ name: 'webkit', use: { browserName: 'webkit' } }
	],
	webServer: {
		command: 'npm run dev:e2e',
		url: 'http://127.0.0.1:4173/router/layout-base.html',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
