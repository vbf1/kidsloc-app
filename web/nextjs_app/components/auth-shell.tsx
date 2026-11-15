import Link from 'next/link';
import type { ReactNode } from 'react';

export function AuthShell({ title, description, children }: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-3xl border border-purple-100 bg-white p-7 shadow-sm sm:p-9">
        <Link href="/" className="inline-flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#8054d8] text-xl font-black text-white">K</span>
          <span className="text-lg font-bold">KidsLoc <span className="text-[#8054d8]">App</span></span>
        </Link>
        <h1 className="mt-8 text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
        <div className="mt-7">{children}</div>
      </section>
    </main>
  );
}

export const fieldClass = 'mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8054d8] focus:ring-2 focus:ring-purple-100';
export const primaryButtonClass = 'w-full rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6d43c2] disabled:cursor-not-allowed disabled:opacity-50';
