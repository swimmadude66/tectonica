import { expect } from 'chai'
import { Marshaller } from '../src/marshal'
import { VMManager } from '../src/vm'
import { Scope } from 'quickjs-emscripten'

describe('Marshaller service', () => {
  describe('serialize JS value', () => {
    it('properly serializes primitive values', () => {
      const marshaller = new Marshaller()

      expect(marshaller.serializeJSValue(true).serialized).to.equal('true')
      expect(marshaller.serializeJSValue(false).serialized).to.equal('false')
      expect(marshaller.serializeJSValue(1).serialized).to.equal('1')
      expect(marshaller.serializeJSValue('string').serialized).to.equal('"string"')
    })

    it('properly serializes symbols', () => {
      const marshaller = new Marshaller()

      // symbol
      const symbol = Symbol('hello')
      const { serialized: symbolSerialized, token: symbolToken } = marshaller.serializeJSValue(symbol)
      expect(symbolSerialized).to.be.a.string
      expect(symbolToken).to.be.a.string
      const symbolData = JSON.parse(symbolSerialized)
      expect(symbolData).to.have.keys(['type', symbolToken])
      expect(symbolData.type).to.equal('symbol')
      expect(symbolData[symbolToken]).to.be.a.string
      expect(symbolData[symbolToken]).to.equal(Symbol.keyFor(symbol) ?? symbol.description)
    })

    it('properly serializes bigints', () => {
      const marshaller = new Marshaller()

      // bigint
      const bigint = 999999999999999999999999n
      const { serialized, token } = marshaller.serializeJSValue(bigint)
      expect(serialized).to.be.a.string
      expect(token).to.be.a.string
      const data = JSON.parse(serialized)
      expect(data).to.have.keys(['type', token])
      expect(data.type).to.equal('bigint')
      expect(data[token]).to.be.a.string
      expect(data[token]).to.equal(bigint.toString())
      expect(BigInt(data[token])).to.equal(bigint)
    })

    it('propely serializes dates', () => {
      const marshaller = new Marshaller()

      const d = new Date()
      const { serialized, token } = marshaller.serializeJSValue(d)
      expect(serialized).to.be.a.string
      expect(token).to.be.a.string
      const data = JSON.parse(serialized)
      expect(data).to.have.keys(['type', token])
      expect(data.type).to.equal('date')
      expect(data[token]).to.equal(d.valueOf())
    })

    it('properly serializes values which must be cached', () => {
      const marshaller = new Marshaller()

      // function
      const func = () => 'hello'
      const { serialized: funcSerialized, token: funcToken } = marshaller.serializeJSValue(func)
      expect(funcSerialized).to.be.a.string
      expect(funcToken).to.be.a.string
      const funcCacheData = JSON.parse(funcSerialized)
      expect(funcCacheData).to.have.keys(['type', funcToken, 'name'])
      expect(funcCacheData.type).to.equal('function')
      expect(funcCacheData[funcToken]).to.be.a.string
      const cachedFunc = marshaller.valueCache.get(funcCacheData[funcToken])
      expect(cachedFunc).to.equal(func)
    })

    it('properly serializes object values', () => {
      const marshaller = new Marshaller()

      const jsValue = { bool: true, num: 1, string: 'hello', func: () => 'hello', symbol: Symbol('hello') }
      const { serialized, token } = marshaller.serializeJSValue(jsValue)
      expect(serialized).to.be.a.string
      expect(token).to.be.a.string
      const parsedSerial = JSON.parse(serialized)
      expect(parsedSerial).to.have.keys(['type', token])
      expect(marshaller.valueCache.get(parsedSerial[token])).to.equal(jsValue)
    })

    it('properly serializes object array values', () => {
      const marshaller = new Marshaller()

      const jsValue = { bool: true, num: 1, string: 'hello', func: () => 'hello', symbol: Symbol('hello') }
      const { serialized, token } = marshaller.serializeJSValue([jsValue, jsValue])
      expect(serialized).to.be.a.string
      expect(token).to.be.a.string
      const parsedSerial = JSON.parse(serialized)
      expect(Array.isArray(parsedSerial)).to.be.true
      expect(parsedSerial[0]).to.have.keys(['type', token])
      expect(marshaller.valueCache.get(parsedSerial[0][token])).to.equal(jsValue)
      expect(parsedSerial[1]).to.have.keys(['type', token])
      expect(marshaller.valueCache.get(parsedSerial[1][token])).to.equal(jsValue)
    })

    it('properly serializes nested object values', () => {
      const marshaller = new Marshaller()

      const jsValue = {
        bool: true,
        num: 1,
        string: 'hello',
        func: () => 'hello',
        symbol: Symbol('hello'),
        object: { bool: true, num: 1, string: 'hello', func: () => 'hello', symbol: Symbol('hello') },
      }
      const { serialized, token } = marshaller.serializeJSValue(jsValue)
      expect(serialized).to.be.a.string
      expect(token).to.be.a.string
      const parsedSerial = JSON.parse(serialized)
      expect(parsedSerial).to.have.keys(['type', token])
      expect(marshaller.valueCache.get(parsedSerial[token])).to.equal(jsValue)
    })
  })

  describe('marshal and unmarshal', () => {
    const manager = new VMManager()

    beforeEach(async () => {
      await manager.init()
      await manager.awaitReady()
    })

    afterEach(async () => {
      await manager.teardown()
    })

    it('can proxy functions', async () => {
      const marshaller = manager.marshaller
      const vm = manager.vm!

      let callCount = 0
      function increment() {
        return ++callCount
      }
      const vmFunc = marshaller.marshal(increment)
      vmFunc.consume((vf) => {
        vm.defineProp(vm.global, '__incrementTest', { value: vf })
        // call function
        const calledCount = vm.getNumber(vm.unwrapResult(vm.callFunction(vf, vm.global)))
        expect(callCount).to.equal(1)
        expect(calledCount).to.equal(1)
        const calledCount2 = vm.getNumber(vm.unwrapResult(vm.evalCode(`__incrementTest()`)))
        expect(callCount).to.equal(2)
        expect(calledCount2).to.equal(2)
        const calledCount3 = vm.getNumber(vm.unwrapResult(vm.callFunction(vf, vm.global)))
        expect(callCount).to.equal(3)
        expect(calledCount3).to.equal(3)
        const calledCount4 = vm.getNumber(vm.unwrapResult(vm.evalCode(`__incrementTest()`)))
        expect(callCount).to.equal(4)
        expect(calledCount4).to.equal(4)
      })
    })

    it('can reverse proxy functions', async () => {
      const marshaller = manager.marshaller
      const vm = manager.vm!

      vm.setProp(vm.global, '__callCount', vm.newNumber(0))
      const incrementer = vm.unwrapResult(vm.evalCode(`() => ++__callCount`))
      vm.setProp(vm.global, '__increment', incrementer)

      const callResult = vm.unwrapResult(vm.evalCode(`__increment()`))
      expect(vm.getNumber(callResult)).to.equal(1)
      expect(vm.getNumber(vm.getProp(vm.global, '__callCount'))).to.equal(1)

      const proxyFunc = marshaller.unmarshal(incrementer)

      const jsResult = proxyFunc()
      expect(jsResult).to.equal(2)
      expect(vm.getNumber(vm.getProp(vm.global, '__callCount'))).to.equal(2)

      incrementer.dispose()
      callResult.dispose()
    })

    it('can marshal promises', async () => {
      const vm = manager.requireVM()
      return await new Promise((done) => {
        vm.unwrapResult(vm.evalCode(`({resolves: 0, rejects: 0, finallys: 0})`)).consume((counter) => vm.setProp(vm.global, '__counters', counter))
        const promiseListenerFunc = vm.unwrapResult(
          vm.evalCode(`(prom) => {
            prom.then((result) => {
              __counters.resolves++
            }, (reason) => {
              __counters.rejects++
            }).finally(() => {
              __counters.finallys++
            })
          }`)
        )

        const promise1 = new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 0)
        })
        const promise1Handle = manager.marshaller.marshal(promise1)
        vm.unwrapResult(vm.callFunction(promiseListenerFunc, vm.global, promise1Handle)).dispose()
        promise1Handle.dispose()

        promise1.finally(() => {
          setTimeout(() => {
            const countersHandler = vm.getProp(vm.global, '__counters')
            const resolves = vm.getProp(countersHandler, 'resolves').consume((r) => vm.getNumber(r))
            expect(resolves).to.equal(1)
            const rejects = vm.getProp(countersHandler, 'rejects').consume((r) => vm.getNumber(r))
            expect(rejects).to.equal(0)
            const finallys = vm.getProp(countersHandler, 'finallys').consume((f) => vm.getNumber(f))
            expect(finallys).to.equal(1)
            countersHandler.dispose()
          }, 0)
        })

        const promise2 = new Promise<void>((_resolve, reject) => {
          setTimeout(() => reject(), 10)
        })
        const promise2Handle = manager.marshaller.marshal(promise2)
        vm.unwrapResult(vm.callFunction(promiseListenerFunc, vm.global, promise2Handle)).dispose()
        promise2Handle.dispose()

        promise2.finally(() => {
          setTimeout(() => {
            const countersHandler = vm.getProp(vm.global, '__counters')
            const resolves = vm.getProp(countersHandler, 'resolves').consume((r) => vm.getNumber(r))
            expect(resolves).to.equal(1)
            const rejects = vm.getProp(countersHandler, 'rejects').consume((r) => vm.getNumber(r))
            expect(rejects).to.equal(1)
            const finallys = vm.getProp(countersHandler, 'finallys').consume((f) => vm.getNumber(f))
            expect(finallys).to.equal(2)

            countersHandler.dispose()
          }, 0)
        })

        Promise.allSettled([promise1, promise2]).finally(() => {
          setTimeout(() => {
            promiseListenerFunc.dispose()

            done()
          }, 0)
        })
      })
    })

    it('can unmarshal promises', async () => {
      const vm = manager.requireVM()

      const promiseFunc = vm.unwrapResult(
        vm.evalCode(`(shouldResolve, data) => {
          return new Promise((resolve, reject) => {
            if (shouldResolve) {
              resolve(data)
            } else {
              reject(data)
            }
          })
        }`)
      )
      const booleanArgHandle1 = vm.true
      const numberArgHandle1 = vm.newNumber(6)
      const promise1Handle = vm.unwrapResult(vm.callFunction(promiseFunc, vm.global, booleanArgHandle1, numberArgHandle1))
      const promise1 = manager.marshaller.unmarshal(promise1Handle) as Promise<number>
      promise1Handle.dispose()
      booleanArgHandle1.dispose()
      numberArgHandle1.dispose()
      const results = await promise1
      expect(results).to.equal(6)
      const booleanArgHandle2 = vm.false
      const numberArgHandle2 = vm.newNumber(42)
      const promise2Handle = vm.unwrapResult(vm.callFunction(promiseFunc, vm.global, booleanArgHandle2, numberArgHandle2))
      const promise2 = manager.marshaller.unmarshal(promise2Handle) as Promise<number>
      promise2Handle.dispose()
      booleanArgHandle2.dispose()
      numberArgHandle2.dispose()
      try {
        await promise2
      } catch (reason) {
        expect(reason).not.to.be.null
        expect(reason!['cause']).to.equal(42)
      } finally {
        promiseFunc.dispose()
      }
    })

    it('can marshal classes', async () => {
      manager.registerVMGlobal('dd', Date)
      const now = Date.now()
      const dateCheck = manager.eval(`
        const m = new dd(${now})
        m.valueOf()
      `)
      expect(dateCheck).to.equal(now)
    })

    it('preserves object identity', () => {
      const marshaller = manager.marshaller

      const hostObj = { x: 1, a: 'a', y: true, f: () => 6, arr: [] }
      const vmHandle = marshaller.marshal(hostObj)
      try {
        const unmarshaled = marshaller.unmarshal(vmHandle)
        expect(unmarshaled).to.equal(hostObj)
        expect(unmarshaled).to.deep.equal(hostObj)
      } finally {
        vmHandle.dispose()
      }
    })

    it('handles object reuse', () => {
      const marshaller = manager.marshaller
      const hostObj = { x: 1, a: 'a', y: true, f: () => 6, arr: [] }
      const scope = new Scope()
      try {
        scope.manage(marshaller.marshal(hostObj))
        expect(hostObj[marshaller.hostCacheIdSymbol]).to.be.a.string
        const hostCacheID = hostObj[marshaller.hostCacheIdSymbol]
        expect(marshaller.valueCache.get(hostCacheID)).to.deep.equal(hostObj)

        // marshal the same object
        scope.manage(marshaller.marshal(hostObj))
        expect(hostObj[marshaller.hostCacheIdSymbol]).to.be.a.string
        const secondHostCacheID = hostObj[marshaller.hostCacheIdSymbol]
        expect(secondHostCacheID).to.equal(hostCacheID)
        expect(marshaller.valueCache.get(secondHostCacheID)).to.deep.equal(hostObj)
      } finally {
        scope.dispose()
      }
    })
  })
})
