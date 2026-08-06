import { signal, hasCurrentEffect } from "../reactivity/signal";
import { Signal } from "../types";
import { DEBUG } from "../utils/helpers";

const storeCache = new WeakMap<object, any>();
const reactiveProxies = new WeakSet<object>();
const fieldSignals = new WeakMap<object, Map<PropertyKey, Signal<any>>>();
const scopeVersionMap = new WeakMap<object, Signal<number>>();
const parentVersionMap = new WeakMap<object, Set<Signal<number>>>();
const versionParents = new WeakMap<Signal<number>, Set<Signal<number>>>();

export const SCOPE_VERSION = Symbol.for("gyos_scope_version");

function bumpScopeVersion(target: object) {
    const version = ensureVersion(target);
    const visited = new Set<Signal<number>>();

    const bumpSignal = (ver: Signal<number>) => {
        if (visited.has(ver)) return;
        visited.add(ver);
        ver.value = ver.value + 1;
        const parents = versionParents.get(ver);
        if (parents) {
            parents.forEach(parentVer => bumpSignal(parentVer));
        }
    };

    bumpSignal(version);
}

function isBuiltInObject(obj: any): boolean {
    return (
        obj instanceof Date ||
        obj instanceof RegExp ||
        obj instanceof Map ||
        obj instanceof Set ||
        obj instanceof WeakMap ||
        obj instanceof WeakSet ||
        obj instanceof Promise
    );
}

function isReservedKey(key: PropertyKey): boolean {
    if (typeof key !== "string") return false;
    const lifecycleKeys = ['onMount', 'onUpdate', 'onUnmount'];
    return key.startsWith("__gyos_") || key.startsWith("$") || lifecycleKeys.includes(key);
}

function getFieldSignal(
    target: object,
    key: PropertyKey,
    initial: any,
): Signal<any> {
    let map = fieldSignals.get(target);
    if (!map) {
        map = new Map();
        fieldSignals.set(target, map);
    }

    let sig = map.get(key);
    if (!sig) {
        sig = signal(initial, DEBUG() ? `(${key.toString()})` : undefined);
        map.set(key, sig);
    }
    return sig;
}

const STORE_MARKER = Symbol.for('gyos.store');

export function markStore<T extends object>(obj: T): T {
    if (obj.hasOwnProperty(STORE_MARKER)) return obj;
    Reflect.defineProperty(obj, STORE_MARKER, {
        value: true,
        enumerable: false,
    });
    return obj;
}

export function isStoreObject(val: any): boolean {
    return !!(val && (val as any)[STORE_MARKER]);
}

// markRaw: đánh dấu object để reactive() bỏ qua, không tạo proxy
const RAW_MARKER = Symbol.for('gyos.raw');

export function markRaw<T extends object>(obj: T): T {
    if (obj.hasOwnProperty(RAW_MARKER)) return obj;
    Reflect.defineProperty(obj, RAW_MARKER, {
        value: true,
        enumerable: false,
    });
    return obj;
}

function isRawObject(val: any): boolean {
    return !!(val && (val as any)[RAW_MARKER]);
}

// shallow: chỉ reactive "lớp ngoài", không reactive sâu bên trong
const SHALLOW_MARKER = Symbol.for('gyos.shallow');

export function shallow<T extends object>(obj: T): T {
    if (obj.hasOwnProperty(SHALLOW_MARKER)) return obj;
    Reflect.defineProperty(obj, SHALLOW_MARKER, {
        value: true,
        enumerable: false,
    });
    return obj;
}

function isShallowObject(val: any): boolean {
    return !!(val && (val as any)[SHALLOW_MARKER]);
}

function ensureVersion(target: object): Signal<number> {
    let ver = scopeVersionMap.get(target);
    if (!ver) {
        ver = signal(0);
        scopeVersionMap.set(target, ver);
    }
    return ver;
}

function linkParentVersion(child: object, parentVersion: Signal<number>): void {
    const childVersion = ensureVersion(child);

    let parents = parentVersionMap.get(child);
    if (!parents) {
        parents = new Set();
        parentVersionMap.set(child, parents);
    }
    parents.add(parentVersion);

    let versionParentsSet = versionParents.get(childVersion);
    if (!versionParentsSet) {
        versionParentsSet = new Set();
        versionParents.set(childVersion, versionParentsSet);
    }
    versionParentsSet.add(parentVersion);
}

