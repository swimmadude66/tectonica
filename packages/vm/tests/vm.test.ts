import { expect } from 'chai'
import { VMManager } from '../src/vm'

describe('VMManager', () => {
  describe('VM init', () => {
    it('properly awaits ready', (done) => {
      const vm = new VMManager()
      expect(vm.ready).to.equal(false)
      vm.awaitReady().then(
        () => {
          expect(vm.ready).to.equal(true, 'not ready after awaiting')
          done()
        },
        (err) => {
          done(err)
        }
      )
      void vm.init()
    })

    it('multiple listeners can await ready', (done) => {
      const vm = new VMManager()
      expect(vm.ready).to.equal(false)

      let success = 0
      const errors: any[] = []
      function countResults(err?: any) {
        if (err) {
          console.error(err)
          errors.push(err)
        } else {
          success++
        }
        if (success + errors.length >= 2) {
          if (errors.length > 0) {
            done(errors)
          } else {
            done()
          }
        }
      }

      vm.awaitReady().then(
        () => {
          expect(vm.ready).to.equal(true, 'not ready after awaiting')
          countResults()
        },
        (err) => {
          countResults(err)
        }
      )
      vm.awaitReady().then(
        () => {
          expect(vm.ready).to.equal(true, 'not ready after awaiting')
          countResults()
        },
        (err) => {
          countResults(err)
        }
      )
      void vm.init()
    })

    it('creates context and runtime on init', async () => {
      const vm = new VMManager()
      await vm.init()
      await vm.awaitReady()
      expect(vm.module).to.not.be.undefined
      expect(vm.runtime).to.not.be.undefined
      expect(vm.vm).to.not.be.undefined
    })
  })

  describe('VM Eval', () => {
    const vm: VMManager = new VMManager()
    beforeEach(async () => {
      await vm.init()
    })

    afterEach(() => {
      vm.teardown()
    })

    it('can eval simple code', () => {
      expect(vm.eval(`6`)).to.equal(6)
      expect(vm.eval(`true`)).to.equal(true)
      expect(vm.eval(`"hello"`)).to.equal('hello')
      expect(vm.eval(`Symbol('test')`)).to.equal(Symbol.for('test'))
      expect(vm.eval(`99999999999999999999999999999999999999n`)).to.equal(99999999999999999999999999999999999999n)
      expect(vm.eval(`1 + 1`)).to.equal(2)
      expect(vm.eval(`!true`)).to.equal(false)
    })

    it('can create functions', () => {
      vm.registerVMGlobal('__counter', 0)
      const vmIncrementer = vm.eval(`() => ++__counter`)
      expect(typeof vmIncrementer).to.equal('function')
      expect(vmIncrementer()).to.equal(1)
      const counter = vm.eval('__counter')
      expect(counter).to.equal(1)
    })
  })
})
