import { expect } from 'chai'
import { Marshaller } from '../src/marshal'
import { VM } from '../src/vm'

describe('Marshal JS value to VM value', () => {
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

    it('properly serializes values which must be cached', () => {
      const marshaller = new Marshaller()

      // function
      const func = () => 'hello'
      const { serialized: funcSerialized, token: funcToken } = marshaller.serializeJSValue(func)
      expect(funcSerialized).to.be.a.string
      expect(funcToken).to.be.a.string
      const funcCacheData = JSON.parse(funcSerialized)
      expect(funcCacheData).to.have.keys(['type', funcToken])
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
      expect(parsedSerial).to.have.keys(Object.keys(jsValue))
      expect(parsedSerial['func']).to.have.keys(['type', token])
      expect(parsedSerial['symbol']).to.have.keys(['type', token])
    })

    it('properly serializes object array values', () => {
      const marshaller = new Marshaller()

      const jsValue = { bool: true, num: 1, string: 'hello', func: () => 'hello', symbol: Symbol('hello') }
      const { serialized, token } = marshaller.serializeJSValue([jsValue, jsValue])
      expect(serialized).to.be.a.string
      expect(token).to.be.a.string
      const parsedSerial = JSON.parse(serialized)
      expect(Array.isArray(parsedSerial)).to.be.true
      expect(parsedSerial[0]).to.have.keys(Object.keys(jsValue))
      expect(parsedSerial[0]['func']).to.have.keys(['type', token])
      expect(parsedSerial[0]['symbol']).to.have.keys(['type', token])
      expect(parsedSerial[1]).to.have.keys(Object.keys(jsValue))
      expect(parsedSerial[1]['func']).to.have.keys(['type', token])
      expect(parsedSerial[1]['symbol']).to.have.keys(['type', token])
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
      expect(parsedSerial).to.have.keys(Object.keys(jsValue))
      expect(parsedSerial['func']).to.have.keys(['type', token])
      expect(parsedSerial['symbol']).to.have.keys(['type', token])
      expect(parsedSerial['object']).to.have.keys(Object.keys(jsValue).filter((k) => k !== 'object'))
      expect(parsedSerial['object']['func']).to.have.keys(['type', token])
      expect(parsedSerial['object']['symbol']).to.have.keys(['type', token])
    })

    it('properly serializes nested object values', async () => {
      const vm = new VM()
      await vm.init()
      await vm.awaitReady()
      const marshaller = vm.marshaller

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
      expect(parsedSerial).to.have.keys(Object.keys(jsValue))
      expect(parsedSerial['func']).to.have.keys(['type', token])
      expect(parsedSerial['symbol']).to.have.keys(['type', token])
      expect(parsedSerial['object']).to.have.keys(Object.keys(jsValue).filter((k) => k !== 'object'))
      expect(parsedSerial['object']['func']).to.have.keys(['type', token])
      expect(parsedSerial['object']['symbol']).to.have.keys(['type', token])
    })

    it('can proxy functions', async () => {
      const manager = new VM()
      await manager.init()
      await manager.awaitReady()
      const marshaller = manager.marshaller
      const vm = manager.vm!

      let callCount = 0
      function increment() {
        return ++callCount
      }
      const vmFunc = marshaller.jsToVM(increment)
      vmFunc.consume((vf) => {
        vm.setProp(vm.global, '__incrementTest', vf)
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
      const manager = new VM()
      await manager.init()
      await manager.awaitReady()
      const marshaller = manager.marshaller
      const vm = manager.vm!

      vm.setProp(vm.global, '__callCount', vm.newNumber(0))
      const incrementer = vm.unwrapResult(vm.evalCode(`() => ++__callCount`))
      vm.setProp(vm.global, '__increment', incrementer)

      const callResult = vm.unwrapResult(vm.evalCode(`__increment()`))
      expect(vm.getNumber(callResult)).to.equal(1)
      expect(vm.getNumber(vm.getProp(vm.global, '__callCount'))).to.equal(1)

      const proxyFunc = marshaller.vmToJS(incrementer)

      const jsResult = proxyFunc()
      expect(jsResult).to.equal(2)
      expect(vm.getNumber(vm.getProp(vm.global, '__callCount'))).to.equal(2)

      incrementer.dispose()
      callResult.dispose()
    })
  })
})
