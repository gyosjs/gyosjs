import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const docsRoot = path.join(root, 'docs', 'en');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const cdnPackagePattern = /(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/gyosjs(?:@([^/"'\s<]+))?/g;
const executablePattern = /^\s*(?:<!DOCTYPE\s|<(?:html|head|body|script|style|div|section|form|button|input|select|textarea|template|aside|nav|main|article|span|p|ul|ol|li|a|img)(?:\s|>|\/)|(?:Gyos\.|const\s|let\s|var\s|function\s|class\s))/i;
const fencePattern = /^\s*```(.*)$/;

const files = (await readdir(docsRoot))
	.filter(file => file.endsWith('.md'))
	.sort();
const errors = [];

for (const file of files) {
	const lines = (await readFile(path.join(docsRoot, file), 'utf8')).split(/\r?\n/);
	let fence = null;

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		const match = line.match(fencePattern);

		if (match) {
			if (fence === null) {
				const language = match[1].trim();
				if (!language) errors.push(`${file}:${index + 1} code fence is missing a language`);
				fence = index + 1;
			} else {
				fence = null;
			}
			continue;
		}

		if (fence === null && /<\/?gcode>/i.test(line)) {
			errors.push(`${file}:${index + 1} web-only <gcode> is not allowed`);
		}

		if (fence === null && executablePattern.test(line)) {
			errors.push(`${file}:${index + 1} executable HTML/JavaScript must be fenced`);
		}

		if (/github\.com\/hohphu8\/gyosjs/i.test(line)) {
			errors.push(`${file}:${index + 1} repository URL must use github.com/gyosjs/gyosjs`);
		}


		for (const match of line.matchAll(cdnPackagePattern)) {
			if (match[1] !== packageJson.version) {
				errors.push(`${file}:${index + 1} CDN URL must pin gyosjs@${packageJson.version}`);
			}
		}
	}

	if (fence !== null) errors.push(`${file}:${fence} code fence is not closed`);
}

if (errors.length) {
	console.error(`Public documentation check failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

console.log(`Public documentation check passed: ${files.length} Markdown files.`);
