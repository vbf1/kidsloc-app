'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

const moduleData = new Map<string, unknown>();

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

  useEffect(() => {
    currentValue.current = value;
  }, [key, value]);

  const updateValue = useCallback<Dispatch<SetStateAction<T>>>((nextValue) => {
    const resolved = typeof nextValue === 'function'
      ? (nextValue as (previous: T) => T)(currentValue.current)
      : nextValue;
    currentValue.current = resolved;
    if (key) moduleData.set(key, resolved);
    setStored({ key, value: resolved });
  }, [key]);

  return [value, updateValue];
}
