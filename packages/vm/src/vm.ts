import {
  QuickJSContext,
  QuickJSRuntime,
  QuickJSWASMModule,
  RELEASE_SYNC,
  newQuickJSWASMModuleFromVariant,
  RELEASE_ASYNC,
  DEBUG_ASYNC,
  DEBUG_SYNC,
  newQuickJSAsyncWASMModuleFromVariant,
} from 'quickjs-emscripten'
import { VMInitOpts } from './types'
import { Marshaller } from './marshal'

export class VM {
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

  async init({ debug, async, runtimeOpts, contextOpts }: VMInitOpts = {}) {
    let module: QuickJSWASMModule | undefined
    if (async) {
      const variant = debug ? DEBUG_ASYNC : RELEASE_ASYNC
      module = await newQuickJSAsyncWASMModuleFromVariant(variant)
    } else {
      const variant = debug ? DEBUG_SYNC : RELEASE_SYNC
      module = await newQuickJSWASMModuleFromVariant(variant)
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

  registerVMGlobal(key: string, val: any) {
    if (!this.vm) {
      throw new Error('VM not initialized')
    }
    this.marshaller.marshal(val).consume((v) => {
      this.vm!.setProp(this.vm!.global, key, v)
    })
  }

  private setReady(ready: boolean) {
    this.ready = ready
    if (ready) {
      this._readyPromise?.resolve?.()
    }
  }
}
