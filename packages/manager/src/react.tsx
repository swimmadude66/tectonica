import { Context, createContext, useCallback, useContext, useEffect, useLayoutEffect, useSyncExternalStore, type PropsWithChildren } from 'react'

import {
  AbstractManagerClass,
  AbstractManagerProvider,
  EffectListener,
  EventHandler,
  GetKeyFunc,
  GetKeyType,
  GetValueFunc,
  GlobalKey,
  InferManagerEvents,
  ManagerConstructorHook,
  ManagerConstructorHookProps,
  ManagerEventTypeName,
  UseManagerHook,
  UseOptionalManagerHook,
} from './types'
import { AbstractManager } from './manager'

type ManagerContextMapType<Manager extends AbstractManager<any> = AbstractManager<any>> = Map<AbstractManagerClass<Manager>, Context<Manager | undefined>>

const ManagerContextMap: ManagerContextMapType = new Map()

export function getManagerContext<ManagerClass extends AbstractManagerClass<any>>(managerClass: ManagerClass): Context<InstanceType<typeof managerClass> | undefined> {
  const existingContext = ManagerContextMap.get(managerClass)
  if (existingContext) {
    return existingContext as Context<InstanceType<typeof managerClass> | undefined>
  }

  const newContext = createContext<AbstractManager<any> | undefined>(undefined)
  ManagerContextMap.set(managerClass, newContext)
  return newContext as Context<InstanceType<typeof managerClass> | undefined>
}

export function useManagerContext<ManagerClass extends AbstractManagerClass<AbstractManager<any>>>(
  managerClass: ManagerClass,
  Context: Context<InstanceType<typeof managerClass> | undefined> = getManagerContext(managerClass)
): InstanceType<typeof managerClass> {
  Context.displayName = managerClass.name

  const ctx = useContext<InstanceType<typeof managerClass> | undefined>(Context)
  if (ctx == null) {
    throw new Error(`Missing context for ${managerClass.name}`)
  }
  return ctx
}

export function useOptionalManagerContext<ManagerClass extends AbstractManagerClass<AbstractManager<any>>>(
  managerClass: ManagerClass,
  Context: Context<InstanceType<typeof managerClass> | undefined> = getManagerContext(managerClass)
): InstanceType<typeof managerClass> | undefined {
  Context.displayName = managerClass.name

  return useContext<InstanceType<typeof managerClass> | undefined>(Context)
}

export function createProvider<ManagerClass extends AbstractManagerClass<any>, Props extends ManagerConstructorHookProps>(
  managerClass: ManagerClass,
  useConstructor: ManagerConstructorHook<InstanceType<typeof managerClass>, Props>
): AbstractManagerProvider<Props> {
  const ManagerContext = getManagerContext(managerClass)
  ManagerContext.displayName = managerClass.name

  return function Provider(props: PropsWithChildren<Props>): JSX.Element {
    const manager: InstanceType<typeof managerClass> = useConstructor(props)

    useEffect(() => {
      manager?.init()

      return () => {
        manager?.teardown()
      }
    }, [manager])

    return <ManagerContext.Provider value={manager}>{props.children}</ManagerContext.Provider>
  }
}

export function createManagerHook<ManagerClass extends AbstractManagerClass<AbstractManager<any>>>(managerClass: ManagerClass): UseManagerHook<InstanceType<typeof managerClass>> {
  const ManagerContext = getManagerContext(managerClass)
  return (): InstanceType<typeof managerClass> => useManagerContext(managerClass, ManagerContext)
}

export function createOptionalManagerHook<ManagerClass extends AbstractManagerClass<AbstractManager<any>>>(
  managerClass: ManagerClass
): UseOptionalManagerHook<InstanceType<typeof managerClass>> {
  const ManagerContext = getManagerContext(managerClass)
  return (): InstanceType<typeof managerClass> | undefined => useOptionalManagerContext(managerClass, ManagerContext)
}

export function createValueListenerHook<
  ManagerClass extends AbstractManagerClass<AbstractManager<any>>,
  EventName extends ManagerEventTypeName<InferManagerEvents<InstanceType<ManagerClass>>>,
  ArgsType,
  ReturnType,
