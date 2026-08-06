import { execFileSync } from 'node:child_process';
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedRemote = 'github.com/gyosjs/gyosjs';
const sourceEntries = [
	'.github',
	'docs',
	'examples',
	'scripts',
	'src',
	'tests',
	'.gitignore',
	'CHANGELOG.md',
	'CONTRIBUTING.md',
	'LICENSE.md',
	'README.md',
	'RELEASE.md',
	'SECURITY.md',
	'package-lock.json',
	'package.json',
	'playwright.config.ts',
	'rollup.config.js',
	'tsconfig.json',
	'vite.config.js',
	'vitest.config.ts'
];

const textExtensions = new Set(['.html', '.js', '.json', '.md', '.mjs', '.ts', '.yml', '.yaml']);
const forbiddenPatterns = [
	/D:[\\/]Aetherone/i,
	/localhost:3000\/@fs/i
];

function parseArguments(args) {
	const flags = new Set(args.filter(argument => argument.startsWith('--')));
	const unknownFlags = [...flags].filter(flag => flag !== '--sync' && flag !== '--dry-run');
	const positional = args.filter(argument => !argument.startsWith('--'));

	if (unknownFlags.length) throw new Error(`Unknown option: ${unknownFlags[0]}`);
	if (positional.length !== 1) {
		throw new Error('Usage: npm run export:public -- <destination> [--sync] [--dry-run]');
	}
	if (flags.has('--dry-run') && !flags.has('--sync')) {
		throw new Error('--dry-run requires --sync.');
	}

	return {
		destination: path.resolve(positional[0]),
		dryRun: flags.has('--dry-run'),
		sync: flags.has('--sync')
	};
}

function isWithin(parent, candidate) {
	const relative = path.relative(parent, candidate);
	return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function runGit(args, cwd) {
	return execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	}).trim();
}

function normalizeRemote(value) {
	return value
		.trim()
		.replace(/^git@github\.com:/i, 'github.com/')
		.replace(/^ssh:\/\/git@github\.com\//i, 'github.com/')
		.replace(/^https?:\/\/(?:[^@/]+@)?github\.com\//i, 'github.com/')
		.replace(/\.git$/i, '')
		.replace(/\/$/, '')
		.toLowerCase();
}

function safeTarget(directory, relativePath) {
	const target = path.resolve(directory, relativePath);
	if (!isWithin(directory, target) || target === directory || path.basename(target) === '.git') {
		throw new Error(`Unsafe public sync path: ${relativePath}`);
	}
	return target;
}

async function verifyPortable(directory) {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const target = path.join(directory, entry.name);
		if (entry.isSymbolicLink()) {
			throw new Error(`Symbolic links are not allowed in the public export: ${target}`);
		}
		if (entry.isDirectory()) {
			await verifyPortable(target);
		} else if (textExtensions.has(path.extname(entry.name))) {
			const content = await readFile(target, 'utf8');
			if (forbiddenPatterns.some(pattern => pattern.test(content))) {
				throw new Error(`Private absolute path found in exported file: ${target}`);
			}
		}
	}
}

async function copySource(destination) {
	for (const entry of sourceEntries) {
		const source = path.join(root, entry);
		await lstat(source);
		await cp(source, path.join(destination, entry), { recursive: true });
	}
}

async function listFiles(directory, base = directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const target = path.join(directory, entry.name);
		if (entry.isDirectory()) files.push(...await listFiles(target, base));
		else files.push(path.relative(base, target).replaceAll('\\', '/'));
	}
	return files;
}

async function classifyChanges(staging, destination, trackedFiles) {
	const stagedFiles = new Set(await listFiles(staging));
	const tracked = new Set(trackedFiles);
	const added = [...stagedFiles].filter(file => !tracked.has(file));
	const deleted = [...tracked].filter(file => !stagedFiles.has(file));
	const changed = [];

	for (const file of stagedFiles) {
		if (!tracked.has(file)) continue;
		const [next, current] = await Promise.all([
			readFile(path.join(staging, file)),
			readFile(safeTarget(destination, file))
		]);
		if (!next.equals(current)) changed.push(file);
	}

	return {
		added: added.sort(),
		changed: changed.sort(),
		deleted: deleted.sort()
	};
}

