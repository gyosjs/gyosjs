import { build } from 'vite';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Comparative builds go into each app's ignored .local directory. They never
// change imports, dependency pins, lockfiles, CSP policies or shipped dist/.
const core = resolve(fileURLToPath(new URL('..', import.meta.url)));
const projects = process.argv.slice(2);
if (!projects.length) throw Error('Usage: node scripts/measure-app-bundles.mjs <app-root> ...');
const results = [];
for (const project of projects) {
  const root = resolve(project);
  const pkg = JSON.parse(readFileSync(join(root, 'node_modules/gyosjs/package.json'), 'utf8'));
  for (const entry of ['csp', 'standard']) {
    for (const imports of ['default', 'selected']) {
      const modules = [];
      const result = await build({ configFile: false, root, logLevel: 'warn',
        build: { outDir: `.local/bundle-${entry}-${imports}`, sourcemap: false },
        plugins: [{ name: 'measurement-import-variant', enforce: 'pre',
          transform(source, id) {
            const normalized = id.replaceAll('\\', '/');
            if (normalized.includes('/node_modules/') || !/\/src\/.*\.js$/.test(normalized)) return;
            const match = source.match(/import (?:Gyos|\* as Gyos) from ["']gyosjs\/csp["'];/);
            if (!match) return;
            const specifier = entry === 'csp' ? 'gyosjs/csp' : 'gyosjs';
            if (imports === 'default') return source.replace(match[0], `import Gyos from '${specifier}';`);
            // version is an object property, not a named public export.
            source = source.replaceAll('Gyos.version', JSON.stringify(pkg.version));
            const names = [...new Set([...source.matchAll(/\bGyos\.(\w+)/g)].map(m => m[1]))].sort();
            return source.replace(match[0], `import { ${names.map(n => `${n} as __gyos_${n}`).join(', ')} } from '${specifier}';\nconst Gyos = { ${names.map(n => `${n}: __gyos_${n}`).join(', ')} };`);
          },
          generateBundle(_, bundle) {
            for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk') {
              for (const [id, module] of Object.entries(chunk.modules)) modules.push({ id: relative(root, id).replaceAll('\\', '/'), renderedBytes: module.renderedLength });
            }
          }
        }] });
      const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => r.output);
      const assets = outputs.map(asset => {
        const data = Buffer.from(asset.type === 'chunk' ? asset.code : asset.source);
        return { file: asset.fileName, raw: data.length, gzip: gzipSync(data).length, brotli: brotliCompressSync(data).length };
      });
      results.push({ app: relative(resolve(core, '..'), root).replaceAll('\\', '/'), version: pkg.version, entry, imports,
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), assets, modules });
      console.log(`${root}: ${entry}/${imports}: ${assets.filter(a=>a.file.endsWith('.js')).map(a=>`${a.file} ${a.raw}/${a.gzip} bytes raw/gzip`).join(', ')}`);
    }
  }
}
const output = resolve(core, '.release-tmp/app-bundles.json');
mkdirSync(resolve(core, '.release-tmp'), { recursive: true });
writeFileSync(output, JSON.stringify({ date: new Date().toISOString(), node: process.version,
  vite: JSON.parse(readFileSync(join(core, 'node_modules/vite/package.json'))).version,
  note: 'Controlled Vite builds using each installed pinned runtime; standard and selected-import builds are experiments, not deployments. Per-module rendered sizes are before final minification and are not additive gzip attribution. Worker assets listed separately. No download/parse timing claim.', results }, null, 2) + '\n');
console.log(output);
