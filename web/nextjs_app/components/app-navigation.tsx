'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '../lib/supabase';

type CompanyRole = 'owner' | 'admin' | 'manager' | 'staff';
type AppNavigationProps = { basePath: string; role?: CompanyRole; companyId?: string };
type NavItem = { label: string; shortLabel: string; href: string; active: boolean; icon: 'home' | 'users' | 'toy' | 'calendar' | 'team' | 'funnel' | 'map-pin' };

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

export function AppNavigation({ basePath, role, companyId }: AppNavigationProps) {
  const pathname = usePathname() ?? '';
  const [leadFestaEnabled, setLeadFestaEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    if (companyId && (role === 'owner' || role === 'admin') && supabase) {
      void supabase.rpc('leadfesta_is_available', { p_company_id: companyId }).then(({ data, error }) => {
        if (active) setLeadFestaEnabled(!error && data === true);
      });
    }
    return () => { active = false; };
  }, [companyId, role]);

  const isCustomers = pathname.endsWith('/app/customers') || pathname.endsWith('/app/customers/');
  const isProducts = pathname.endsWith('/app/products') || pathname.endsWith('/app/products/');
  const isRentals = pathname.endsWith('/app/rentals') || pathname.endsWith('/app/rentals/');
  const isTeam = pathname.endsWith('/equipe') || pathname.endsWith('/equipe/');
  const isLeadFesta = (pathname.endsWith('/app/leads') || pathname.endsWith('/app/leads/')) && !pathname.includes('/prospeccao');
  const isProspecting = pathname.includes('/app/leads/prospeccao');
  const isDashboard = !isCustomers && !isProducts && !isRentals && !isTeam && !isLeadFesta && !isProspecting;
  const items: NavItem[] = [
    { label: 'Visão geral', shortLabel: 'Início', href: basePath + '/app/', active: isDashboard, icon: 'home' },
    { label: 'Clientes', shortLabel: 'Clientes', href: basePath + '/app/customers/', active: isCustomers, icon: 'users' },
    { label: 'Brinquedos e serviços', shortLabel: 'Brinquedos', href: basePath + '/app/products/', active: isProducts, icon: 'toy' },
    { label: 'Locações', shortLabel: 'Locações', href: basePath + '/app/rentals/', active: isRentals, icon: 'calendar' },
    ...(leadFestaEnabled ? [
      { label: 'LeadFesta', shortLabel: 'Leads', href: basePath + '/app/leads/', active: isLeadFesta, icon: 'funnel' as const },
      { label: 'Prospectar empresas', shortLabel: 'Prospectar', href: basePath + '/app/leads/prospeccao/', active: isProspecting, icon: 'map-pin' as const },
    ] : []),
    ...(role === 'owner' || role === 'admin' ? [{ label: 'Gerenciar equipe', shortLabel: 'Equipe', href: basePath + '/equipe/', active: isTeam, icon: 'team' as const }] : []),
  ];
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
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-purple-100 bg-white/95 px-2 pt-2 shadow-[0_-8px_30px_rgba(37,20,70,0.08)] backdrop-blur-lg md:hidden"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto grid max-w-xl grid-cols-4 gap-1">
          {items.map((item) => <a key={item.href} href={item.href} aria-current={item.active ? 'page' : undefined}
            className={item.active
              ? 'flex min-h-[4.5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-xl bg-purple-50 px-1 py-2 text-[11px] font-bold leading-tight text-[#6840bd]'
              : 'flex min-h-[4.5rem] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium leading-tight text-gray-600 transition active:bg-purple-50'}>
            <NavIcon name={item.icon} />
            <span className="max-w-full whitespace-normal text-center">{item.shortLabel}</span>
            <span className={item.active ? 'h-1 w-4 rounded-full bg-[#ffd34e]' : 'h-1 w-4'} />
          </a>)}
        </div>
      </div>
    </nav>
  );
}
