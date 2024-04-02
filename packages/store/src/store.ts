import { BehaviorSubject, Observable, debounceTime, map, combineLatest, skip, Subscription } from 'rxjs'

interface StateStoreOpts {}

export interface ObserveOpts {
  skipInitialValue?: boolean
  debounceMS?: number
}

/**
 * A utility class which allows watching for changes via rxjs subjects. Updating a value in the store notifies all listeners.
 * Useful as a global state management system or as a singular field in a larger manager
 */
export class StateStore<Base extends { [key: string | number | symbol]: any }> implements Map<keyof Base, Base[keyof Base]> {
  protected _data = new Map<keyof Base, BehaviorSubject<Base[keyof Base]>>()
  protected _changeSubject: BehaviorSubject<Base>

  private _innerSubscriptions: Subscription[] = []

  get size(): number {
    return this._data.size
  }

  constructor(base: Base, opts?: StateStoreOpts) {
    this._changeSubject = new BehaviorSubject<Base>(base)
    for (const key in base) {
      const baseVal = base[key] as Base[keyof Base]
      this.addSubject(key, baseVal)
    }
  }

  private addSubject(key: keyof Base, initialVal: Base[keyof Base]) {
    const sub = new BehaviorSubject<typeof initialVal>(initialVal)
    this._innerSubscriptions.push(
      sub.subscribe({
        next: (change) => {
          const currVal = this._changeSubject.getValue() as Base
          this._changeSubject.next({ ...currVal, [key]: change })
        },
        error: (err) => {},
        complete: () => {
          const currVal = this._changeSubject.getValue() as Base
          this._changeSubject.next({ ...currVal, [key]: undefined })
        },
      })
    )

    this._data.set(key, sub)
  }

  clear(): void {
    this.teardown()
    // TODO: emit change event on top-level change subject
  }

  delete(key: keyof Base): boolean {
    try {
      this._data.get(key)?.complete()
    } catch (e) {
      // do nothing
    }
    return this._data.delete(key)
  }

  forEach(callbackfn: (value: Base[keyof Base], key: keyof Base, map: Map<keyof Base, Base[keyof Base]>) => void, thisArg?: any): void {
    const tempMap = new Map<keyof Base, Base[keyof Base]>(Array.from(this._data.entries()).map(([key, sub]) => [key, sub.getValue()]))
    return tempMap.forEach(callbackfn)
  }

  get(key: keyof Base): Base[keyof Base] | undefined {
    return this._data.get(key)?.getValue()
  }

  has(key: keyof Base): boolean {
    return this._data.has(key)
  }

  set(key: keyof Base, value: Base[keyof Base]): this {
    const sub = this._data.get(key)
    if (sub) {
      sub?.next(value)
    } else {
      this.addSubject(key, value)
    }
    return this
  }

  entries(): IterableIterator<[keyof Base, Base[keyof Base]]> {
    const mappedEntries: Array<[keyof Base, Base[keyof Base]]> = Array.from(this._data.entries()).map(([key, sub]) => [key, sub.getValue()])
    return mappedEntries.values()
  }

  keys(): IterableIterator<keyof Base> {
    return this._data.keys()
  }

  values(): IterableIterator<Base[keyof Base]> {
    return Array.from(this._data.values())
      .map((sub) => sub.getValue())
      .values()
  }

  [Symbol.iterator](): IterableIterator<[keyof Base, Base[keyof Base]]> {
    return this.entries()
  }

  [Symbol.toStringTag]: string = 'StateStore'

  toObject(): Base {
    return Object.fromEntries(this.entries()) as Base
  }

  // ---
  /**
   * Watch the specified field for changes, and emit when they do
   * This returns a BehaviorSubject, meaning it will immediately emit the current value
   * @param field - the value to watch for changes
   * @returns a subject which contains the latest value on change
   */
  watch(field: keyof Base, opts: ObserveOpts = {}): Observable<Base[keyof Base]> {
    const sub = this._data.get(field)
    if (!sub) {
      throw Error(`${String(field)} is not a known field of this store.`)
    }

    return sub.pipe(skip(opts.skipInitialValue ? 1 : 0), debounceTime(opts.debounceMS ?? 0))
  }

  watchSeveral(fields: Array<keyof Base>, opts: ObserveOpts = {}): Observable<Record<keyof Base, Base[keyof Base]>> {
    const subs: Observable<{ field: keyof Base; data: Base[keyof Base] }>[] = []
    for (const field of new Set(fields)) {
      const sub = this.watch(field)
      subs.push(sub.pipe(map((data) => ({ field, data }))))
    }
    return combineLatest(subs).pipe(
      map((vals) => {
        const total = new Map<keyof Base, Base[keyof Base]>()
        for (const { field, data } of vals) {
          total.set(field, data as Base[keyof Base])
        }
        return Object.fromEntries(total.entries()) as Record<keyof Base, Base[keyof Base]>
      }),
      skip(opts.skipInitialValue ? 1 : 0),
      debounceTime(opts.debounceMS ?? 0)
    )
  }

  watchAll(opts: ObserveOpts = {}): Observable<Base> {
    return this._changeSubject.pipe(skip(opts.skipInitialValue ? 1 : 0), debounceTime(opts.debounceMS ?? 0))
  }

  protected teardown() {
    for (const sub of this._data.values()) {
      try {
        sub?.complete()
      } catch (e) {
        // do nothing
      }
    }
    this._data.clear()
    this._innerSubscriptions.forEach((sub) => {
      try {
        if (!sub.closed) {
          sub.unsubscribe()
        }
      } catch (e) {
        // do nothing
      }
    })
  }
}
