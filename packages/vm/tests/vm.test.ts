import 'jsdom-global/register'
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

    it('can eval in limited scopes', () => {
      vm.registerVMGlobal('greeting', 'hello')
      vm.registerVMGlobal('parting', 'goodbye')

      const result = vm.scopedEval(`'we say ' + greeting + ' and ' + parting`, { greeting: 'howdy', parting: 'peace' })
      expect(result).to.be.a.string
      expect(result).to.equal('we say howdy and peace')
      const globalResult = vm.eval(`'we say ' + greeting + ' and ' + parting`)
      expect(globalResult).to.be.a.string
      expect(globalResult).to.equal('we say hello and goodbye')
    })

    it('no longer errors on reused local vars', () => {
      vm.eval(`const occ = 'used in func'`)
      expect(() => vm.eval(`occ`)).to.throw()
      expect(() => vm.eval(`const occ = 'used again'`)).not.to.throw()
    })

    it('can reuse a jsland function', () => {
      function getObjectTypes(props: Record<string, any>) {
        const propTypes = {}
        for (const key in props) {
          propTypes[key] = typeof props[key]
        }
        return propTypes
      }

      const scopedFirstResult = vm.scopedEval(`getObjectTypes({ a: 1, b: '2', c: true, d: null, e: undefined })`, { getObjectTypes })
      expect(Object.keys(scopedFirstResult)).to.deep.equal(['a', 'b', 'c', 'd', 'e'])
      const scopedSecondResult = vm.scopedEval(`getObjectTypes({ f: 1, g: '2', h: true, i: null, j: undefined })`, { getObjectTypes })
      expect(Object.keys(scopedSecondResult)).to.deep.equal(['f', 'g', 'h', 'i', 'j'])
    })

    it('can reuse a scoped jsland function', () => {
      function getObjectTypes(props: Record<string, any>) {
        const propTypes = {}
        for (const key in props) {
          propTypes[key] = typeof props[key]
        }
        return propTypes
      }
      vm.registerVMGlobal('getObjectTypes', getObjectTypes)
      const firstResult = vm.eval(`getObjectTypes({ a: 1, b: '2', c: true, d: null, e: undefined })`)
      expect(Object.keys(firstResult)).to.deep.equal(['a', 'b', 'c', 'd', 'e'])
      const secondResult = vm.eval(`getObjectTypes({ f: 1, g: '2', h: true, i: null, j: undefined })`)
      expect(Object.keys(secondResult)).to.deep.equal(['f', 'g', 'h', 'i', 'j'])
    })
  })

  describe('VM DOM Eval', () => {
    const vm: VMManager = new VMManager()
    beforeEach(async () => {
      await vm.init()
    })

    afterEach(() => {
      vm.teardown()
    })

    it('handles serializing dom elements', () => {
      const context = { __container: document.createElement('div') }
      const domProxy = vm.scopedEval(`__container`, context)
      expect(domProxy).not.to.be.null
      expect(typeof domProxy).to.equal('object')
    })

    it('handles scoped dom proxying', () => {
      const btn = document.createElement('button')
      const context = { btn, counter: { val: 0 } }
      const btnProxy = vm.scopedEval(
        `
        function run() {
          const b = btn
          b.addEventListener('click', () => ++counter.val)
          return b
        }
        run()
        `,
        context
      )
      expect(btnProxy).not.to.be.null
      expect(typeof btnProxy).to.equal('object')
      btn.click()
      expect(context.counter.val).to.equal(1)
      btnProxy.click()
      expect(context.counter.val).to.equal(2)
    })
  })
})
