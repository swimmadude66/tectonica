import { BehaviorSubject, Observable } from '../libs/rxjs';
interface StateStoreOpts {
}
export interface ObserveOpts {
    skipInitialValue?: boolean;
    debounceMS?: number;
}
/**
 * A utility class which allows watching for changes via rxjs subjects. Updating a value in the store notifies all listeners.
 * Useful as a global state management system or as a singular field in a larger manager
*/
export declare class StateStore<Base extends {
    [key: string | number | symbol]: any;
}> implements Map<keyof Base, Base[keyof Base]> {
    protected _data: Map<keyof Base, BehaviorSubject<Base[keyof Base]>>;
    protected _changeSubject: BehaviorSubject<Base>;
    private _innerSubscriptions;
    get size(): number;
    constructor(base: Base, opts?: StateStoreOpts);
    private addSubject;
    clear(): void;
    delete(key: keyof Base): boolean;
    forEach(callbackfn: (value: Base[keyof Base], key: keyof Base, map: Map<keyof Base, Base[keyof Base]>) => void, thisArg?: any): void;
    get(key: keyof Base): Base[keyof Base] | undefined;
    has(key: keyof Base): boolean;
    set(key: keyof Base, value: Base[keyof Base]): this;
    entries(): IterableIterator<[keyof Base, Base[keyof Base]]>;
    keys(): IterableIterator<keyof Base>;
    values(): IterableIterator<Base[keyof Base]>;
    [Symbol.iterator](): IterableIterator<[keyof Base, Base[keyof Base]]>;
    [Symbol.toStringTag]: string;
    toObject(): Base;
    /**
    * Watch the specified field for changes, and emit when they do
    * This returns a BehaviorSubject, meaning it will immediately emit the current value
    * @param field - the value to watch for changes
    * @returns a subject which contains the latest value on change
    */
    watch(field: keyof Base, opts?: ObserveOpts): Observable<Base[keyof Base]>;
    watchSeveral(fields: Array<keyof Base>, opts?: ObserveOpts): Observable<Record<keyof Base, Base[keyof Base]>>;
    watchAll(opts?: ObserveOpts): Observable<Base>;
    protected teardown(): void;
}
export {};
