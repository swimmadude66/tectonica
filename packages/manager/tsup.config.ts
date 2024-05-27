import { defineConfig } from 'tsup'
import { join } from 'node:path'

const DIST = join(__dirname, 'dist')
const ESM_OUT = join(DIST, 'esm')
const CJS_OUT = join(DIST, 'cjs')

export default defineConfig((options) => [
  {
    watch: options.watch,
    cjsInterop: true,
    minify: true,
    replaceNodeEnv: true,
    dts: false,
    clean: true,
    entry: ['src/index.ts'],
    outDir: ESM_OUT,
    tsconfig: 'tsconfig.esm.json',
    format: ['esm'],
    external: ['react', 'react-render'],
    outExtension: () => ({ js: '.js' }),
  },
  {
    watch: options.watch,
    cjsInterop: true,
    minify: true,
    replaceNodeEnv: true,
    dts: false,
    clean: true,
    entry: ['src/index.ts'],
    outDir: CJS_OUT,
    tsconfig: 'tsconfig.cjs.json',
    format: ['cjs'],
    external: ['react', 'react-render'],
  },
])
