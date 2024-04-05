import { defineConfig } from 'tsup'

export default defineConfig({
  cjsInterop: true,
  minify: true,
  replaceNodeEnv: true,
  dts: true,
  clean: true,
  entry: ['src/index.ts'],
  outDir: 'dist',
  tsconfig: 'tsconfig.esm.json',
  format: ['esm'],
  external: ['react', 'react-render'],
})
