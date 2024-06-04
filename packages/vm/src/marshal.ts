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
      vm.newObject().consume((_consoleObj) => {
        vm.setProp(
          _consoleObj,
          'log',
          vm.newFunction('log', (...args) => {
            const rawArgs = args.map((a) => vm.dump(a))
            console.log(...rawArgs)
          })
        )
        vm.setProp(vm.global, 'console', _consoleObj)
      })

      vm.setProp(
        vm.global,
        '__valueCache',
        vm.unwrapResult(
          vm.evalCode(`
            new Map()
          `)
        )
      )

      vm.setProp(
        vm.global,
        '__generateRandomId',
        vm.newFunction('__generateRandomId', () => vm.newString(generateRandomId()))
      )

      vm.setProp(
        vm.global,
        '__getCacheItemKey',
        vm.newFunction('__getCacheItemGetter', (cacheIdHandle, keyHandle) => {
          const cacheId = vm.getString(cacheIdHandle)
          const key = vm.typeof(keyHandle) === 'symbol' ? vm.getSymbol(keyHandle) : vm.getString(keyHandle)
          const cachedItem = this.valueCache.get(cacheId)
          return this.jsToVM(cachedItem[key])
        })
      )

      vm.setProp(
        vm.global,
        '__setCacheItemKey',
        vm.newFunction('__setCacheItemGetter', (cacheIdHandle, keyHandle, valHandle) => {
          const cacheId = vm.getString(cacheIdHandle)
          const key = vm.typeof(keyHandle) === 'symbol' ? vm.getSymbol(keyHandle) : vm.getString(keyHandle)
          const val = vm.dump(valHandle) // TODO: replace with unmarshal
          const cachedItem = this.valueCache.get(cacheId)
          cachedItem[key] = val
          return vm.true
        })
      )

      vm.setProp(
        vm.global,
        '__callCacheItemFunction',
        vm.newFunction('__callCacheItemFunction', (cacheIdHandle, argsArrayHandle, thisHandle) => {
          const cacheId = vm.getString(cacheIdHandle)
          const cachedItem = this.valueCache.get(cacheId)
          const args = vm.dump(argsArrayHandle) // TODO: replace with unmarshal
          if (typeof cachedItem === 'function') {
            return this.jsToVM(cachedItem(...args))
          }
          return vm.undefined
        })
      )

      vm.setProp(
        vm.global,
        '__marshalValue',
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
        )
      )

      vm.setProp(
        vm.global,
        '__unmarshalValue',
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
        )
      )
    }
  }

  jsToVM(value: any): QuickJSHandle {
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

  vmToJS(handle: QuickJSHandle): any {
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
      // regular object
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
            return () => 0
            // return new Proxy(() => 0, {
            //   get: (_target, key) => {
            //     return __getCacheItemKey(value[token], key)
            //   },
            //   set: (_target, key, value) => {
            //     return __setCacheItemKey(value[token], key, value)
            //   },
            //   apply: (_target, thisArg, argArray) => {
            //     return __callCacheItemFunction(value[token], argArray, thisArg)
            //   },
            // })
          }
          case 'cache':
          default: {
            return {}
            // return new Proxy(
            //   {},
            //   {
            //     get: (_target, key) => {
            //       return __getCacheItemKey(value[token], key)
            //     },
            //     set: (_target, key, value) => {
            //       return __setCacheItemKey(value[token], key, value)
            //     },
            //     apply: (_target, thisArg, argArray) => {
            //       return __callCacheItemFunction(value[token], argArray, thisArg)
            //     },
            //   }
            // )
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
}
