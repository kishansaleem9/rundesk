import { useMemo, useSyncExternalStore } from "react";

/*
 * Subscribable wrapper around localStorage.
 *
 * Components read persisted UI preferences through useStoredValue and
 * friends, and write them through writeStorage. Every hook re-renders when
 * writeStorage runs anywhere in the app (or another tab changes the key),
 * so components no longer copy storage into React state inside effects.
 */

const STORAGE_EVENT = "rundesk:storage";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(STORAGE_EVENT, listener);

  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(STORAGE_EVENT, listener);
  };
}

function getServerSnapshot() {
  return null;
}

export function readStorage(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Storage can be unavailable (private mode, quota). The UI still works.
  }

  window.dispatchEvent(new CustomEvent(STORAGE_EVENT, { detail: key }));
}

/** Raw string stored under `key`, or null. Safe during server rendering. */
export function useStoredValue(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readStorage(key),
    getServerSnapshot,
  );
}

/** True when the stored value is the string "true". */
export function useStoredFlag(key: string): boolean {
  return useStoredValue(key) === "true";
}

export function parseStoredSet(raw: string | null): Set<string> {
  if (!raw) {
    return new Set<string>();
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set<string>(
      parsed.filter((item): item is string => typeof item === "string"),
    );
  } catch {
    return new Set<string>();
  }
}

export function serializeSet(value: Set<string>) {
  return JSON.stringify([...value]);
}

/** A Set<string> persisted as a JSON array under `key`. */
export function useStoredSet(key: string): Set<string> {
  const raw = useStoredValue(key);

  return useMemo(() => parseStoredSet(raw), [raw]);
}

export function parseStoredList<T>(raw: string | null): T[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
