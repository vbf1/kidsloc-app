'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../lib/supabase';

type CompanyRole = 'owner' | 'admin' | 'manager' | 'staff';
type AppNavigationProps = { basePath: string; role?: CompanyRole; companyId?: string };
type NavItem = {
  label: string;
  shortLabel: string;
  href: string;
  active: boolean;
  icon: 'home' | 'users' | 'toy' | 'calendar' | 'team' | 'funnel' | 'map-pin';
};

function NavIcon({ name }: { name: NavItem['icon'] }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 shrink-0" {...common}>
      {name === 'home' && <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>}
      {name === 'users' && <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A5.5 5.5 0 0 1 9 13h1" /><path d="M16 11a3 3 0 1 0-2.5-4.7M14 14a5 5 0 0 1 6.5 4.8V20h-5" /></>}
      {name === 'toy' && <><path d="M5 9.5 12 5l7 4.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5z" /><path d="M9 20v-6h6v6M8 9h.01M16 9h.01" /></>}
      {name === 'calendar' && <><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M7.5 3v4M16.5 3v4M3.5 10h17M8 14h3M8 17h3" /></>}
      {name === 'team' && <><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1.5A5.5 5.5 0 0 1 9 13h.5M16 13v7M12.5 16.5h7" /><path d="M16 10a2.5 2.5 0 1 0-1.5-4.5" /></>}
      {name === 'funnel' && <><path d="M3 4h18l-7 8v6l-4 2v-8L3 4z" /><path d="M7 7h10" /></>}
      {name === 'map-pin' && <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>}
    </svg>
  );
}

function MoreIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {open ? <path d="m6 6 12 12M18 6 6 18" /> : <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>}
    </svg>
  );
}

