import { AbstractManager } from '../src/manager'
import { GlobalKey } from '../src/types'

type ScrollData = {
  scrollX: number
  scrollY: number
}

type ScrollEvents = {
  scroll: (key: typeof GlobalKey, data: ScrollData) => void
}

export class ScrollManager extends AbstractManager<ScrollEvents> {
  scrollData: ScrollData = { scrollX: 0, scrollY: 0 }

  constructor() {
    super({ name: 'ScrollManager' })
  }

  init() {
    super.init()

    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', this.handleScroll, { passive: true })
    }
  }

  teardown() {
    super.teardown()

    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.handleScroll)
    }
  }

  private handleScroll = (_evt: Event) => {
    const scrollData = {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }
    this.scrollData = scrollData
    this.emitGlobal('scroll', scrollData)
  }
}
