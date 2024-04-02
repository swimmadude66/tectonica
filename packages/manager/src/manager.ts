import { EventEmitter } from 'tseep'
import { EventsDef, ManagerEventTypeKey } from './types'

export const GlobalKey = Symbol.for('__GLOBALKEY')

export interface AbstractManagerOpts {
  name: string
  silent?: boolean
}

export class AbstractManager<E extends EventsDef> {
  name: string
  private _emitter: EventEmitter<E>
  private silent: boolean

  private filteredListenersMap = new Map<E[keyof E], Map<string, (key: string, data: any) => void>>()

  protected initialized: boolean = false

  constructor({ name, silent }: AbstractManagerOpts) {
    this.name = name
    this.silent = silent ?? false
    this._emitter = new EventEmitter<E>()
  }

  init() {
    this.initialized = true
    if (!this.silent) {
      this.log('info', `Initialized`)
    }
  }

  teardown() {
    this.initialized = false
    this._emitter.removeAllListeners()
    this.filteredListenersMap.clear()
  }

  protected emit(eventName: keyof E, key: string | typeof GlobalKey, data?: Omit<Parameters<E[keyof E]>, 'key'>) {
    const eventArgs = [key, data] as any as Parameters<E[keyof E]>
    this._emitter.emit(eventName, ...eventArgs)
  }

  protected emitGlobal(eventName: keyof E, data?: Omit<Parameters<E[keyof E]>, 'key'>) {
    const eventArgs = [GlobalKey, data] as any as Parameters<E[keyof E]>
    this._emitter.emit(eventName, ...eventArgs)
  }

  on<EventName extends keyof E = keyof E>(eventName: EventName, key: ManagerEventTypeKey<E, EventName> | typeof GlobalKey, listener: E[EventName]) {
    if (key === GlobalKey) {
      return this.onGlobal(eventName, listener)
    }
    const filteredListener = this.getFilteredListener<EventName>(key, listener)
    this._emitter.on(eventName, filteredListener)
  }

  onGlobal<EventName extends keyof E = keyof E>(eventName: EventName, listener: E[EventName]) {
    this._emitter.on(eventName, listener)
  }

  off<EventName extends keyof E = keyof E>(eventName: EventName, key: ManagerEventTypeKey<E, EventName> | typeof GlobalKey, listener: E[EventName]) {
    if (key === GlobalKey) {
      return this.offGlobal(eventName, listener)
    }
    const filteredListenerMap = this.filteredListenersMap.get(listener)
    const filteredListener = filteredListenerMap?.get(key)
    if (filteredListener) {
      this._emitter.off(eventName, filteredListener as any)
      filteredListenerMap?.delete(key)
      if (!filteredListenerMap?.size) {
        this.filteredListenersMap.delete(listener)
      }
    }
  }

  offGlobal<EventName extends keyof E = keyof E>(eventName: EventName, listener: E[EventName]) {
    this._emitter.off(eventName, listener)
  }

  private getFilteredListener<EventName extends keyof E = keyof E>(key: string, listener: E[EventName]) {
    let baseListenerMap = this.filteredListenersMap.get(listener)
    if (!baseListenerMap) {
      const keyMap = new Map<string, (...args: any[]) => void>()
      this.filteredListenersMap.set(listener, keyMap)
      baseListenerMap = keyMap
    }
    let filteredListener = baseListenerMap.get(key)
    if (!filteredListener) {
      const newFilter = (k: string, d: any) => {
        if (k === key) {
          listener(k as never, d)
        }
      }
      baseListenerMap.set(key, newFilter)
      filteredListener = newFilter
    }
    return filteredListener as E[EventName]
  }

  private log(type: 'log' | 'info' | 'error' | 'warn', ...messages: any[]): void {
    const logFunc = console[type]
    logFunc(`[${this.name}]:`, ...messages)
  }
}
