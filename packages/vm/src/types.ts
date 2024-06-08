import type { ContextOptions, CustomizeVariantOptions, QuickJSVariant, RuntimeOptions } from 'quickjs-emscripten'

export interface ModuleOptions {
  debug?: boolean
  async?: boolean
  variant?: QuickJSVariant
  variantOptions?: CustomizeVariantOptions
}

export interface VMInitOpts extends ModuleOptions {
  runtimeOpts?: RuntimeOptions
  contextOpts?: ContextOptions
}