>(
  managerClass: ManagerClass,
  eventName: EventName,
  getKey: GetKeyType<InstanceType<typeof managerClass>, InferManagerEvents<InstanceType<typeof managerClass>>, EventName, ArgsType>,
  getValue: GetValueFunc<InstanceType<typeof managerClass>, InferManagerEvents<InstanceType<typeof managerClass>>, EventName, ReturnType>,
  getServerValue: GetValueFunc<InstanceType<typeof managerClass>, InferManagerEvents<InstanceType<typeof managerClass>>, EventName, ReturnType> = getValue
): (...args: ArgsType[]) => ReturnType {
  const keyGetter = (typeof getKey === 'function' ? getKey : (_mgr, ..._args) => getKey) as GetKeyFunc<
    InstanceType<typeof managerClass>,
    InferManagerEvents<InstanceType<typeof managerClass>>,
    EventName,
    ArgsType
  >

  const ManagerContext = getManagerContext(managerClass)

  return (...args: ArgsType[]): ReturnType => {
    const manager = useManagerContext(managerClass, ManagerContext)
    const key = keyGetter(manager, ...args)

    const subscribe = useCallback(
      (notifyReact: () => void) => {
        const handler: EventHandler<InferManagerEvents<InstanceType<typeof managerClass>>, typeof eventName> = (_data) => {
          notifyReact()
        }
        manager?.on(eventName, key, handler)

        return () => {
          manager?.off(eventName, key, handler)
        }
      },
      [manager, key]
    )

    const getSnapshot = useCallback(() => {
      return getValue({ manager, eventName, key, data: undefined })
    }, [manager, key])

    const getServerSnapshot = useCallback(() => {
      return getServerValue({ manager, eventName, key, data: undefined })
    }, [manager, key])

    const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
    return value
  }
}

export function createEffectListenerHook<
  ManagerClass extends AbstractManagerClass<AbstractManager<any>>,
  EventName extends ManagerEventTypeName<InferManagerEvents<InstanceType<ManagerClass>>>,
  ArgsType,
>(
  managerClass: ManagerClass,
  eventName: EventName,
  getKey: GetKeyType<InstanceType<typeof managerClass>, InferManagerEvents<InstanceType<typeof managerClass>>, EventName, ArgsType>
) {
  const keyGetter = (typeof getKey === 'function' ? getKey : (_mgr, ..._args) => getKey) as GetKeyFunc<
    InstanceType<typeof managerClass>,
    InferManagerEvents<InstanceType<typeof managerClass>>,
    EventName,
    ArgsType
  >

  const ManagerContext = getManagerContext(managerClass)

  return (handler: EffectListener<InstanceType<typeof managerClass>, InferManagerEvents<InstanceType<typeof managerClass>>, EventName>, args: ArgsType[] = []) => {
    const manager = useManagerContext(managerClass, ManagerContext)
    const key = keyGetter(manager, ...args)

    const callHandler: EventHandler<InferManagerEvents<InstanceType<typeof managerClass>>, typeof eventName> = useCallback(
      (data) => {
        handler({ manager, key, eventName, data })
      },
      [handler, key, manager]
    )

    useLayoutEffect(() => {
      manager?.on(eventName, key, callHandler)

      return () => manager?.off(eventName, key, callHandler)
    }, [manager, callHandler, key])
  }
}

export function createGlobalValueListenerHook<
  ManagerClass extends AbstractManagerClass<AbstractManager<any>>,
  EventName extends ManagerEventTypeName<InferManagerEvents<InstanceType<ManagerClass>>>,
  ReturnType,
>(
  managerClass: ManagerClass,
  eventName: EventName,
  getValue: GetValueFunc<InstanceType<typeof managerClass>, InferManagerEvents<InstanceType<typeof managerClass>>, EventName, ReturnType>,
  getServerValue?: GetValueFunc<InstanceType<typeof managerClass>, InferManagerEvents<InstanceType<typeof managerClass>>, EventName, ReturnType>
): () => ReturnType {
  return createValueListenerHook<ManagerClass, EventName, never, ReturnType>(managerClass, eventName, GlobalKey, getValue, getServerValue)
}

export function createGlobalEffectListenerHook<
  ManagerClass extends AbstractManagerClass<AbstractManager<any>>,
  EventName extends ManagerEventTypeName<InferManagerEvents<InstanceType<ManagerClass>>>,
  ArgsType,
>(managerClass: ManagerClass, eventName: EventName) {
  return createEffectListenerHook<ManagerClass, EventName, ArgsType>(managerClass, eventName, GlobalKey)
}
