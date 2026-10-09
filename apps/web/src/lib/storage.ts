import { useSyncExternalStore } from "react";

/**
 * A tiny localStorage-backed store. Reads are wrapped in try/catch because storage can be
 * missing (private mode, blocked site data); the app then just runs on defaults.
 */
export function createStore<T>(key: string, defaults: T) {
  let cache: T | null = null;
  const listeners = new Set<() => void>();

  function read(): T {
    if (cache) return cache;
    try {
      const raw = window.localStorage.getItem(key);
      cache = raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    } catch {
      cache = defaults;
    }
    return cache!;
  }

  function write(next: T) {
    cache = next;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Storage unavailable: keep the value in memory for this visit.
    }
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    get: () => (typeof window === "undefined" ? defaults : read()),
    set: (update: Partial<T> | ((prev: T) => T)) =>
      write(typeof update === "function" ? update(read()) : { ...read(), ...update }),
    /** Defaults on the server and during hydration, the stored value after. */
    use: () => useSyncExternalStore(subscribe, read, () => defaults),
  };
}