export function reactive<T extends object>(raw: T): T {
    if (!raw || typeof raw !== "object" || isBuiltInObject(raw)) {
        return raw;
    }

    // Array methods such as filter/map can return arrays containing existing
    // reactive values. Reusing those proxies prevents independent signal caches.
    if (reactiveProxies.has(raw)) {
        return raw;
    }

    if (isRawObject(raw)) {
        return raw;
    }

    if (isStoreObject(raw)) {
        return raw;
    }

    if (storeCache.has(raw)) return storeCache.get(raw);

    let proxy: any;

    proxy = new Proxy(raw, {
        get(target, key, receiver) {
            const value = Reflect.get(target, key, receiver);
            // Không tạo signal cho property không phải own (vd forEach, map, filter...)
            if (!Object.prototype.hasOwnProperty.call(target, key)) {
                return value;
            }

            // symbol / key internal bỏ qua reactive
            if (typeof key === "symbol" || isReservedKey(key)) {
                return value;
            }

            if (isStoreObject(value)) {
                return value;
            }

            // Check if this is a getter property (computed property)
            const descriptor = Object.getOwnPropertyDescriptor(target, key);
            if (descriptor && descriptor.get) {
                // It's a getter - just return value, getter will track its own dependencies
                return value;
            }

            // function -> bind this = proxy
            if (typeof value === "function") {
                return value.bind(proxy);
            }

            // chỉ track/khởi tạo signal khi đang trong effect cần dependency
            const shouldTrack = hasCurrentEffect();
            const existingSig = fieldSignals.get(target)?.get(key);

            // Nếu value được markRaw → track field thôi, trả raw, không reactive sâu
            if (value && typeof value === "object" && isRawObject(value)) {
                if (shouldTrack) {
                    const sig = existingSig || getFieldSignal(target, key, value);
                    sig.value; // track field (vd state.config đổi toàn bộ object)
                }
                return value;
            }

            // object / array (non-store) → touch sig để track, rồi reactive sâu
            if (value && typeof value === "object" && !isBuiltInObject(value)) {
                const parentVersion = scopeVersionMap.get(target);
                if (!scopeVersionMap.has(value)) {
                    ensureVersion(value);
                }
                if (parentVersion) {
                    linkParentVersion(value, parentVersion);
                }
                if (shouldTrack) {
                    const sig = existingSig || getFieldSignal(target, key, value);
                    sig.value; // track dep trên field này (vd storeCart.items)
                }
                // target là shallow object → KHÔNG reactive sâu children
                if (isShallowObject(target)) {
                    return value; // trả thẳng child, không proxy
                }
                return reactive(value as any);
            }

            // primitive
            if (shouldTrack) {
                const sig = existingSig || getFieldSignal(target, key, value);
                return sig.value;
            }
            // nếu đã có signal thì lấy peek để luôn trả giá trị mới nhất
            if (existingSig) return (existingSig as any).peek;
            return value;
        },

        set(target, key, value, receiver) {
            // symbol / internal key → bypass
            if (typeof key === "symbol" || isReservedKey(key)) {
                return Reflect.set(target, key, value, receiver);
            }

            // Check if this is a setter property - just set and bump version
            const descriptor = Object.getOwnPropertyDescriptor(target, key);
            if (descriptor && descriptor.set) {
                const ok = Reflect.set(target, key, value, receiver);
                if (ok) bumpScopeVersion(target);
                return ok;
            }

            // capture old value BEFORE write to detect real changes
            const oldValue = (target as any)[key];

            // VALUE LÀ STORE → set thẳng, KHÔNG tạo signal, KHÔNG trigger
            if (isStoreObject(value)) {
                return Reflect.set(target, key, value, receiver);
            }

            const ok = Reflect.set(target, key, value, receiver);
            if (!ok) return false;

            // mọi thứ còn lại → có signal field
            const sig = getFieldSignal(target, key, value);

            if (!Object.is(oldValue, value)) {
                sig.value = value;
                bumpScopeVersion(target);
            }

            return true;
        },

        ownKeys(target) {
            return Reflect.ownKeys(target).filter(key => !isReservedKey(key));
        },

        getOwnPropertyDescriptor(target, key) {
            if (typeof key === "string" && isReservedKey(key)) return undefined;
            return Reflect.getOwnPropertyDescriptor(target, key);
        },

        deleteProperty(target, key) {
            if (typeof key === "symbol" || isReservedKey(key)) {
                return Reflect.deleteProperty(target, key);
            }

            const hadKey = Object.prototype.hasOwnProperty.call(target, key);
            const ok = Reflect.deleteProperty(target, key);

            if (ok && hadKey) {
                const sig = getFieldSignal(target, key, undefined);
                // set undefined để notify watcher đang subcribe field đó
                sig.value = undefined;
                bumpScopeVersion(target);
            }

            return ok;
        },

        defineProperty(target, key, descriptor) {
            if (typeof key === "symbol" || isReservedKey(key)) {
                return Reflect.defineProperty(target, key, descriptor);
            }
            const oldDesc = Object.getOwnPropertyDescriptor(target, key);
            const oldValue = oldDesc && "value" in oldDesc ? oldDesc.value : undefined;
            const newValue = "value" in descriptor ? descriptor.value : oldValue;

            const ok = Reflect.defineProperty(target, key, descriptor);
            if (!ok) return false;

            if ('value' in descriptor) {
                const sig = getFieldSignal(target, key, descriptor.value);
                sig.value = descriptor.value;

                if (!(oldDesc && Object.is(oldValue, newValue))) {
                    bumpScopeVersion(target);
                }
            }

            return true;
        },

    });

    // Preserve shared scope version on proxy (needed for structural effects)
    const existingVersion = scopeVersionMap.get(raw);
    if (existingVersion) {
        scopeVersionMap.set(proxy, existingVersion);
    }

    reactiveProxies.add(proxy);
    storeCache.set(raw, proxy);
    return proxy as T;
}

export function makeReactive<T extends object>(source: T): T {
    // tạo 1 version signal cho root scope
    const version = ensureVersion(source);

    const proxy = reactive(source);

    if (!proxy.hasOwnProperty(SCOPE_VERSION)) {
        Object.defineProperty(proxy, SCOPE_VERSION, {
            value: version,
            enumerable: false,
            configurable: false,
            writable: false,
        });    
    }

    return proxy as T;
}

/**
 * Internal helper to read the shared scope version for any reactive object/array.
 * Allows structural renderers to depend on list-level changes without subscribing
 * to every item/index signal.
 */
export function getScopeVersion(target: any): Signal<number> | undefined {
    return scopeVersionMap.get(target);
}
