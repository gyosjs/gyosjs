import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exporter = path.join(projectRoot, 'scripts', 'export-public-source.mjs');
const workspaces: string[] = [];

function git(args: string[], cwd: string): string {
	return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function runExporter(args: string[]) {
	return spawnSync(process.execPath, [exporter, ...args], {
		cwd: projectRoot,
		encoding: 'utf8'
	});
}

async function createPublicClone(remote = 'git@github.com:gyosjs/gyosjs.git') {
	const directory = await mkdtemp(path.join(tmpdir(), 'gyosjs-sync-test-'));
	workspaces.push(directory);
	git(['init'], directory);
	git(['config', 'user.name', 'GyosJS Test'], directory);
	git(['config', 'user.email', 'test@gyosjs.dev'], directory);
	git(['remote', 'add', 'origin', remote], directory);
	return directory;
}

function commitAll(directory: string, message: string) {
	git(['add', '--all'], directory);
	git(['commit', '-m', message], directory);
}

afterEach(async () => {
	await Promise.all(workspaces.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe('public source export and sync', () => {
	it('syncs a canonical clone, mirrors tracked changes, and preserves ignored caches', async () => {
		const destination = await createPublicClone();
		let result = runExporter(['--sync', destination]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain('Public source synced:');
		expect(await readFile(path.join(destination, 'package.json'), 'utf8')).toContain('github.com/gyosjs/gyosjs');
		commitAll(destination, 'initial export');

		await mkdir(path.join(destination, 'node_modules', '.cache'), { recursive: true });
		await writeFile(path.join(destination, 'node_modules', '.cache', 'keep.txt'), 'cache');
		await rm(path.join(destination, 'README.md'));
		await writeFile(path.join(destination, 'package.json'), '{"stale":true}\n');
		await writeFile(path.join(destination, 'stale.txt'), 'remove me');
		commitAll(destination, 'make public clone stale');

		result = runExporter(['--sync', '--dry-run', destination]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain('A README.md');
		expect(result.stdout).toContain('M package.json');
		expect(result.stdout).toContain('D stale.txt');
		expect(git(['status', '--porcelain'], destination)).toBe('');

		result = runExporter(['--sync', destination]);
		expect(result.status, result.stderr).toBe(0);
		expect(await readFile(path.join(destination, 'node_modules', '.cache', 'keep.txt'), 'utf8')).toBe('cache');
		expect(await readFile(path.join(destination, 'README.md'), 'utf8')).toContain('# GyosJS');
		await expect(readFile(path.join(destination, 'stale.txt'))).rejects.toThrow();
		commitAll(destination, 'resync source');

		result = runExporter(['--sync', '--dry-run', destination]);
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain('0 added, 0 changed, 0 deleted');
	}, 30_000);

	it('refuses dirty clones and non-canonical remotes before changing files', async () => {
		const dirty = await createPublicClone();
		await writeFile(path.join(dirty, 'local-note.txt'), 'uncommitted');
		let result = runExporter(['--sync', dirty]);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('clean working tree');
		expect(await readFile(path.join(dirty, 'local-note.txt'), 'utf8')).toBe('uncommitted');

		const wrongRemote = await createPublicClone('https://github.com/example/gyosjs.git');
		result = runExporter(['--sync', wrongRemote]);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('origin must point to gyosjs/gyosjs');
	}, 30_000);

	it('keeps empty-directory export compatible and rejects unsafe destinations', async () => {
		const destination = await mkdtemp(path.join(tmpdir(), 'gyosjs-export-test-'));
		workspaces.push(destination);
		let result = runExporter([destination]);
		expect(result.status, result.stderr).toBe(0);
		expect(await readFile(path.join(destination, 'README.md'), 'utf8')).toContain('# GyosJS');

		result = runExporter([destination]);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('not empty');

		result = runExporter(['--sync', path.join(projectRoot, '.release-tmp', 'unsafe-sync')]);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain('outside the private repository');
	}, 30_000);
});
