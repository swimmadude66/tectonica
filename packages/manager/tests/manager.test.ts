import { expect } from 'chai'
import { AbstractManager, GlobalKey } from '../src/manager'

type TestEvents = {
  empty: (key: string) => void
  globalEmpty: (key: typeof GlobalKey) => void
  data: (key: string, data: any) => void
  globalData: (key: typeof GlobalKey, data: any) => void
}

class TestManager extends AbstractManager<TestEvents> {
  constructor(silent?: boolean) {
    super({ name: 'TestManager', silent: silent })
  }

  testEmpty(key: string) {
    this.emit('empty', key)
  }

  testGlobalEmpty() {
    this.emitGlobal('globalEmpty')
  }

  testData(key: string, data: any) {
    this.emit('data', key, data)
  }

  testGlobalData(data: any) {
    this.emitGlobal('globalData', data)
  }
}

describe('AbstractManager', () => {
  const manager: TestManager = new TestManager(true)

  beforeEach(() => {
    manager.init()
  })

  afterEach(() => {
    manager.teardown()
  })

  describe('emit', () => {
    let emptyCount = 0
    let globalEmptyCount = 0
    let dataCount = 0
    let globalDataCount = 0
    let onGlobalCount = 0

    let lastData: any
    let lastGlobalData: any
    let lastOnGlobalData: { key: string; data: any } | undefined

    function handleEmpty() {
      emptyCount++
    }

    function handleGlobalEmpty() {
      globalEmptyCount++
    }

    function handleData(key: string, data: any) {
      dataCount++
      lastData = data
    }

    function handleGlobalData(key: string, data: any) {
      globalDataCount++
      lastGlobalData = data
    }

    function handleOnGlobalData(key: string, data: any) {
      onGlobalCount++
      lastOnGlobalData = { key, data }
    }

    beforeEach(() => {
      // register listeners
      manager.on('empty', 'key', handleEmpty)

      manager.on('globalEmpty', GlobalKey, handleGlobalEmpty)

      manager.on('data', 'key', handleData)

      manager.on('globalData', GlobalKey, handleGlobalData)

      manager.onGlobal('data', handleOnGlobalData)
    })

    afterEach(() => {
      // register listeners
      manager.off('empty', 'key', handleEmpty)

      manager.off('globalEmpty', GlobalKey, handleGlobalEmpty)

      manager.off('data', 'key', handleData)

      manager.off('globalData', GlobalKey, handleGlobalData)

      manager.offGlobal('data', handleOnGlobalData)
    })

    it('properly emits events to appropriate listeners', () => {
      manager.testEmpty('key')
      expect(emptyCount).to.equal(1)

      manager.testGlobalEmpty()
      expect(globalEmptyCount).to.equal(1)

      manager.testData('key', 1)
      expect(dataCount).to.equal(1)
      expect(lastData).to.equal(1)

      manager.testGlobalData(1)
      expect(globalDataCount).to.equal(1)
      expect(lastGlobalData).to.equal(1)

      // test that onGlobal gets all keys
      manager.testData('key2', 2)
      expect(onGlobalCount).to.equal(2)
      expect(lastOnGlobalData).to.have.keys('key', 'data')
      expect(lastOnGlobalData?.key).to.equal('key2')
      expect(lastOnGlobalData?.data).to.equal(2)

      // ensure no crossbleed
      expect(emptyCount).to.equal(1)
      expect(globalEmptyCount).to.equal(1)
      expect(dataCount).to.equal(1)
      expect(lastData).to.equal(1)
      expect(globalDataCount).to.equal(1)
      expect(lastGlobalData).to.equal(1)
    })
  })
})
