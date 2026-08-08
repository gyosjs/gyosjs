import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const websiteRoot = path.resolve(process.argv[2] || process.env.GYOS_DOCS_ROOT || '');

if (!process.argv[2] && !process.env.GYOS_DOCS_ROOT) {
	throw new Error('Usage: npm run docs:mirror:check -- <gyosjs-website-root>');
}

const coreEnglish = path.join(root, 'docs/en');
const webEnglish = path.join(websiteRoot, 'documents/en');
const webVietnamese = path.join(websiteRoot, 'documents/vi');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

async function markdownFiles(directory) {
	return (await readdir(directory, { withFileTypes: true }))
		.filter(entry => entry.isFile() && entry.name.endsWith('.md'))
		.map(entry => entry.name)
		.sort();
}

const [coreFiles, englishFiles, vietnameseFiles] = await Promise.all([
	markdownFiles(coreEnglish),
	markdownFiles(webEnglish),
	markdownFiles(webVietnamese)
]);
const missingEnglish = coreFiles.filter(file => !englishFiles.includes(file));
const missingVietnamese = coreFiles.filter(file => !vietnameseFiles.includes(file));

if (missingEnglish.length || missingVietnamese.length) {
	throw new Error([
		missingEnglish.length ? `Missing website EN: ${missingEnglish.join(', ')}` : '',
		missingVietnamese.length ? `Missing website VI: ${missingVietnamese.join(', ')}` : ''
	].filter(Boolean).join('\n'));
}

const stalePins = [];
for (const languageDirectory of [webEnglish, webVietnamese]) {
	for (const file of coreFiles) {
		const content = await readFile(path.join(languageDirectory, file), 'utf8');
		for (const match of content.matchAll(/gyosjs@(0\.\d+\.\d+)/gu)) {
			if (match[1] !== packageJson.version) stalePins.push(`${path.basename(languageDirectory)}/${file}: ${match[1]}`);
		}
	}
}

if (stalePins.length) throw new Error(`Stale pinned GyosJS versions:\n${stalePins.join('\n')}`);
console.log(`Documentation mirror inventory verified: ${coreFiles.length} files in EN and VI.`);
