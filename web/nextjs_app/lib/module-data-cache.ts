'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

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

  useEffect(() => {
    if (!key || !moduleData.has(key)) return;
    setValue(moduleData.get(key) as T);
  }, [key]);

  const updateValue = useCallback<Dispatch<SetStateAction<T>>>((nextValue) => {
    setValue((current) => {
      const resolved = typeof nextValue === 'function'
        ? (nextValue as (previous: T) => T)(current)
        : nextValue;
      if (key) moduleData.set(key, resolved);
      return resolved;
    });
  }, [key]);

  return [value, updateValue];
}
