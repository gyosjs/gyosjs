import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

// Run from the repository root. Pass a published bundle to measure the baseline.
const bundle = path.resolve(process.argv[2] || 'dist/gyos.csp.auto.min.js');
const output = process.argv[3];
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'chrome' : undefined });
try {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.setContent('<!doctype html><html><body></body></html>');
	await page.addScriptTag({ path: bundle });
	const results = await page.evaluate(async () => {
		const G = window.Gyos,
			size = 64,
			iterations = 20;
		const scenarios = ['same-order', 'adjacent-swap', 'distant-swap', 'rotate-left', 'reverse', 'prepend', 'remove'];
		const results = [];
		for (const scenario of scenarios) {
			const samples = [];
			for (let round = 0; round < iterations; round++) {
				const root = document.createElement('div'),
					name = `Bench${scenario}${round}`;
				root.setAttribute('g-scope', name);
				root.innerHTML =
					'<div class="row" *for="item in items()" g-key="item.id" :data-id="item.id">{item.label}</div>';
				document.body.append(root);
				const initial = Array.from({ length: size }, (_, id) => ({ id, label: String(id) }));
				const items = G.signal(initial);
				G.scope(name, { items });
				G.mount(root);
				const before = new Map([...root.querySelectorAll('.row')].map((el) => [Number(el.dataset.id), el]));
				const observer = new MutationObserver(() => {});
				observer.observe(root, { childList: true });
				let next = initial.slice();
				if (scenario === 'same-order') next = next.map((item) => ({ ...item, label: `updated-${item.id}` }));
				if (scenario === 'adjacent-swap') [next[30], next[31]] = [next[31], next[30]];
				if (scenario === 'distant-swap') [next[1], next[62]] = [next[62], next[1]];
				if (scenario === 'rotate-left') next.push(next.shift());
				if (scenario === 'reverse') next.reverse();
				if (scenario === 'prepend') next.unshift({ id: size, label: 'new' });
				if (scenario === 'remove') next.splice(30, 1);
				const started = performance.now();
				// batch settles the list effect; subsequent row effects settle in microtasks.
				G.batch(() => items(next));
				const records = observer.takeRecords();
				observer.disconnect();
				await Promise.resolve();
				await Promise.resolve();
				const ms = performance.now() - started;
				const after = [...root.querySelectorAll('.row')];
				const moved = records
					.flatMap((record) => [...record.addedNodes])
					.filter((node) => before.get(Number(node.dataset?.id)) === node).length;
				const orderCorrect =
					after.every((el, i) => Number(el.dataset.id) === next[i]?.id && el.textContent === next[i]?.label) &&
					after.length === next.length;
				const identityCorrect = after.every(
					(el) => !before.has(Number(el.dataset.id)) || before.get(Number(el.dataset.id)) === el
				);
				samples.push({ ms, moved, orderCorrect, identityCorrect });
				G.cleanup(root);
				root.remove();
			}
			const times = samples.map((sample) => sample.ms).sort((a, b) => a - b);
			results.push({
				scenario,
				size,
				iterations,
				movesPerUpdate: [...new Set(samples.map((sample) => sample.moved))],
				medianMs: times[10],
				p95Ms: times[19],
				valid: samples.every((sample) => sample.orderCorrect && sample.identityCorrect)
			});
		}
		return results;
	});
	const report = {
		bundleSha256: createHash('sha256').update(await readFile(bundle)).digest('hex'),
		measuredAt: new Date().toISOString(),
		bundle: path.basename(bundle),
		browser: browser.version(),
		node: process.version,
		platform: `${os.platform()} ${os.release()}`,
		cpu: os.cpus()[0]?.model,
		workload:
			'64 keyed DOM rows; 20 fresh mounts per scenario; synchronous batch through microtask flush, excludes paint; no throttling',
		results,
		errors
	};
	if (output) {
		await mkdir(path.dirname(output), { recursive: true });
		await writeFile(output, JSON.stringify(report, null, 2) + '\n');
	}
	console.log(JSON.stringify(report, null, 2));
	if (errors.length || results.some((result) => !result.valid)) process.exitCode = 1;
} finally {
	await browser.close();
}
