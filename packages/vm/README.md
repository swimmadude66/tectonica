# @tectonica/manager

### Install

```bash
pnpm install @tectonica/manager
```

### Usage

_scrollManager/manager.ts_

```typescript
import { AbstractManager, GlobalKey } from '@tectonica/manager'

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
```

_scrollManager/react.ts_

```typescript
import { createGlobalValueListenerHook, createManagerHook, createProvider } from '@tectonica/manager'
import { useEffect, useMemo } from 'react'
import { ScrollManager } from './manager'

export const ScrollManagerProvider = createProvider(ScrollManager, () => {
  const manager = useMemo(() => {
    return new ScrollManager()
  }, [])

  useEffect(() => {
    manager?.init()

    return () => manager?.teardown()
  }, [manager])

  return manager
})

export const useScrollManager = createManagerHook(ScrollManager)

export const useScrollPos = createGlobalValueListenerHook(ScrollManager, 'scroll', ({ manager }) => manager?.scrollData)
```

_In some components_

```typescript
import React from 'react'

import { ScrollManagerProvider, useScrollPos } from '../managers/scrollManager'

export function App() {
  // be sure to add the provider above where you want to use the manager
  return (
    <ScrollManagerProvider>
      <ScrollBar />
    </ScrollManagerProvider>
  )
}

function ScrollBar() {
  // scrollPos will update whenever new data is ready, without prop drilling
  const scrollPos = useScrollPos()

  return <p>{JSON.stringify(scrollPos)}</p>
}

```
