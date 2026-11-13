'use client';

import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT = '(min-width: 768px)';

export function useResponsivePageSize(mobilePageSize = 6, desktopPageSize = 21): number {
  const [pageSize, setPageSize] = useState(mobilePageSize);

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_BREAKPOINT);
    const updatePageSize = () => setPageSize(mediaQuery.matches ? desktopPageSize : mobilePageSize);

    updatePageSize();
    mediaQuery.addEventListener('change', updatePageSize);
    return () => mediaQuery.removeEventListener('change', updatePageSize);
  }, [mobilePageSize, desktopPageSize]);

  return pageSize;
}