export function AppNavigation({ basePath, role, companyId }: AppNavigationProps) {
  const pathname = usePathname() ?? '';
  const [leadFestaEnabled, setLeadFestaEnabled] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (companyId && (role === 'owner' || role === 'admin') && supabase) {
      void supabase.rpc('leadfesta_is_available', { p_company_id: companyId }).then(({ data, error }) => {
        if (active) setLeadFestaEnabled(!error && data === true);
      });
    }
    return () => { active = false; };
  }, [companyId, role]);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [moreOpen]);

  const isCustomers = pathname.endsWith('/app/customers') || pathname.endsWith('/app/customers/');
  const isProducts = pathname.endsWith('/app/products') || pathname.endsWith('/app/products/');
  const isRentals = pathname.endsWith('/app/rentals') || pathname.endsWith('/app/rentals/');
  const isQuotes = pathname.endsWith('/app/quotes') || pathname.endsWith('/app/quotes/');
  const isFinance = pathname.endsWith('/app/finance') || pathname.endsWith('/app/finance/');
  const isContracts = pathname.endsWith('/app/contracts') || pathname.endsWith('/app/contracts/');
  const isCalendar = pathname.endsWith('/app/calendar') || pathname.endsWith('/app/calendar/');
  const isTeam = pathname.endsWith('/equipe') || pathname.endsWith('/equipe/');
  const isLeadFesta = (pathname.endsWith('/app/leads') || pathname.endsWith('/app/leads/')) && !pathname.includes('/prospeccao');
  const isProspecting = pathname.includes('/app/leads/prospeccao');
  const isDashboard = !isCustomers && !isProducts && !isRentals && !isQuotes && !isFinance && !isContracts && !isCalendar && !isTeam && !isLeadFesta && !isProspecting;

  const items: NavItem[] = [
    { label: 'Visão geral', shortLabel: 'Início', href: basePath + '/app/', active: isDashboard, icon: 'home' },
    { label: 'Clientes', shortLabel: 'Clientes', href: basePath + '/app/customers/', active: isCustomers, icon: 'users' },
    { label: 'Brinquedos e serviços', shortLabel: 'Brinquedos', href: basePath + '/app/products/', active: isProducts, icon: 'toy' },
    { label: 'Locações', shortLabel: 'Locações', href: basePath + '/app/rentals/', active: isRentals, icon: 'calendar' },
    { label: 'Orçamentos', shortLabel: 'Orçamentos', href: basePath + '/app/quotes/', active: isQuotes, icon: 'toy' },
    { label: 'Financeiro', shortLabel: 'Financeiro', href: basePath + '/app/finance/', active: isFinance, icon: 'home' },
    { label: 'Contratos', shortLabel: 'Contratos', href: basePath + '/app/contracts/', active: isContracts, icon: 'toy' },
    { label: 'Agenda', shortLabel: 'Agenda', href: basePath + '/app/calendar/', active: isCalendar, icon: 'calendar' },
    ...(leadFestaEnabled ? [
      { label: 'LeadFesta', shortLabel: 'Leads', href: basePath + '/app/leads/', active: isLeadFesta, icon: 'funnel' as const },
      { label: 'Prospectar empresas', shortLabel: 'Prospectar', href: basePath + '/app/leads/prospeccao/', active: isProspecting, icon: 'map-pin' as const },
    ] : []),
    ...(role === 'owner' || role === 'admin' ? [{ label: 'Gerenciar equipe', shortLabel: 'Equipe', href: basePath + '/equipe/', active: isTeam, icon: 'team' as const }] : []),
  ];

  const primaryItems = items.slice(0, 3);
  const moreItems = items.slice(3);
  const moreIsActive = moreItems.some((item) => item.active);

  return (
    <nav aria-label="Navegação principal">
      <div className="hidden md:block">
        <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">Menu principal</p>
        <div className="space-y-1.5">
          {items.map((item) => <a key={item.href} href={item.href} aria-current={item.active ? 'page' : undefined}
            className={item.active
              ? 'relative flex items-center gap-3 rounded-2xl bg-[#8054d8] px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-purple-200/60'
              : 'flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-medium text-gray-600 transition hover:bg-white hover:text-[#6840bd]'}>
            <NavIcon name={item.icon} />{item.label}
            {item.active && <span className="ml-auto size-2 rounded-full bg-[#ffd34e]" />}
          </a>)}
        </div>
      </div>

      <div className="md:hidden">
        {moreOpen && <>
          <button type="button" aria-label="Fechar menu Mais" onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-40 bg-slate-950/20" />
          <section id="mobile-more-menu" aria-label="Mais opções de navegação" className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-md overflow-hidden rounded-2xl border border-purple-100 bg-white p-2 shadow-[0_12px_40px_rgba(37,20,70,0.18)]">
            <div className="px-3 pb-2 pt-2">
              <p className="text-sm font-bold text-gray-900">Mais opções</p>
              <p className="mt-0.5 text-xs text-gray-500">Acesse os outros módulos do KidsLoc</p>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {moreItems.map((item) => <a key={item.href} href={item.href} onClick={() => setMoreOpen(false)} aria-current={item.active ? 'page' : undefined}
                className={item.active
                  ? 'flex min-h-14 items-center gap-3 rounded-xl bg-purple-50 px-3 py-3 text-sm font-semibold text-[#6840bd]'
                  : 'flex min-h-14 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 active:bg-purple-50'}>
                <span className={item.active ? 'grid size-9 shrink-0 place-items-center rounded-xl bg-white text-[#6840bd]' : 'grid size-9 shrink-0 place-items-center rounded-xl bg-gray-100 text-gray-600'}>
                  <NavIcon name={item.icon} />
                </span>
                <span className="leading-tight">{item.label}</span>
              </a>)}
            </div>
          </section>
        </>}

        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200/80 bg-white/95 px-3 pt-2 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur-xl"
          style={{ paddingBottom: 'max(0.4rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
            {primaryItems.map((item) => <a key={item.href} href={item.href} onClick={() => setMoreOpen(false)} aria-current={item.active ? 'page' : undefined}
              className={item.active
                ? 'relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-[#6840bd]'
                : 'relative flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium text-gray-500 transition active:bg-gray-50'}>
              <NavIcon name={item.icon} />
              <span className="max-w-full truncate px-1">{item.shortLabel}</span>
              {item.active && <span className="absolute bottom-0 h-0.5 w-7 rounded-full bg-[#8054d8]" />}
            </a>)}
            <button type="button" onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen}
              aria-controls="mobile-more-menu" aria-label={moreOpen ? 'Fechar mais opções' : 'Abrir mais opções'}
              className={moreOpen || moreIsActive
                ? 'flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-[#6840bd]'
                : 'flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium text-gray-500 transition active:bg-gray-50'}>
              <MoreIcon open={moreOpen} />
              <span>Mais</span>
              {moreIsActive && <span className="h-0.5 w-7 rounded-full bg-[#8054d8]" />}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
