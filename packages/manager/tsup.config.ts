import { defineConfig } from 'tsup'

module.exports = defineConfig({
  bundle: true,
  cjsInterop: true,
  minify: true,
  replaceNodeEnv: true,
  dts: true,
  sourcemap: false,
  clean: true,
  entry: ['src/index.ts'],
  outDir: 'dist',
  tsconfig: 'tsconfig.json',
  format: ['esm', 'cjs'],
  external: ['react', 'react-dom'],
})
