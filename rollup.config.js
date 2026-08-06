import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { minify } from 'terser';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const currentYear = new Date().getFullYear();

const banner = `/*!
 * GyosJS v${pkg.version}
 * (c) ${currentYear}
 * @license MIT
 */`;

const tsConfig = (emitDeclarations, sourceMap = true) => {
  const options = {
    declaration: emitDeclarations,
    declarationMap: emitDeclarations,
    rootDir: 'src',
    sourceMap
  };

  if (emitDeclarations) {
    options.declarationDir = 'dist';
  }

  return typescript(options);
};

const terserCompress = {
  pure_getters: false, // MUST be false - reactive getters have side effects (dependency tracking)
  unsafe: true,
  unsafe_comps: true,
  passes: 3,
  drop_debugger: true,
  drop_console: true,
  toplevel: true
};

const terser = options => ({
  name: 'gyos-terser',
  async renderChunk(code) {
    const result = await minify(code, options);
    if (!result.code) return null;
    return { code: result.code, map: null };
  }
});

export default [
  // Core ESM build (tree-shakeable, emits types)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/gyos.esm.js',
      format: 'esm',
      banner,
      sourcemap: true
    },
    treeshake: { moduleSideEffects: false },
    plugins: [resolve(), tsConfig(true)]
  },
  // Core UMD build (no side effects)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/gyos.js',
      format: 'umd',
      name: 'Gyos',
      banner,
      sourcemap: true,
      exports: 'named'
    },
    treeshake: { moduleSideEffects: false },
    plugins: [resolve(), tsConfig(false)]
  },
  // Minified core UMD build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/gyos.min.js',
      format: 'umd',
      name: 'Gyos',
      banner,
      sourcemap: false,
      exports: 'named'
    },
    treeshake: { moduleSideEffects: false },
    plugins: [
      resolve(),
      tsConfig(false, false),
      terser({
        compress: terserCompress,
        mangle: { toplevel: true },
        format: { comments: /^!/ }
      })
    ]
  },
  // Auto-init ESM build (browser-ready side effects)
  {
    input: 'src/auto-init.ts',
    output: {
      file: 'dist/gyos.auto.esm.js',
      format: 'esm',
      banner,
      sourcemap: true
    },
    treeshake: { moduleSideEffects: false },
    plugins: [resolve(), tsConfig(false)]
  },
  // Auto-init UMD build
  {
    input: 'src/auto-init.ts',
    output: {
      file: 'dist/gyos.auto.js',
      format: 'umd',
      name: 'Gyos',
      banner,
      sourcemap: true,
      exports: 'named'
    },
    treeshake: { moduleSideEffects: false },
    plugins: [resolve(), tsConfig(false)]
  },
  // Minified auto-init UMD build (CDN-friendly)
  {
    input: 'src/auto-init.ts',
    output: {
      file: 'dist/gyos.auto.min.js',
      format: 'umd',
      name: 'Gyos',
      banner,
      sourcemap: false,
      exports: 'named'
    },
    treeshake: { moduleSideEffects: false },
    plugins: [
      resolve(),
      tsConfig(false, false),
      terser({
        compress: terserCompress,
        mangle: { toplevel: true },
        format: { comments: /^!/ }
      })
    ]
  }
];
