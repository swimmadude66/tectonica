import { GlobalKey, type AbstractManager } from './manager'

export interface AbstractManagerClass<M extends AbstractManager<any>> {
  new (...args: any[]): M
}

export type BaseListener<DataType = any> = (key: string, data?: DataType) => void

export type GlobalListener<DataType = any> = (key: typeof GlobalKey, data?: DataType) => void

export type EventsDef = {
  [eventName: string]: BaseListener | GlobalListener
}

export type EventListener<E extends EventsDef> = (args: Parameters<E[keyof E]>, manager: AbstractManagerClass<AbstractManager<E>>, eventName: keyof E) => void
