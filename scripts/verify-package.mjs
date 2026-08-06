import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;

if (!npmCli) throw new Error('npm_execpath is unavailable; run this check through npm.');

function runNode(script, args, cwd) {
	execFileSync(process.execPath, [script, ...args], {
		cwd,
		stdio: ['ignore', 'pipe', 'inherit'],
		encoding: 'utf8'
	});
}

function runNpm(args, cwd) {
	return execFileSync(process.execPath, [npmCli, ...args], {
		cwd,
		stdio: ['ignore', 'pipe', 'inherit'],
		encoding: 'utf8',
		env: {
			...process.env,
			npm_config_audit: 'false',
			npm_config_cache: path.join(packageWorkspace, 'npm-cache'),
			npm_config_fund: 'false',
			npm_config_ignore_scripts: 'true'
		}
	});
}

const requiredFiles = [
	'dist/gyos.esm.js',
	'dist/gyos.js',
	'dist/gyos.min.js',
	'dist/gyos.auto.esm.js',
	'dist/gyos.auto.js',
	'dist/gyos.auto.min.js',
	'dist/index.d.ts',
	'LICENSE.md',
	'README.md',
	'package.json'
];

const forbiddenPrefixes = ['src/', 'tests/', 'examples/', 'docs/', '.github/'];
const packageWorkspace = await mkdtemp(path.join(tmpdir(), 'gyosjs-package-'));
const consumerRoot = path.join(root, '.release-tmp');
await mkdir(consumerRoot, { recursive: true });
const consumerWorkspace = await mkdtemp(path.join(consumerRoot, 'consumer-'));

try {
	runNpm(['run', 'build'], root);
	const rootPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
	const sourceIndex = await readFile(path.join(root, 'src', 'index.ts'), 'utf8');
	if (!sourceIndex.includes(`version: '${rootPackage.version}'`)) {
		throw new Error(`src/index.ts version does not match package version ${rootPackage.version}.`);
	}

	const packResult = JSON.parse(runNpm([
		'pack',
		'--json',
		'--silent',
		'--pack-destination',
		packageWorkspace
	], root));
	const packageResult = packResult[0];
	const packedFiles = new Set(packageResult.files.map(file => file.path.replaceAll('\\', '/')));

	for (const requiredFile of requiredFiles) {
		if (!packedFiles.has(requiredFile)) {
			throw new Error(`Package is missing required file: ${requiredFile}`);
		}
	}

	for (const packedFile of packedFiles) {
		if (forbiddenPrefixes.some(prefix => packedFile.startsWith(prefix))) {
			throw new Error(`Package contains development-only file: ${packedFile}`);
		}
	}

	const fixture = consumerWorkspace;
	await mkdir(path.join(fixture, 'src'), { recursive: true });
	await writeFile(path.join(fixture, 'package.json'), JSON.stringify({
		name: 'gyosjs-package-consumer',
		private: true,
		type: 'module'
	}, null, 2));
	await writeFile(path.join(fixture, 'index.html'), '<script type="module" src="/src/main.ts"></script>');
	await writeFile(path.join(fixture, 'src', 'main.ts'), `
import Gyos, { signal, startRouter } from 'gyosjs';
import AutoGyos from 'gyosjs/auto';

const count = signal(1);
document.body.dataset.packageSmoke = [
  Gyos.version,
  AutoGyos.version,
  String(count.value),
  typeof startRouter
].join(':');
`);

	const tarball = path.join(packageWorkspace, packageResult.filename);
	runNpm([
		'install',
		tarball,
		'--ignore-scripts',
		'--no-package-lock',
		'--no-audit',
		'--no-fund'
	], fixture);

	const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
	runNode(tsc, [
		'--noEmit',
		'--strict',
		'--target', 'ES2020',
		'--module', 'ESNext',
		'--moduleResolution', 'Bundler',
		'--lib', 'ES2020,DOM',
		'src/main.ts'
	], fixture);

	const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
	runNode(vite, ['build'], fixture);
	const bundledHtml = await readFile(path.join(fixture, 'dist', 'index.html'), 'utf8');
	if (!bundledHtml.includes('assets/')) throw new Error('Consumer fixture did not produce a Vite asset bundle.');

	console.log(`Package smoke check passed: ${packageResult.filename} (${packageResult.size} bytes)`);
} finally {
	await rm(packageWorkspace, { recursive: true, force: true });
	await rm(consumerWorkspace, { recursive: true, force: true });
}
