import type { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten'

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
    this.vm = vm
    this._initHelpers(vm)
  }

  getVM(): QuickJSContext {
    if (!this.vm?.alive) {
      throw new Error('VM not initialized')
    }
    return this.vm
  }

  marshal(value: any): QuickJSHandle {
    const vm = this.getVM()
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
      const symbolHandle = vm.newSymbolFor(value)
      this._handleCache.set(value, symbolHandle)
      return symbolHandle
    }

    const serializedValue = this.serializeJSValue(value)
    const serialHandle = vm.newString(serializedValue.serialized)
    const tokenHandle = vm.newString(serializedValue.token)
    const handle = vm.unwrapResult(vm.callFunction(vm.getProp(vm.global, '__marshalValue'), vm.global, serialHandle, tokenHandle))
    serialHandle.dispose()
    tokenHandle.dispose()
    this._handleCache.set(value, handle)
    return handle
  }

  unmarshal(handle: QuickJSHandle): any {
    const vm = this.getVM()
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
    if (handleType === 'symbol') {
      return vm.getSymbol(handle)
    }
    // boolean, bigint, and others need more care
    const serializer = vm.getProp(vm.global, '__unmarshalValue')
    const serialObjHandle = vm.unwrapResult(vm.callFunction(serializer, vm.global, handle))
    const serialHandle = vm.getProp(serialObjHandle, 'serialized')
    const tokenHandle = vm.getProp(serialObjHandle, 'token')
    const serial = vm.getString(serialHandle)
    const token = vm.getString(tokenHandle)
    serialHandle.dispose()
    tokenHandle.dispose()
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
    const vm = this.getVM()
    const promiseGetter = vm.getProp(vm.global, '__vmCachedPromiseGetter')
    const cacheIdHandle = vm.newString(cacheId)
    const cachedPromiseHandle = vm.unwrapResult(vm.callFunction(promiseGetter, vm.global, cacheIdHandle))
    const nativePromise = vm.resolvePromise(cachedPromiseHandle)
    promiseGetter.dispose()
    cacheIdHandle.dispose()
    cachedPromiseHandle.dispose()
    vm.runtime.executePendingJobs()
    return nativePromise.then((result) => {
      const resultHandle = vm.unwrapResult(result)
      const jsVal = this.unmarshal(resultHandle)
      resultHandle.dispose()
      return jsVal
    })
  }

  private _getVMCacheItemKey(cacheId: string, key: string | symbol): any {
    const vm = this.getVM()
    const getter = vm.getProp(vm.global, '__vmCacheGetter')
    const cacheIdHandle = vm.newString(cacheId)
    const keyHandle = this.marshal(key)
    const returnValHandle = vm.unwrapResult(vm.callFunction(getter, vm.global, cacheIdHandle, keyHandle))
    const jsVal = this.unmarshal(returnValHandle)
    getter.dispose()
    cacheIdHandle.dispose()
    keyHandle.dispose()
    returnValHandle.dispose()
    return jsVal
  }

  private _setVMCacheItemKey(cacheId: string, key: string | symbol, newVal: any): any {
    const vm = this.getVM()
    const setter = vm.getProp(vm.global, '__vmCacheSetter')
    const cacheIdHandle = vm.newString(cacheId)
    const keyHandle = this.marshal(key)
    const newValHandle = this.marshal(newVal)
    const returnValHandle = vm.unwrapResult(vm.callFunction(setter, vm.global, cacheIdHandle, keyHandle, newValHandle))
    const jsVal = this.unmarshal(returnValHandle)
    setter.dispose()
    cacheIdHandle.dispose()
    keyHandle.dispose()
    newValHandle.dispose()
    returnValHandle.dispose()
    return jsVal
  }

  private _callVMCacheItem(cacheId: string, args: any[], _this?: any): any {
    const vm = this.getVM()
    const caller = vm.getProp(vm.global, '__vmCacheCaller')
    const cacheIdHandle = vm.newString(cacheId)
    const argArrayHandle = this.marshal(args)
    const returnValHandle = vm.unwrapResult(vm.callFunction(caller, vm.global, cacheIdHandle, argArrayHandle))
    const jsVal = this.unmarshal(returnValHandle)
    cacheIdHandle.dispose()
    argArrayHandle.dispose()
    returnValHandle.dispose()
    caller.dispose()
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
      const cacheId = vm.getString(cacheIdHandle)
      const cachedPromise = this.valueCache.get(cacheId)
      if (!cachedPromise) {
        throw new Error('No such promise')
      }
      const vmPromise = vm.newPromise()
      cachedPromise.then(
        (results) => {
          this.marshal(results).consume((r) => {
            vmPromise.resolve(this.marshal(r))
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
      const cacheId = vm.getString(cacheIdHandle)
      const key = vm.typeof(keyHandle) === 'symbol' ? vm.getSymbol(keyHandle) : vm.getString(keyHandle)
      const cachedItem = this.valueCache.get(cacheId)
      return this.marshal(cachedItem[key])
    }).consume((getter) => vm.setProp(vm.global, '__getCacheItemKey', getter))

    vm.newFunction('__setCacheItemGetter', (cacheIdHandle, keyHandle, valHandle) => {
      const cacheId = vm.getString(cacheIdHandle)
      const key = vm.typeof(keyHandle) === 'symbol' ? vm.getSymbol(keyHandle) : vm.getString(keyHandle)
      const val = this.unmarshal(valHandle)
      const cachedItem = this.valueCache.get(cacheId)
      cachedItem[key] = val
      return vm.true
    }).consume((setter) => vm.setProp(vm.global, '__setCacheItemKey', setter))

    vm.newFunction('__callCacheItemFunction', (cacheIdHandle, argsArrayHandle, thisHandle) => {
      const cacheId = vm.getString(cacheIdHandle)
      const cachedItem = this.valueCache.get(cacheId)
      const args = this.unmarshal(argsArrayHandle)
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