function printChanges(changes, dryRun) {
	const prefix = dryRun ? 'Public sync preview' : 'Public source synced';
	console.log(`${prefix}: ${changes.added.length} added, ${changes.changed.length} changed, ${changes.deleted.length} deleted`);
	for (const [label, files] of [['A', changes.added], ['M', changes.changed], ['D', changes.deleted]]) {
		for (const file of files) console.log(`${label} ${file}`);
	}
}

async function validateSyncDestination(destination) {
	if (isWithin(root, destination)) {
		throw new Error('The public export destination must be outside the private repository.');
	}
	const destinationStat = await lstat(destination).catch(() => null);
	if (!destinationStat) throw new Error(`Public sync destination does not exist: ${destination}`);
	if (destinationStat.isSymbolicLink()) throw new Error('Public sync destination cannot be a symbolic link.');
	const destinationReal = path.resolve(destination);

	let gitRoot;
	try {
		gitRoot = path.resolve(runGit(['rev-parse', '--show-toplevel'], destinationReal));
	} catch {
		throw new Error(`Public sync destination is not a Git working tree: ${destinationReal}`);
	}
	if (path.normalize(gitRoot).toLowerCase() !== path.normalize(destinationReal).toLowerCase()) {
		throw new Error('Public sync destination must be the root of its Git working tree.');
	}
	if (runGit(['status', '--porcelain=v1', '--untracked-files=all'], destinationReal)) {
		throw new Error('Public sync destination must have a clean working tree.');
	}

	let remote;
	try {
		remote = runGit(['remote', 'get-url', 'origin'], destinationReal);
	} catch {
		throw new Error('Public sync destination must define an origin remote.');
	}
	if (normalizeRemote(remote) !== expectedRemote) {
		throw new Error(`Public sync origin must point to gyosjs/gyosjs, received: ${remote}`);
	}
	return destinationReal;
}

async function exportToEmpty(destination, staging) {
	if (isWithin(root, destination)) {
		throw new Error('The public export destination must be outside the private repository.');
	}
	const existing = await lstat(destination).catch(() => null);
	if (existing?.isSymbolicLink()) throw new Error('Public export destination cannot be a symbolic link.');
	await mkdir(destination, { recursive: true });
	const destinationReal = path.resolve(destination);
	if ((await readdir(destinationReal)).length > 0) {
		throw new Error(`Export destination is not empty: ${destinationReal}`);
	}
	for (const entry of sourceEntries) {
		await cp(path.join(staging, entry), path.join(destinationReal, entry), { recursive: true });
	}
	console.log(`Public source exported to ${destinationReal}`);
}

async function syncToClone(destination, staging, dryRun) {
	const destinationReal = await validateSyncDestination(destination);
	const trackedOutput = runGit(['ls-files', '-z'], destinationReal);
	const trackedFiles = trackedOutput ? trackedOutput.split('\0').filter(Boolean) : [];
	const changes = await classifyChanges(staging, destinationReal, trackedFiles);
	if (dryRun) {
		printChanges(changes, true);
		return;
	}

	for (const file of trackedFiles) await rm(safeTarget(destinationReal, file), { force: true });
	for (const entry of sourceEntries) {
		await cp(path.join(staging, entry), path.join(destinationReal, entry), { recursive: true });
	}
	printChanges(changes, false);
}

const options = parseArguments(process.argv.slice(2));
const staging = await mkdtemp(path.join(tmpdir(), 'gyosjs-public-'));

try {
	await copySource(staging);
	await verifyPortable(staging);
	if (options.sync) await syncToClone(options.destination, staging, options.dryRun);
	else await exportToEmpty(options.destination, staging);
} finally {
	await rm(staging, { recursive: true, force: true });
}
