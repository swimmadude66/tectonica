import type { ContextOptions, RuntimeOptions } from 'quickjs-emscripten'

export interface VMInitOpts {
  debug?: boolean
  async?: boolean
  runtimeOpts?: RuntimeOptions
  contextOpts?: ContextOptions
}
