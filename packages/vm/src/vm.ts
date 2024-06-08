import {
  type QuickJSContext,
  type QuickJSRuntime,
  type QuickJSWASMModule,
  RELEASE_SYNC,
  newQuickJSWASMModuleFromVariant,
  RELEASE_ASYNC,
  DEBUG_ASYNC,
  DEBUG_SYNC,
  newQuickJSAsyncWASMModuleFromVariant,
  type QuickJSVariant,
  newVariant,
  type QuickJSAsyncVariant,
  type QuickJSSyncVariant,
} from 'quickjs-emscripten'
import { ModuleOptions, VMInitOpts } from './types'
import { Marshaller } from './marshal'

export class VMManager {
  module?: QuickJSWASMModule
  runtime?: QuickJSRuntime
  vm?: QuickJSContext

  marshaller: Marshaller = new Marshaller()

  ready: boolean = false
  private _readyPromise?: {
    promise: Promise<true>
    resolve: () => void
  }

  constructor() {}

  async init({ debug, async, runtimeOpts, contextOpts, variant, variantOptions }: VMInitOpts = {}) {
    let module: QuickJSWASMModule | undefined
    const moduleVariant = this.getVariant({ async, debug, variant, variantOptions })
    if (async) {
      module = await newQuickJSAsyncWASMModuleFromVariant(moduleVariant as any as QuickJSAsyncVariant)
    } else {
      module = await newQuickJSWASMModuleFromVariant(moduleVariant as any as QuickJSSyncVariant)
    }
    const runtime = module.newRuntime({ ...runtimeOpts })
    const vm = runtime.newContext({ ...contextOpts })

    this.module = module
    this.runtime = runtime
    this.vm = vm

    this.marshaller.init(vm)

    // TODO: register stdlibs
    this.registerVMGlobal('console', console)

    this.setReady(true)
  }

  async teardown() {
    this.setReady(false)
    this.vm?.dispose()
    this.vm = undefined
    this.runtime?.dispose()
    this.runtime = undefined
    this.module = undefined
  }

  async awaitReady(): Promise<true> {
    if (this.ready) {
      return true
    }
    if (this._readyPromise?.promise) {
      return await this._readyPromise.promise
    }
    let readyResolve: (() => void) | undefined = undefined
    const readyPromise = new Promise<true>((resolve) => {
      readyResolve = () => {
        resolve(true)
        setTimeout(() => {
          this._readyPromise = undefined
        }, 0)
      }
    })
    this._readyPromise = {
      promise: readyPromise,
      resolve: readyResolve!,
    }
    return readyPromise
  }

  requireVM(): QuickJSContext {
    if (!this.vm?.alive) {
      throw new Error('No VM initialized')
    }
    return this.vm
  }

  registerVMGlobal(key: string, val: any) {
    const vm = this.requireVM()
    this.marshaller.marshal(val).consume((v) => {
      vm.setProp(vm.global, key, v)
    })
  }

  eval(code: string): any {
    const vm = this.requireVM()
    const resultHandle = vm.unwrapResult(vm.evalCode(code))
    const result = this.marshaller.unmarshal(resultHandle)
    resultHandle.dispose()
    return result
  }

  private setReady(ready: boolean) {
    this.ready = ready
    if (ready) {
      this._readyPromise?.resolve?.()
    }
  }

  private getVariant({ debug, async, variant, variantOptions }: ModuleOptions): QuickJSVariant {
    if (variant) {
      return variant
    }
    if (async) {
      variant = debug ? DEBUG_ASYNC : RELEASE_ASYNC
    } else {
      variant = debug ? DEBUG_SYNC : RELEASE_SYNC
    }
    if (variantOptions) {
      variant = newVariant(variant, variantOptions) as QuickJSVariant
    }
    return variant
  }
}
