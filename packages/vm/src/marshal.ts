import { Scope, type QuickJSContext, type QuickJSHandle } from 'quickjs-emscripten'

const PRIMITIVE_TYPES = ['string', 'boolean', 'number']

function generateRandomId() {
  const randomNum = Math.pow(10, 12) * Math.random()
  const timedNum = performance.now()
  return btoa(`${Math.floor(randomNum + timedNum)}`)
}

function generateMagicToken({ prefix, suffix }: { prefix?: string; suffix?: string } = {}) {
  return `${prefix ?? ''}_${generateRandomId()}_${suffix ?? ''}`
}

export class Marshaller {
  private _handleCache = new WeakMap<any, QuickJSHandle>()
  valueCache = new Map<string, any>()

  constructor(private vm?: QuickJSContext) {
    if (vm) {
      // init
      this.init(vm)
    }
  }

  init(vm: QuickJSContext) {
    const isolatedVM = vm.runtime.newContext()
    this.vm = isolatedVM
    this._initHelpers(isolatedVM)
  }

  teardown() {
    this.vm?.dispose()
  }

  requireVM(): QuickJSContext {
    if (!this.vm?.alive) {
      throw new Error('VM not initialized')
    }
    return this.vm
  }

  marshal(value: any): QuickJSHandle {
    const vm = this.requireVM()
    if (value === null) {
      return vm.null
    }
    const valueType = typeof value
    if (valueType === 'undefined') {
      return vm.undefined
    }
    if (valueType === 'string') {
      return vm.newString(value)
    }
    if (valueType === 'number') {
      return vm.newNumber(value)
    }
    if (valueType === 'boolean') {
      return value ? vm.true : vm.false
    }
    if (valueType === 'bigint') {
      return vm.newBigInt(value)
    }
    const cachedHandle = this._handleCache.get(value)
    if (cachedHandle?.alive) {
      return cachedHandle
    }
    if (valueType === 'symbol') {
      const symbolHandle = vm.newSymbolFor((value as symbol).description ?? value)
      return symbolHandle
    }

    const serializedValue = this.serializeJSValue(value)
    const scope = new Scope()
    const marshalerHandle = scope.manage(vm.getProp(vm.global, '__marshalValue'))
    const serialHandle = scope.manage(vm.newString(serializedValue.serialized))
    const tokenHandle = scope.manage(vm.newString(serializedValue.token))
    const handle = vm.unwrapResult(vm.callFunction(marshalerHandle, vm.global, serialHandle, tokenHandle))
    scope.dispose()
    this._handleCache.set(value, handle)
    return handle
  }

  unmarshal(handle: QuickJSHandle): any {
    const vm = this.requireVM()
    const handleType = vm.typeof(handle)
    if (handleType === 'undefined') {
      return undefined
    }
    if (handleType === 'string') {
      return vm.getString(handle)
    }
    if (handleType === 'number') {
      return vm.getNumber(handle)
    }
    // boolean, bigint, and others need more care
    const serialObjHandle = vm.getProp(vm.global, '__unmarshalValue').consume((serializer) => vm.unwrapResult(vm.callFunction(serializer, vm.global, handle)))
    const serial = vm.getProp(serialObjHandle, 'serialized').consume((serialHandle) => vm.getString(serialHandle))
    const token = vm.getProp(serialObjHandle, 'token').consume((tokenHandle) => vm.getString(tokenHandle))
    serialObjHandle.dispose()

    return this.deserializeVMValue(serial, token, true)
  }

  serializeJSValue(value: any, magicToken?: string): { serialized: string; token: string } {
    const tkn = magicToken ?? generateMagicToken()
    const valueType = typeof value
    if (PRIMITIVE_TYPES.includes(valueType)) {
      return { serialized: JSON.stringify(value), token: tkn }
    }
    if (valueType === 'undefined') {
      return { serialized: `{"type": "undefined", "${tkn}": true}`, token: tkn }
    }
    if (valueType === 'bigint') {
      return { serialized: `{"type": "bigint", "${tkn}": "${BigInt(value).toString()}"}`, token: tkn }
    }
    if (valueType === 'symbol') {
      return { serialized: `{"type": "symbol", "${tkn}": "${Symbol.keyFor(value) ?? value.description}"}`, token: tkn }
    }
    if (valueType === 'object') {
      if (value === null) {
        return { serialized: `{"type": "null", "${tkn}": true}`, token: tkn }
      }
      if (Array.isArray(value)) {
        const mappedChildren = value.map((child) => this.serializeJSValue(child, tkn).serialized)
        return { serialized: `[${mappedChildren.join(', ')}]`, token: tkn }
      }
      if (value instanceof Promise || 'then' in value) {
        const valueId = generateRandomId()
        this.valueCache.set(valueId, value)
        return { serialized: `{"type": "promise", "${tkn}": "${valueId}"}`, token: tkn }
      }
      // object
      const entries: string[] = []
      for (const prop in value) {
        entries.push(`"${prop}": ${this.serializeJSValue(value[prop], tkn).serialized}`)
      }
      return { serialized: `{${entries.join(', ')}}`, token: tkn }
    }
    const valueId = generateRandomId()
    this.valueCache.set(valueId, value)
    if (valueType === 'function') {
      // TODO add "this" scoping support
      return { serialized: `{"type": "function", "${tkn}": "${valueId}"}`, token: tkn }
    }
    return { serialized: `{"type": "cache", "${tkn}": "${valueId}"}`, token: tkn }
  }

