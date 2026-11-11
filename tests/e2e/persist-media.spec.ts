import { test, expect } from '@playwright/test';

// Locally generated PCM; no server media, credentials or external requests.
function sound() {
	const rate = 8000, samples = rate * 12, wav = Buffer.alloc(44 + samples);
	wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
	wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate, 28); wav.writeUInt16LE(1, 32);
	wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(samples, 40);
	wav.fill(128, 44);
	return wav;
}

for (const mode of ['inner', 'replace', 'morph']) {
	for (const interrupted of [false, true]) {
		test(`body ${mode} preserves playing audio across ${interrupted ? 'aborted' : 'completed'} slow scripts`, async ({ page, browserName }) => {
			test.skip(process.platform === 'win32' && browserName === 'webkit', 'Windows WebKit cannot play the PCM fixture (NotSupportedError); Linux CI exercises playback.');
			let release!: () => void, requested!: () => void;
			const gate = new Promise<void>(resolve => { release = resolve; });
			const pending = new Promise<void>(resolve => { requested = resolve; });
			const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
			await page.route('**/persist-media/**', async route => {
				const path = new URL(route.request().url()).pathname;
				if (path.endsWith('.wav')) {
					const wav = sound();
					const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range || '');
					const start = range ? Number(range[1]) : 0;
					const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
					return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav',
						headers: { 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}) },
						body: wav.subarray(start, end + 1) });
				}
				if (path.endsWith('.js')) {
					requested(); await gate;
					return route.fulfill({ contentType: 'text/javascript', body: 'window.mediaScriptLoaded = true;' });
				}
				return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8">
				<script src="/gyos-dist/gyos.csp.auto.min.js"></script></head><body g-boost g-outlet g-snapshot>
				<button id="play" onclick="document.querySelector('audio').play()">Play</button>
				<div g-persist="player"><audio id="audio" loop src="/persist-media/sound.wav"></audio></div>
				${path.endsWith('/next') ? '<script src="/persist-media/slow.js"></script>' : ''}</body></html>` });
			});
			await page.goto('/persist-media/start');
			await page.locator('#play').click();
			await page.locator('audio').evaluate((a: HTMLAudioElement) => a.play());
			await expect.poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(0);
			await page.evaluate(({ mode }) => {
				const w = window as any;
				w.originalAudio = document.querySelector('audio'); w.pauses = 0;
				w.originalAudio.addEventListener('pause', () => w.pauses++);
				w.navigationAbort = new AbortController();
				w.Gyos.navigate('/persist-media/next', { swap: mode, signal: w.navigationAbort.signal }).then((result: any) => { w.navigationResult = result; });
			}, { mode });
			await pending;
			try {
				await page.waitForTimeout(400);
				expect(await page.evaluate(() => {
					const w = window as any; return { connected: w.originalAudio.isConnected, paused: w.originalAudio.paused };
				})).toEqual({ connected: true, paused: false });
				if (interrupted) await page.evaluate(() => (window as any).navigationAbort.abort());
			} finally { release(); }
			await expect.poll(() => page.evaluate(() => (window as any).navigationResult?.outcome)).toBe(interrupted ? 'aborted' : 'success');
			expect(await page.evaluate(() => {
				const w = window as any;
				return { same: document.querySelector('audio') === w.originalAudio, paused: w.originalAudio.paused, pauses: w.pauses };
			})).toEqual({ same: true, paused: false, pauses: 0 });
			if (!interrupted) {
				await page.goBack(); await expect(page).toHaveURL(/\/persist-media\/start$/);
				await expect.poll(() => page.evaluate(() => document.querySelector('audio') === (window as any).originalAudio)).toBe(true);
				await page.goForward(); await expect(page).toHaveURL(/\/persist-media\/next$/);
				await expect.poll(() => page.evaluate(() => document.querySelector('audio') === (window as any).originalAudio)).toBe(true);
				expect(await page.locator('audio').evaluate((a: HTMLAudioElement) => a.paused)).toBe(false);
			}
			expect(errors).toEqual([]);
		});
	}
}
