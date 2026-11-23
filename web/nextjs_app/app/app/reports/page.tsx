'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ReportsPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/app/finance/'); }, [router]);
  return <main className="grid min-h-screen place-items-center text-sm text-slate-500">Abrindo financeiro e relatórios...</main>;
}
