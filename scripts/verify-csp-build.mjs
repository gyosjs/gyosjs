import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cspFiles = [
	'gyos.csp.esm.js',
	'gyos.csp.js',
	'gyos.csp.min.js',
	'gyos.csp.auto.esm.js',
	'gyos.csp.auto.js',
	'gyos.csp.auto.min.js'
];

const sources = await Promise.all(cspFiles.map(file => readFile(path.join(root, 'dist', file), 'utf8')));
for (let index = 0; index < sources.length; index++) {
	const source = sources[index];
	const file = cspFiles[index];
	if (/\bnew\s+Function\b/u.test(source) || /\beval\s*\(/u.test(source)) {
		throw new Error(`${file} contains dynamic code evaluation.`);
	}
}

const cspCore = sources[0];
const cspAuto = sources[3];
if (!cspCore.includes('Unsupported syntax') || !cspAuto.includes('Unsupported syntax')) {
	throw new Error('CSP interpreter is missing from a CSP distribution entry.');
}

const standard = await readFile(path.join(root, 'dist', 'gyos.esm.js'), 'utf8');
if (standard.includes('Unsupported syntax') || standard.includes('Invalid expression body')) {
	throw new Error('The standard build unexpectedly contains the CSP interpreter.');
}

const css = await readFile(path.join(root, 'dist', 'gyos.css'), 'utf8');
for (const selector of ['[g-cloak]', '.gyos-t-opacity-0', '.gyos-target-spinner']) {
	if (!css.includes(selector)) throw new Error(`gyos.css is missing ${selector}.`);
}

console.log('CSP distribution check passed: no dynamic evaluation and runtime CSS is present.');
