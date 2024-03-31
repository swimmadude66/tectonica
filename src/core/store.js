import { BehaviorSubject, debounceTime, map, combineLatest, skip } from '../libs/rxjs';
/**
 * A utility class which allows watching for changes via rxjs subjects. Updating a value in the store notifies all listeners.
 * Useful as a global state management system or as a singular field in a larger manager
*/
export class StateStore {
    _data = new Map();
    _changeSubject;
    _innerSubscriptions = [];
    get size() {
        return this._data.size;
    }
    constructor(base, opts) {
        this._changeSubject = new BehaviorSubject(base);
        for (let key in base) {
            const baseVal = base[key];
            this.addSubject(key, baseVal);
        }
    }
    addSubject(key, initialVal) {
        const sub = new BehaviorSubject(initialVal);
        this._innerSubscriptions.push(sub.subscribe((change) => {
            const currVal = this._changeSubject.getValue();
            this._changeSubject.next({ ...currVal, [key]: change });
        }, (err) => { }, () => {
            const currVal = this._changeSubject.getValue();
            this._changeSubject.next({ ...currVal, [key]: undefined });
        }));
        this._data.set(key, sub);
    }
    clear() {
        this.teardown();
        // TODO: emit change event on top-level change subject
    }
    delete(key) {
        try {
            this._data.get(key)?.complete();
        }
        catch (e) {
            // do nothing
        }
        finally {
            return this._data.delete(key);
        }
    }
    forEach(callbackfn, thisArg) {
        const tempMap = new Map((Array.from(this._data.entries()).map(([key, sub]) => [key, sub.getValue()])));
        return tempMap.forEach(callbackfn);
    }
    get(key) {
        return this._data.get(key)?.getValue();
    }
    has(key) {
        return this._data.has(key);
    }
    set(key, value) {
        const sub = this._data.get(key);
        if (sub) {
            sub?.next(value);
        }
        else {
            this.addSubject(key, value);
        }
        return this;
    }
    entries() {
        const mappedEntries = Array.from(this._data.entries()).map(([key, sub]) => [key, sub.getValue()]);
        return mappedEntries.values();
    }
    keys() {
        return this._data.keys();
    }
    values() {
        return Array.from(this._data.values()).map((sub) => sub.getValue()).values();
    }
    [Symbol.iterator]() {
        return this.entries();
    }
    [Symbol.toStringTag] = 'StateStore';
    toObject() {
        return Object.fromEntries(this.entries());
    }
    // ---
    /**
    * Watch the specified field for changes, and emit when they do
    * This returns a BehaviorSubject, meaning it will immediately emit the current value
    * @param field - the value to watch for changes
    * @returns a subject which contains the latest value on change
    */
    watch(field, opts = {}) {
        const sub = this._data.get(field);
        if (!sub) {
            throw Error(`${String(field)} is not a known field of this store.`);
        }
        return sub.pipe(skip(opts.skipInitialValue ? 1 : 0), debounceTime(opts.debounceMS ?? 0));
    }
    watchSeveral(fields, opts = {}) {
        const subs = [];
        for (const field of new Set(fields)) {
            const sub = this.watch(field);
            subs.push(sub.pipe(map((data) => ({ field, data }))));
        }
        return combineLatest(subs).pipe(map((vals) => {
            const total = new Map();
            for (const { field, data } of vals) {
                total.set(field, data);
            }
            return Object.fromEntries(total.entries());
        }), skip(opts.skipInitialValue ? 1 : 0), debounceTime(opts.debounceMS ?? 0));
    }
    watchAll(opts = {}) {
        return this._changeSubject.pipe(skip(opts.skipInitialValue ? 1 : 0), debounceTime(opts.debounceMS ?? 0));
    }
    teardown() {
        for (const sub of this._data.values()) {
            try {
                sub?.complete();
            }
            catch (e) {
                // do nothing
            }
        }
        this._data.clear();
        this._innerSubscriptions.forEach((sub) => {
            try {
                if (!sub.closed) {
                    sub.unsubscribe();
                }
            }
            catch (e) {
                // do nothing
            }
        });
    }
}
//# sourceMappingURL=store.js.map