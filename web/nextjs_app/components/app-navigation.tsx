'use client';

import { useState } from 'react';

type AppNavigationProps = {
  basePath: string;
};

export function AppNavigation({ basePath }: AppNavigationProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const dashboardHref = `${basePath}/app/`;

  return (
    <nav aria-label="Navegação principal" className="w-full">
      <button
        type="button"
        aria-expanded={mobileOpen}
        aria-controls="kidsloc-primary-navigation"
        onClick={() => setMobileOpen((open) => !open)}
        className="flex w-full items-center justify-between rounded-xl border border-purple-100 bg-white px-4 py-3 text-sm font-semibold text-gray-800 shadow-sm md:hidden"
      >
        Menu
        <span aria-hidden="true" className="text-lg text-[#8054d8]">
          {mobileOpen ? '−' : '+'}
        </span>
      </button>

      <div
        id="kidsloc-primary-navigation"
        className={`${mobileOpen ? 'mt-3 block' : 'hidden'} md:mt-0 md:block`}
      >
        <a
          href={dashboardHref}
          aria-current="page"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 rounded-xl bg-purple-50 px-4 py-3 text-sm font-semibold text-[#6840bd]"
        >
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-white text-base">
            ⌂
          </span>
          Visão geral
        </a>
      </div>
    </nav>
  );
}
