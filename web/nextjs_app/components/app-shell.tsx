'use client';

import { useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { AppNavigation } from './app-navigation';
import { WebPushControl } from './web-push-control';

type CompanyRole = 'platform_owner' | 'admin' | 'staff';
const REALTIME_TABLES = [
  'company_members', 'customers', 'products', 'product_units', 'rentals',
  'rental_items', 'rental_item_units', 'rental_responsibles', 'rental_events',
  'rental_quotes', 'rental_quote_items', 'rental_contracts',
  'financial_transactions', 'payments', 'leads', 'lead_activities',
  'lead_pipeline_stages', 'documents', 'maintenance_records', 'stock_movements',
  'occurrence_reports', 'occurrence_photos', 'team_conversations',
  'team_conversation_members', 'team_messages',
] as const;

type AppShellProps = {
  companyName: string;
  email: string;
  role?: CompanyRole;
  companyId?: string;
  basePath: string;
  signingOut: boolean;
  onSignOut: () => void;
  children: ReactNode;
};

export function AppShell({
  companyName,
  email,
  role,
  companyId,
  basePath,
  signingOut,
  onSignOut,
  children,
}: AppShellProps) {
  useEffect(() => {
    if (!companyId || !supabase) return;
    const pendingTables = new Set<string>();
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`kidsloc-company-${companyId}-realtime`);
    for (const table of REALTIME_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        const next = payload.new as Record<string, unknown>;
        const previous = payload.old as Record<string, unknown>;
        const changedCompany = next?.company_id ?? previous?.company_id;
        if (changedCompany !== companyId) return;
        pendingTables.add(table);
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          for (const changedTable of pendingTables) {
            window.dispatchEvent(new CustomEvent('kidsloc:company-data-changed', {
              detail: { companyId, table: changedTable },
            }));
          }
          pendingTables.clear();
        }, 180);
      });
    }
    channel.subscribe();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [companyId]);

  return (
    <div className="app-shell-root min-h-screen bg-[#f8f7fc] text-gray-900">
      <header className="border-b border-purple-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href={basePath + '/app/'} className="flex min-w-0 items-center gap-3" aria-label="KidsLoc, página inicial">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#8054d8] text-xl font-black text-white">K</span>
            <span className="truncate text-xl font-bold tracking-tight">KidsLoc <span className="text-[#8054d8]">App</span></span>
          </a>
          <button type="button" onClick={onSignOut} disabled={signingOut}
            className="shrink-0 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-purple-200 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4">
            {signingOut ? 'Saindo...' : 'Sair'}
          </button>
        </div>
      </header>
      <div className="app-shell-layout mx-auto grid max-w-7xl gap-6 px-3 py-6 pb-24 sm:px-6 md:grid-cols-[230px_minmax(0,1fr)] md:py-8 md:pb-8 lg:px-8">
        <aside className="app-shell-sidebar min-w-0 md:sticky md:top-6 md:self-start">
          <div className="mb-4 hidden rounded-2xl border border-purple-100 bg-white p-4 md:block">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Empresa</p>
            <p className="mt-1 break-words font-bold text-gray-900">{companyName}</p>
            <p className="mt-2 break-all text-xs leading-5 text-gray-500">{email}</p>
          </div>
          <AppNavigation basePath={basePath} role={role} companyId={companyId} />
        </aside>
        <main className="app-shell-main min-w-0">
          {companyId && <WebPushControl companyId={companyId} basePath={basePath} />}
          {children}
        </main>
      </div>
    </div>
  );
}
