import { createGlobalValueListenerHook, createManagerHook, createProvider } from '../src/react'

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
