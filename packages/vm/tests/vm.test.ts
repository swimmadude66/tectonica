import { expect } from 'chai'
import { VM } from '../src/vm'

describe('VM init', () => {
  it('properly awaits ready', (done) => {
    const vm = new VM()
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
    const vm = new VM()
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
    const vm = new VM()
    await vm.init()
    await vm.awaitReady()
    expect(vm.module).to.not.be.undefined
    expect(vm.runtime).to.not.be.undefined
    expect(vm.vm).to.not.be.undefined
  })
})
