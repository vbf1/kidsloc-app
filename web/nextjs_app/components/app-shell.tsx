'use client';

import type { ReactNode } from 'react';
import { AppNavigation } from './app-navigation';

type AppShellProps = {
  companyName: string;
  email: string;
  basePath: string;
  signingOut: boolean;
  onSignOut: () => void;
  children: ReactNode;
};

export function AppShell({
  companyName,
  email,
  basePath,
  signingOut,
  onSignOut,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#f8f7fc] text-gray-900">
      <header className="border-b border-purple-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a href={`${basePath}/app/`} className="flex min-w-0 items-center gap-3" aria-label="KidsLoc, página inicial">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#8054d8] text-xl font-black text-white">
              K
            </span>
            <span className="truncate text-xl font-bold tracking-tight">
              KidsLoc <span className="text-[#8054d8]">App</span>
            </span>
          </a>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-purple-200 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {signingOut ? 'Saindo...' : 'Sair'}
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 md:grid-cols-[230px_minmax(0,1fr)] md:py-8 lg:px-8">
        <aside className="min-w-0">
          <div className="mb-4 hidden rounded-2xl border border-purple-100 bg-white p-4 md:block">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Empresa</p>
            <p className="mt-1 break-words font-bold text-gray-900">{companyName}</p>
            <p className="mt-2 break-all text-xs leading-5 text-gray-500">{email}</p>
          </div>
          <AppNavigation basePath={basePath} />
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
