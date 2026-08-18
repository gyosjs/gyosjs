import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedVersion = process.argv[2];
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const source = await readFile(path.join(root, 'src/public-api.ts'), 'utf8');
const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
const version = packageJson.version;

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

assert(/^0\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version), `Invalid 0.x release version: ${version}`);
assert(!expectedVersion || expectedVersion === version, `Expected ${expectedVersion}, package.json contains ${version}`);

const runtimeVersion = source.match(/\bversion:\s*['"]([^'"]+)['"]/u)?.[1];
assert(runtimeVersion === version, `src/public-api.ts exposes ${runtimeVersion ?? 'no version'}, expected ${version}`);
assert(
	new RegExp(`^## \\[${version.replaceAll('.', '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'mu').test(changelog),
	`CHANGELOG.md has no dated ${version} release section`
);
assert(
	changelog.includes(`[Unreleased]: https://github.com/gyosjs/gyosjs/compare/v${version}...HEAD`),
	`The Unreleased comparison does not start at v${version}`
);
assert(changelog.includes(`[${version}]: `), `CHANGELOG.md has no comparison or release link for ${version}`);
assert(packageJson.repository?.url?.includes('github.com/gyosjs/gyosjs'), 'Unexpected package repository URL');

console.log(`Release metadata verified for gyosjs@${version}.`);
