import { EventEmitter } from 'tseep'
import { AbstractManagerEventMap, AbstractManagerListener, EventsDef, GlobalKey, ManagerEventTypeData, ManagerEventTypeKey, ManagerEventTypeName } from './types'

export interface AbstractManagerOpts {
  name: string
  silent?: boolean
}

export class AbstractManager<E extends EventsDef> {
  name: string
  private _emitter: EventEmitter<any> // EventEmitter<AbstractManagerEventMap<E, this>>
  private silent: boolean

  private filteredListenersMap = new Map<any, Map<string, any>>() //new Map<AbstractManagerListener<E, this, keyof E>, Map<string, AbstractManagerListener<E, this, keyof E>>>()

  protected initialized: boolean = false

  constructor({ name, silent }: AbstractManagerOpts) {
    this.name = name
    this.silent = silent ?? false
    this._emitter = new EventEmitter<AbstractManagerEventMap<E, this>>()
  }

  init() {
    if (!this.initialized) {
      this.initialized = true
      if (!this.silent) {
        this.log('info', `Initialized`)
      }
    }
  }

  teardown() {
    if (this.initialized) {
      this.initialized = false
      this._emitter.removeAllListeners()
      this.filteredListenersMap.clear()
    }
  }

  protected emit<EventName extends ManagerEventTypeName<E>>(
    eventName: EventName,
    key: ManagerEventTypeKey<E, EventName> | typeof GlobalKey,
    data?: ManagerEventTypeData<E, EventName>
  ): void {
    const eventArgs = [key, data, this] as any
    this._emitter.emit(eventName, ...eventArgs)
  }

  protected emitGlobal<EventName extends ManagerEventTypeName<E>>(eventName: EventName, data?: ManagerEventTypeData<E, EventName>) {
    const eventArgs = [GlobalKey, data, this] as any
    this._emitter.emit(eventName, ...eventArgs)
  }

  on<EventName extends ManagerEventTypeName<E>>(
    eventName: EventName,
    key: ManagerEventTypeKey<E, EventName> | typeof GlobalKey,
    listener: AbstractManagerListener<E, this, EventName>
  ) {
    if (key === GlobalKey) {
      return this.onGlobal(eventName, listener)
    }
    const filteredListener = this.getFilteredListener<EventName>(key, listener)
    this._emitter.on(eventName, filteredListener)
  }

  onGlobal<EventName extends ManagerEventTypeName<E>>(eventName: EventName, listener: AbstractManagerListener<E, this, EventName>) {
    this._emitter.on(eventName, listener)
  }

  off<EventName extends ManagerEventTypeName<E>>(
    eventName: EventName,
    key: ManagerEventTypeKey<E, EventName> | typeof GlobalKey,
    listener: AbstractManagerListener<E, this, EventName>
  ) {
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

  offGlobal<EventName extends ManagerEventTypeName<E>>(eventName: EventName, listener: AbstractManagerListener<E, this, EventName>) {
    this._emitter.off(eventName, listener)
  }

  private getFilteredListener<EventName extends ManagerEventTypeName<E>>(key: string, listener: AbstractManagerListener<E, this, EventName>) {
    let baseListenerMap = this.filteredListenersMap.get(listener)
    if (!baseListenerMap) {
      const keyMap = new Map<string, (...args: any[]) => void>()
      this.filteredListenersMap.set(listener, keyMap)
      baseListenerMap = keyMap
    }
    let filteredListener = baseListenerMap.get(key)
    if (!filteredListener) {
      const newFilter = (k: any, d: any, _manager: AbstractManager<any>) => {
        if (k === key) {
          listener(k, d, this)
        }
      }
      baseListenerMap.set(key, newFilter)
      filteredListener = newFilter
    }
    return filteredListener as any //as AbstractManagerListener<E, this, EventName>
  }

  protected log(type: 'log' | 'info' | 'error' | 'warn', ...messages: any[]): void {
    const logFunc = console[type]
    logFunc(`[${this.name}]:`, ...messages)
  }
}
