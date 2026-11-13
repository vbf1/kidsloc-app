'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
type AppNavigationProps = { basePath: string };
export function AppNavigation({ basePath }: AppNavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname() ?? '';
  const dashboardHref = basePath + '/app/';
  const customersHref = basePath + '/app/customers/';
  const isCustomers = pathname.endsWith('/app/customers') || pathname.endsWith('/app/customers/');
  const dashboardClass = isCustomers
    ? 'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-purple-50 hover:text-[#6840bd]'
    : 'flex items-center gap-3 rounded-xl bg-purple-50 px-4 py-3 text-sm font-semibold text-[#6840bd]';
  const customersClass = isCustomers
    ? 'flex items-center gap-3 rounded-xl bg-purple-50 px-4 py-3 text-sm font-semibold text-[#6840bd]'
    : 'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-purple-50 hover:text-[#6840bd]';
  return (
    <nav aria-label="Navegação principal" className="w-full">
      <button type="button" aria-expanded={mobileOpen} aria-controls="kidsloc-primary-navigation"
        onClick={() => setMobileOpen((open) => !open)}
        className="flex w-full items-center justify-between rounded-xl border border-purple-100 bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-sm md:hidden">
        Menu <span aria-hidden="true" className="text-lg text-[#8054d8]">{mobileOpen ? '−' : '+'}</span>
      </button>
      <div id="kidsloc-primary-navigation" className={mobileOpen ? 'mt-3 block md:mt-0' : 'hidden md:mt-0 md:block'}>
        <div className="space-y-2">
          <a href={dashboardHref} aria-current={!isCustomers ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={dashboardClass}>
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-white text-base">⌂</span>Visão geral
          </a>
          <a href={customersHref} aria-current={isCustomers ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={customersClass}>
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-white text-base">♙</span>Clientes
          </a>
        </div>
      </div>
    </nav>
  );
}