  deserializeVMValue(serialized: string, token: string, json: boolean = true): any {
    const val = json ? JSON.parse(serialized) : serialized
    const valType = typeof val
    if (valType === 'object') {
      if (Array.isArray(val)) {
        const parsedVal: any[] = []
        // handle array
        for (const child of val) {
          parsedVal.push(this.deserializeVMValue(child, token, false))
        }
        return parsedVal
      }
      if (token in val) {
        // handle specials
        switch (val['type']) {
          case 'undefined': {
            return undefined
          }
          case 'null': {
            return null
          }
          case 'bigint': {
            return BigInt(val[token])
          }
          case 'symbol': {
            return Symbol.for(val[token])
          }
          case 'promise': {
            return this._getVMCachedPromise(val[token])
          }
          case 'function': {
            return this._createVMProxy(() => void 0, val[token])
          }
          case 'cache':
          default: {
            return this._createVMProxy({}, val[token])
          }
        }
      }
      // handle regular object
      const parsedVal = {}
      for (const key in val) {
        parsedVal[key] = this.deserializeVMValue(val[key], token, false)
      }
      return parsedVal
    }
    return val
  }

  private _createVMProxy(base: any, cacheId: string) {
    return new Proxy(base, {
      get: (_target, key) => {
        return this._getVMCacheItemKey(cacheId, key)
      },
      set: (_target, key, newValue) => {
        return this._setVMCacheItemKey(cacheId, key, newValue)
      },
      apply: (_target, thisArg, argArray) => {
        return this._callVMCacheItem(cacheId, argArray, thisArg)
      },
    })
  }

  private _getVMCachedPromise(cacheId: string) {
    const vm = this.requireVM()
    const scope = new Scope()
    const promiseGetter = scope.manage(vm.getProp(vm.global, '__vmCachedPromiseGetter'))
    const cacheIdHandle = scope.manage(vm.newString(cacheId))
    const cachedPromiseHandle = scope.manage(vm.unwrapResult(vm.callFunction(promiseGetter, vm.global, cacheIdHandle)))
    const nativePromise = vm.resolvePromise(cachedPromiseHandle)
    scope.dispose()
    vm.runtime.executePendingJobs()
    return nativePromise.then((result) => {
      const resultHandle = vm.unwrapResult(result)
      const jsVal = this.unmarshal(resultHandle)
      resultHandle.dispose()
      return jsVal
    })
  }

  private _getVMCacheItemKey(cacheId: string, key: string | symbol): any {
    const vm = this.requireVM()
    const scope = new Scope()
    const getter = scope.manage(vm.getProp(vm.global, '__vmCacheGetter'))
    const cacheIdHandle = scope.manage(vm.newString(cacheId))
    const keyHandle = scope.manage(this.marshal(key))
    const returnValHandle = scope.manage(vm.unwrapResult(vm.callFunction(getter, vm.global, cacheIdHandle, keyHandle)))
    const jsVal = this.unmarshal(returnValHandle)
    scope.dispose()
    return jsVal
  }

  private _setVMCacheItemKey(cacheId: string, key: string | symbol, newVal: any): any {
    const vm = this.requireVM()
    const scope = new Scope()
    const setter = scope.manage(vm.getProp(vm.global, '__vmCacheSetter'))
    const cacheIdHandle = scope.manage(vm.newString(cacheId))
    const keyHandle = scope.manage(this.marshal(key))
    const newValHandle = scope.manage(this.marshal(newVal))
    const returnValHandle = scope.manage(vm.unwrapResult(vm.callFunction(setter, vm.global, cacheIdHandle, keyHandle, newValHandle)))
    const jsVal = this.unmarshal(returnValHandle)
    scope.dispose()
    return jsVal
  }

