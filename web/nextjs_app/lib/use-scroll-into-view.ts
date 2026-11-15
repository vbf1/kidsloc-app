'use client';

import { useEffect } from 'react';

type ScrollTarget<T extends HTMLElement> = { current: T | null };

export function useScrollIntoViewOnChange<T extends HTMLElement>(
  target: ScrollTarget<T>,
  trigger: string | number | null | undefined,
) {
  useEffect(() => {
    if (trigger === null || trigger === undefined || trigger === '') return;
    const frame = window.requestAnimationFrame(() => {
      target.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [target, trigger]);
}
