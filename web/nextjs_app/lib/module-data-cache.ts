'use client';

import { useCallback, useEffect, useState, useRef, type Dispatch, type SetStateAction } from 'react';

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
  const [value, setValue] = useState<T>(() => {
    if (!key || !moduleData.has(key)) return initialValue;
    return moduleData.get(key) as T;
  });

  const currentValue = useRef(value);
  const initialValueRef = useRef(initialValue);

  useEffect(() => {
    if (key && moduleData.has(key)) {
      const cachedValue = moduleData.get(key) as T;
      currentValue.current = cachedValue;
      setValue(cachedValue);
      return;
    }
    currentValue.current = initialValueRef.current;
    setValue(initialValueRef.current);
  }, [key]);

  const updateValue = useCallback<Dispatch<SetStateAction<T>>>((nextValue) => {
    const resolved = typeof nextValue === 'function'
      ? (nextValue as (previous: T) => T)(currentValue.current)
      : nextValue;
    currentValue.current = resolved;
    if (key) moduleData.set(key, resolved);
    setValue(resolved);
  }, [key]);

  return [value, updateValue];
}