  private _callVMCacheItem(cacheId: string, args: any[], _this?: any): any {
    const vm = this.requireVM()
    const scope = new Scope()
    const caller = scope.manage(vm.getProp(vm.global, '__vmCacheCaller'))
    const cacheIdHandle = scope.manage(vm.newString(cacheId))
    const argArrayHandle = scope.manage(this.marshal(args))
    const returnValHandle = scope.manage(vm.unwrapResult(vm.callFunction(caller, vm.global, cacheIdHandle, argArrayHandle)))
    const jsVal = this.unmarshal(returnValHandle)
    scope.dispose()
    return jsVal
  }

  private _initHelpers(vm: QuickJSContext) {
    vm.unwrapResult(vm.evalCode(`new Map()`)).consume((cache) => vm.setProp(vm.global, '__valueCache', cache))
    vm.newFunction('__generateRandomId', () => vm.newString(generateRandomId())).consume((generator) => vm.setProp(vm.global, '__generateRandomId', generator))
    vm.unwrapResult(
      vm.evalCode(`(cacheId) => {
      const cachedPromise = __valueCache.get(cacheId)
      if (!cachedPromise || !('then' in cachedPromise)) {
        throw new Error('unknown promise')
      }
      return cachedPromise
    }`)
    ).consume((promiseGetter) => vm.setProp(vm.global, '__vmCachedPromiseGetter', promiseGetter))
    vm.unwrapResult(vm.evalCode(`(cacheId, key) => __valueCache.get(cacheId)?.[key]`)).consume((getter) => vm.setProp(vm.global, '__vmCacheGetter', getter))
    vm.unwrapResult(
      vm.evalCode(`(cacheId, key, val) => {
        const cachedItem = __valueCache.get(cacheId)
        if (!cachedItem) {
          return false
        }
        cachedItem[key] = val
        return true
      }
    `)
    ).consume((setter) => vm.setProp(vm.global, '__vmCacheSetter', setter))
    vm.unwrapResult(
      vm.evalCode(`
      (cacheId, argsArray) => {
        const cachedFunc = __valueCache.get(cacheId)
        if (typeof cachedFunc === 'function') {
          return cachedFunc(...argsArray)
        }
        throw new Error('Not a function')
      }
    `)
    ).consume((caller) => vm.setProp(vm.global, '__vmCacheCaller', caller))
    vm.newFunction('__getCachedPromise', (cacheIdHandle) => {
      const cacheId = cacheIdHandle.consume((idHandle) => vm.getString(idHandle))
      const cachedPromise = this.valueCache.get(cacheId)
      if (!cachedPromise) {
        throw new Error('No such promise')
      }
      const vmPromise = vm.newPromise()
      cachedPromise.then(
        (results) => {
          this.marshal(results).consume((r) => {
            vmPromise.resolve(r)
          })
          return results
        },
        (reason) => {
          this.marshal(reason).consume((r) => {
            vmPromise.reject(r)
          })
          throw reason
        }
      )
      vmPromise.settled.then(vm.runtime.executePendingJobs)
      return vmPromise.handle
    }).consume((promiseGetter) => vm.setProp(vm.global, '__getCachedPromise', promiseGetter))
    vm.newFunction('__getCacheItemGetter', (cacheIdHandle, keyHandle) => {
      const cacheId = cacheIdHandle.consume((idHandle) => vm.getString(idHandle))
      const key = keyHandle.consume((kh) => (vm.typeof(kh) === 'symbol' ? vm.getSymbol(kh) : vm.getString(kh)))
      const cachedItem = this.valueCache.get(cacheId)
      return this.marshal(cachedItem[key])
    }).consume((getter) => vm.setProp(vm.global, '__getCacheItemKey', getter))
    vm.newFunction('__setCacheItemGetter', (cacheIdHandle, keyHandle, valHandle) => {
      const cacheId = cacheIdHandle.consume((idHandle) => vm.getString(idHandle))
      const key = keyHandle.consume((kh) => (vm.typeof(kh) === 'symbol' ? vm.getSymbol(kh) : vm.getString(kh)))
      const val = valHandle.consume((vh) => this.unmarshal(vh))
      const cachedItem = this.valueCache.get(cacheId)
      cachedItem[key] = val
      return vm.true
    }).consume((setter) => vm.setProp(vm.global, '__setCacheItemKey', setter))
    vm.newFunction('__callCacheItemFunction', (cacheIdHandle, argsArrayHandle, thisHandle) => {
      const cacheId = cacheIdHandle.consume((idHandle) => vm.getString(idHandle))
      const cachedItem = this.valueCache.get(cacheId)
      const args = argsArrayHandle.consume((ah) => this.unmarshal(ah))
      if (typeof cachedItem === 'function') {
        return this.marshal(cachedItem(...args))
      }
      return vm.undefined
    }).consume((caller) => vm.setProp(vm.global, '__callCacheItemFunction', caller))
    vm.unwrapResult(
      vm.evalCode(`(base, cacheId) => {
        return new Proxy(base, {
          get: (_target, key) => {
            return __getCacheItemKey(cacheId, key)
          },
          set: (_target, key, newValue) => {
            return __setCacheItemKey(cacheId, key, newValue)
          },
          apply: (_target, thisArg, argArray) => {
            return __callCacheItemFunction(cacheId, argArray, thisArg)
          }
        })
    }`)
    ).consume((proxyCreator) => vm.setProp(vm.global, '__createVMProxy', proxyCreator))
    vm.unwrapResult(
      vm.evalCode(`
          (valueString, token, json = true) => {
            const val = json ? JSON.parse(valueString) : valueString
            const valType = typeof val
            if (valType === 'object') {
              if (Array.isArray(val)) {
                const parsedVal = []
                // handle array
                for (const child of val) {
                  parsedVal.push(__marshalValue(child, token, false))
                }
                return parsedVal
              }
              if (token in val) {
                // handle specials
                switch(val['type']) {
                  case 'undefined': {
                    return undefined
                  }
                  case 'null': {
                    return null
                  }
                  case 'bigint': {
                    return BigInt(val[token])
                  }
                  case 'symbol': {
                    return Symbol.for(val[token])
                  }
                  case 'promise': {
                    return __getCachedPromise(val[token])
                  }
                  case 'function': {
                    return __createVMProxy(() => void 0, val[token])
                  }
                  case 'cache':
                  default: {
                    return __createVMProxy({}, val[token])
                  }
                }
              }
              // handle regular object
              const parsedVal = {}
              for (const key in val) {
                parsedVal[key] = __marshalValue(val[key], token, false)
              }
              return parsedVal
            }
            return val
          }
        `)
    ).consume((marshal) => vm.setProp(vm.global, '__marshalValue', marshal))
    vm.unwrapResult(
      vm.evalCode(`
          (value, tkn = __generateRandomId() ) => {
            const valueType = typeof value
            if (['string', 'number', 'boolean'].includes(valueType)) {
              return { serialized: JSON.stringify(value), token: tkn }
            }
            if (valueType === 'undefined') {
              return { serialized: '{"type": "undefined", "'+tkn+'": true}', token: tkn }
            }
            if (valueType === 'bigint') {
              return { serialized: '{"type": "bigint", "'+tkn+'": "'+BigInt(value).toString()+'"}', token: tkn }
            }
            if (valueType === 'symbol') {
              return { serialized: '{"type": "symbol", "'+tkn+'": "'+(Symbol.keyFor(value) ?? value.description)+'"}', token: tkn }
            }
            if (valueType === 'object') {
              if (value === null) {
                return { serialized: '{"type": "null", "'+tkn+'": true}', token: tkn }
              }
              if (Array.isArray(value)) {
                const mappedChildren = value.map((child) => __unmarshalValue(child, tkn).serialized)
                return { serialized: '['+mappedChildren.join(', ')+']', token: tkn }
              }
              if (value instanceof Promise || 'then' in value) {
                const valueId = __generateRandomId()
                __valueCache.set(valueId, value)
                return { serialized: '{"type": "promise", "'+tkn+'": "'+valueId+'"}', token: tkn}
              }
              // regular object
              const entries = []
              for (let prop in value) {
                entries.push('"'+prop+'": '+__unmarshalValue(value[prop], tkn).serialized)
              }
              return { serialized: '{'+entries.join(', ')+'}', token: tkn }
            }
            const valueId = __generateRandomId()
            __valueCache.set(valueId, value)
            if (valueType === 'function') {
              // TODO add "this" scoping support
              return { serialized: '{"type": "function", "'+tkn+'": "'+valueId+'"}', token: tkn }
            }
            return { serialized: '{"type": "cache", "'+tkn+'": "'+valueId+'"}', token: tkn }
          }
        `)
    ).consume((unmarshal) => vm.setProp(vm.global, '__unmarshalValue', unmarshal))
  }
}
