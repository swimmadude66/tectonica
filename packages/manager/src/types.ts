import type { PropsWithChildren } from 'react'
import { GlobalKey, type AbstractManager } from './manager'

export interface AbstractManagerClass<M extends AbstractManager<any>> {
  new (...args: any[]): M
}

export type BaseListener<DataType = any> = (key: string, data?: DataType) => void

export type GlobalListener<DataType = any> = (key: typeof GlobalKey, data?: DataType) => void

export type ManagerEventType = BaseListener | GlobalListener

export type EventsDef = {
  [eventName: string]: ManagerEventType
}

export type EventListener<E extends EventsDef> = (args: Parameters<E[keyof E]>, manager: AbstractManagerClass<AbstractManager<E>>, eventName: keyof E) => void

export type ManagerConstructorHookProps = Record<string, unknown>
export type ManagerConstructorHook<Manager extends AbstractManager<any>, Props extends ManagerConstructorHookProps> = (rest: Props) => Manager

export type AbstractManagerProvider<Props extends Record<string, unknown> = Record<string, unknown>> = (props: PropsWithChildren<Props>) => JSX.Element

export type UseManagerHook<Manager extends AbstractManager<any>> = () => Manager | undefined

export type InferManagerEvents<Manager> = Manager extends AbstractManager<infer E> ? E : never

export type ManagerEventTypeName<E extends EventsDef> = keyof E
export type ManagerEventTypeKey<E extends EventsDef, EventName extends ManagerEventTypeName<E>> = Parameters<E[EventName]>[0]
export type ManagerEventTypeData<E extends EventsDef, EventName extends ManagerEventTypeName<E>> = Parameters<E[EventName]>[1]

// listener types
export type GetKeyFunc<Manager extends AbstractManager<E>, E extends EventsDef, EventName extends ManagerEventTypeName<E>, ArgsType> = (
  manager: Manager | undefined,
  ...args: ArgsType[]
) => ManagerEventTypeKey<E, EventName>

export type GetKeyType<Manager extends AbstractManager<E>, E extends EventsDef, EventName extends ManagerEventTypeName<E>, ArgsType> =
  | GetKeyFunc<Manager, E, EventName, ArgsType>
  | ManagerEventTypeKey<E, EventName>

export type ListenerData<Manager extends AbstractManager<E>, E extends EventsDef, EventName extends ManagerEventTypeName<E>> = {
  data: ManagerEventTypeData<E, EventName> | undefined
  key: ManagerEventTypeKey<E, EventName>
  manager?: Manager
  eventName: EventName
}

export type GetValueFunc<Manager extends AbstractManager<E>, E extends EventsDef, EventName extends ManagerEventTypeName<E>, ValueType> = (
  data: ListenerData<Manager, E, EventName>
) => ValueType

export type GetValueType<Manager extends AbstractManager<E>, E extends EventsDef, EventName extends ManagerEventTypeName<E>, ValueType> =
  | GetValueFunc<Manager, E, EventName, ValueType>
  | ValueType

export type EventHandler<E extends EventsDef, EventName extends ManagerEventTypeName<E>> = (data: ManagerEventTypeData<E, EventName>) => void

export type EffectListener<Manager extends AbstractManager<E>, E extends EventsDef, EventName extends ManagerEventTypeName<E>> = (data: ListenerData<Manager, E, EventName>) => void
