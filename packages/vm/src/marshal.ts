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
      // // Temp placement of console stdlib for debugging
      // vm.newObject().consume((_consoleObj) => {
      //   vm.newFunction('log', (...args) => {
      //     const rawArgs = args.map((a) => vm.dump(a))
      //     console.log(...rawArgs)
      //   }).consume((log) => vm.setProp(_consoleObj, 'log', log))
      //   vm.newFunction('error', (...args) => {
      //     const rawArgs = args.map((a) => vm.dump(a))
      //     console.error(...rawArgs)
      //   }).consume((err) => vm.setProp(_consoleObj, 'error', err))

      //   vm.setProp(vm.global, 'console', _consoleObj)
      // })

      // init
      this.init(vm)
    }
  }

  init(vm: QuickJSContext) {
    this.vm = vm
    this._initHelpers(vm)
  }

  marshal(value: any): QuickJSHandle {
    if (!PRIMITIVE_TYPES.includes(typeof value)) {
      const cachedHandle = this._handleCache.get(value)
      if (cachedHandle != null && cachedHandle.alive) {
        return cachedHandle
      }
    }
    const serializedValue = this.serializeJSValue(value)
    if (!this.vm) {
      throw new Error('VM not initialized')
    }
    const handle = this.vm.unwrapResult(
      this.vm.callFunction(
        this.vm.getProp(this.vm.global, '__marshalValue'),
        this.vm.global,
        this.vm.newString(serializedValue.serialized),
        this.vm.newString(serializedValue.token)
      )
    )
    if (!PRIMITIVE_TYPES.includes(typeof value)) {
      this._handleCache.set(value, handle)
    }
    return handle
  }

  unmarshal(handle: QuickJSHandle): any {
    if (!this.vm) {
      throw new Error('VM not initialized')
    }
    const serializer = this.vm.getProp(this.vm.global, '__unmarshalValue')
    const serialHandle = this.vm.unwrapResult(this.vm.callFunction(serializer, this.vm.global, handle))
    const serial = this.vm.getProp(serialHandle, 'serialized').consume((s) => this.vm?.getString(s))
    const token = this.vm.getProp(serialHandle, 'token').consume((s) => this.vm?.getString(s))
    return this.deserializeVMValue(serial!, token!, true)
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
    // console.log('deserializing', { serialized, token })
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
          case 'function': {
            return new Proxy(() => 0, {
              get: (_target, key) => {
                return this._getVMCacheItemKey(val[token], key)
              },
              set: (_target, key, newValue) => {
                return this._setVMCacheItemKey(val[token], key, newValue)
              },
              apply: (_target, thisArg, argArray) => {
                return this._callVMCacheItem(val[token], argArray, thisArg)
              },
            })
          }
          case 'cache':
          default: {
            return new Proxy(
              {},
              {
                get: (_target, key) => {
                  return this._getVMCacheItemKey(val[token], key)
                },
                set: (_target, key, newValue) => {
                  return this._setVMCacheItemKey(val[token], key, newValue)
                },
                apply: (_target, thisArg, argArray) => {
                  return this._callVMCacheItem(val[token], argArray, thisArg)
                },
              }
            )
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

  private _getVMCacheItemKey(cacheId: string, key: string | symbol): any {
    if (!this.vm) {
      throw new Error('VM not initialized')
    }
    const vm = this.vm
    const getter = vm.unwrapResult(vm.evalCode(`(cacheId, key) => __valueCache.get(cacheId)?.[key]`))
    const cacheIdHandle = vm.newString(cacheId)
    const keyHandle = this.marshal(key)
    const returnValHandle = vm.unwrapResult(vm.callFunction(getter, vm.global, cacheIdHandle, keyHandle))
    const jsVal = this.unmarshal(returnValHandle)
    cacheIdHandle.dispose()
    keyHandle.dispose()
    returnValHandle.dispose()
    return jsVal
  }

  private _setVMCacheItemKey(cacheId: string, key: string | symbol, newVal: any): any {
    if (!this.vm) {
      throw new Error('VM not initialized')
    }
    const vm = this.vm
    const setter = vm.unwrapResult(
      vm.evalCode(`(cacheId, key, val) => {
        __valueCache.get(cacheId)?.[key] = val
        return true
      }
    `)
    )
    const cacheIdHandle = vm.newString(cacheId)
    const keyHandle = this.marshal(key)
    const newValHandle = this.marshal(newVal)
    const returnValHandle = vm.unwrapResult(vm.callFunction(setter, vm.global, cacheIdHandle, keyHandle, newValHandle))
    const jsVal = this.unmarshal(returnValHandle)
    cacheIdHandle.dispose()
    keyHandle.dispose()
    newValHandle.dispose()
    returnValHandle.dispose()
    return jsVal
  }

  private _callVMCacheItem(cacheId: string, args: any[], _this?: any): any {
    if (!this.vm) {
      throw new Error('VM not initialized')
    }
    const vm = this.vm
    const caller = vm.unwrapResult(
      vm.evalCode(`
      (cacheId, argsArray) => {
        const cachedFunc = __valueCache.get(cacheId)
        if (typeof cachedFunc === 'function') {
          return cachedFunc(...argsArray)
        }
        throw new Error('Not a function')
      }
    `)
    )
    const cacheIdHandle = vm.newString(cacheId)
    const argArrayHandle = this.marshal(args)
    const returnValHandle = vm.unwrapResult(vm.callFunction(caller, vm.global, cacheIdHandle, argArrayHandle))
    const jsVal = this.unmarshal(returnValHandle)
    cacheIdHandle.dispose()
    argArrayHandle.dispose()
    returnValHandle.dispose()
    return jsVal
  }

  private _initHelpers(vm: QuickJSContext) {
    vm.unwrapResult(vm.evalCode(`new Map()`)).consume((cache) => vm.setProp(vm.global, '__valueCache', cache))

    vm.newFunction('__generateRandomId', () => vm.newString(generateRandomId())).consume((generator) => vm.setProp(vm.global, '__generateRandomId', generator))

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
                  case 'function': {
                    return new Proxy(() => 0, {
                      get: (_target, key) => {
                        return __getCacheItemKey(val[token], key)
                      },
                      set: (_target, key, newValue) => {
                        return __setCacheItemKey(val[token], key, newValue)
                      },
                      apply: (_target, thisArg, argArray) => {
                        return __callCacheItemFunction(val[token], argArray, thisArg)
                      }
                    })
                  }
                  case 'cache':
                  default: {
                    return new Proxy({}, {
                      get: (_target, key) => {
                        return __getCacheItemKey(val[token], key)
                      },
                      set: (_target, key, newValue) => {
                        return __setCacheItemKey(val[token], key, newValue)
                      },
                      apply: (_target, thisArg, argArray) => {
                        return __callCacheItemFunction(val[token], argArray, thisArg)
                      }
                    })
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
