'use client';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
type AppNavigationProps = { basePath: string };
export function AppNavigation({ basePath }: AppNavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname() ?? '';
  const dashboardHref = basePath + '/app/';
  const customersHref = basePath + '/app/customers/';
  const productsHref = basePath + '/app/products/';
  const rentalsHref = basePath + '/app/rentals/';
  const isCustomers = pathname.endsWith('/app/customers') || pathname.endsWith('/app/customers/');
  const isProducts = pathname.endsWith('/app/products') || pathname.endsWith('/app/products/');
  const isRentals = pathname.endsWith('/app/rentals') || pathname.endsWith('/app/rentals/');
  const isDashboard = !isCustomers && !isProducts && !isRentals;
  const linkClass = 'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition';
  const activeClass = linkClass + ' bg-purple-50 text-[#6840bd]';
  const inactiveClass = linkClass + ' text-gray-700 hover:bg-purple-50 hover:text-[#6840bd]';
  return (
    <nav aria-label="Navegação principal" className="w-full">
      <button type="button" aria-expanded={mobileOpen} aria-controls="kidsloc-primary-navigation"
        onClick={() => setMobileOpen((open) => !open)}
        className="flex w-full items-center justify-between rounded-xl border border-purple-100 bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-sm md:hidden">
        Menu <span aria-hidden="true" className="text-lg text-[#8054d8]">{mobileOpen ? '−' : '+'}</span>
      </button>
      <div id="kidsloc-primary-navigation" className={mobileOpen ? 'mt-3 block md:mt-0' : 'hidden md:mt-0 md:block'}>
        <div className="space-y-2">
          <a href={dashboardHref} aria-current={isDashboard ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={isDashboard ? activeClass : inactiveClass}>
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-white text-base">⌂</span>Visão geral
          </a>
          <a href={customersHref} aria-current={isCustomers ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={isCustomers ? activeClass : inactiveClass}>
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-white text-base">♙</span>Clientes
          </a>
          <a href={productsHref} aria-current={isProducts ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={isProducts ? activeClass : inactiveClass}>
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-white text-base">🧸</span>Brinquedos e serviços
          </a>
          <a href={rentalsHref} aria-current={isRentals ? 'page' : undefined} onClick={() => setMobileOpen(false)} className={isRentals ? activeClass : inactiveClass}>
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-white text-base">📅</span>Locações
          </a>
        </div>
      </div>
    </nav>
  );
}
