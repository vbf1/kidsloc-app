'use client';

import { useEffect, useRef } from 'react';

type RealtimeDetail = { companyId?: string; table?: string };

export function useCompanyRealtimeRefresh(
  companyId: string | null | undefined,
  tables: readonly string[],
  refresh: () => void,
) {
  const refreshRef = useRef(refresh);
  const tableKey = tables.join('|');

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!companyId) return;
    const acceptedTables = new Set(tableKey.split('|'));
    const handleChange = (event: Event) => {
      const detail = (event as CustomEvent<RealtimeDetail>).detail;
      if (detail?.companyId === companyId && detail.table && acceptedTables.has(detail.table)) {
        refreshRef.current();
      }
    };
    window.addEventListener('kidsloc:company-data-changed', handleChange);
    return () => window.removeEventListener('kidsloc:company-data-changed', handleChange);
  }, [companyId, tableKey]);
}
