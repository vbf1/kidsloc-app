'use client';

import { useEffect, useState } from 'react';

const DESKTOP_BREAKPOINT = '(min-width: 1024px)';

export function useResponsivePageSize(mobilePageSize = 6, desktopPageSize = 21): number {
  const [pageSize, setPageSize] = useState(mobilePageSize);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_BREAKPOINT);
    const updatePageSize = () => setPageSize(mediaQuery.matches ? desktopPageSize : mobilePageSize);

    updatePageSize();
    mediaQuery.addEventListener('change', updatePageSize);
    return () => mediaQuery.removeEventListener('change', updatePageSize);
  }, [mobilePageSize, desktopPageSize]);

  return pageSize;
}
