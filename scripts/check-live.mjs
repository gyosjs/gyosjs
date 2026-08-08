import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const version = packageJson.version;
const docsBase = process.env.GYOS_DOCS_URL || 'https://gyosjs.dev';
const demoBase = process.env.GYOS_DEMO_URL || 'https://demo-inventory.gyosjs.dev';
const attempts = Number(process.env.GYOS_LIVE_ATTEMPTS || 3);

const checks = [
	{
		name: 'documentation home',
		url: docsBase,
		contentType: 'text/html',
		contains: 'GyosJS'
	},
	{
		name: 'documentation API reference',
		url: new URL('/api-reference', docsBase).href,
		contentType: 'text/html',
		contains: 'API Reference'
	},
	{
		name: 'Inventory Desk',
		url: new URL('/products', demoBase).href,
		contentType: 'text/html',
		contains: 'Inventory Desk'
	},
	{
		name: 'npm registry',
		url: `https://registry.npmjs.org/gyosjs/${version}`,
		contentType: 'application/json',
		validate: body => JSON.parse(body).version === version
	},
	{
		name: 'jsDelivr bundle',
		url: `https://cdn.jsdelivr.net/npm/gyosjs@${version}/dist/gyos.auto.min.js`,
		contentType: 'javascript',
		minimumBytes: 10_000
	},
	{
		name: 'unpkg bundle',
		url: `https://unpkg.com/gyosjs@${version}/dist/gyos.auto.min.js`,
		contentType: 'javascript',
		minimumBytes: 10_000
	}
];

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function fetchCheck(check) {
	const response = await fetch(check.url, {
		headers: { 'user-agent': `gyosjs-live-check/${version}` },
		signal: AbortSignal.timeout(15_000)
	});
	const body = await response.text();
	const contentType = response.headers.get('content-type') || '';

	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	if (!contentType.toLowerCase().includes(check.contentType)) {
		throw new Error(`unexpected content-type ${contentType || '(missing)'}`);
	}
	if (check.contains && !body.includes(check.contains)) throw new Error(`missing marker: ${check.contains}`);
	if (check.minimumBytes && Buffer.byteLength(body) < check.minimumBytes) {
		throw new Error(`response is smaller than ${check.minimumBytes} bytes`);
	}
	if (check.validate && !check.validate(body)) throw new Error('response contract did not match');
}

for (const check of checks) {
	let failure;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			await fetchCheck(check);
			failure = undefined;
			break;
		} catch (error) {
			failure = error;
			if (attempt < attempts) await sleep(attempt * 1_000);
		}
	}
	if (failure) throw new Error(`${check.name} failed after ${attempts} attempts: ${failure.message}`);
	console.log(`OK ${check.name}: ${check.url}`);
}
