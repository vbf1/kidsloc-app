'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

const moduleData = new Map<string, unknown>();

export function clearModuleDataCache(): void {
  moduleData.clear();
}

/** Seed a module cache before its page is opened. Scope is always user + company. */
export function setModuleData<T>(moduleName: string, field: string, scope: string, value: T): void {
  const key = cacheKey(moduleName, scope, field);
  if (key) moduleData.set(key, value);
}

function cacheKey(moduleName: string, scope: string, field: string) {
  return scope ? `kidsloc:${scope}:${moduleName}:${field}` : '';
}

/** In-memory data cache for fast client-side navigation. It never grants access. */
export function hasModuleData(moduleName: string, scope: string): boolean {
  if (!scope) return false;
  const prefix = `kidsloc:${scope}:${moduleName}:`;
  for (const key of moduleData.keys()) if (key.startsWith(prefix)) return true;
  return false;
}

export function useModuleData<T>(
  moduleName: string,
  field: string,
  scope: string,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const key = cacheKey(moduleName, scope, field);
  const [stored, setStored] = useState<{ key: string; value: T }>(() => ({
    key,
    value: key && moduleData.has(key) ? moduleData.get(key) as T : initialValue,
  }));
  const value = stored.key === key
    ? stored.value
    : key && moduleData.has(key) ? moduleData.get(key) as T : initialValue;
  const currentValue = useRef(value);
  const currentKey = useRef(key);

  useEffect(() => {
    currentValue.current = value;
    currentKey.current = key;
  }, [key, value]);

  const updateValue = useCallback<Dispatch<SetStateAction<T>>>((nextValue) => {
    const resolved = typeof nextValue === 'function'
      ? (nextValue as (previous: T) => T)(currentValue.current)
      : nextValue;
    currentValue.current = resolved;
    const activeKey = currentKey.current;
    if (activeKey) moduleData.set(activeKey, resolved);
    setStored({ key: activeKey, value: resolved });
  }, []);

  return [value, updateValue];
}
