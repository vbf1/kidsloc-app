'use client';
import { useCompanyRealtimeRefresh } from '../../lib/use-company-realtime';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '../../components/app-shell';
import { getWorkspaceCompanyName } from '../../lib/workspace';
import { supabase } from '../../lib/supabase';
import { setWorkspaceSessionCache } from '../../lib/workspace-session-cache';

type CompanyRole = 'admin' | 'staff';
type Workspace = { email: string; companyName: string; companyId: string; role: CompanyRole };
type DashboardStats = { customers: number; products: number; rentals: number };
type RecentRental = { id: string; rental_number: number; start_date: string; status: string; total_amount: number };

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}
function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
function rentalStatus(value: string) {
  const labels: Record<string, string> = {
    pending: 'Pendente', confirmed: 'Confirmada', in_progress: 'Em andamento',
    completed: 'Concluída', cancelled: 'Cancelada', draft: 'Rascunho',
  };
  return labels[value] ?? value;
}

export default function AppHomePage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentRentals, setRecentRentals] = useState<RecentRental[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState('');
  const [realtimeRefresh, setRealtimeRefresh] = useState(0);

  const loadWorkspace = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    await Promise.resolve();
    setMessage('');
    try {
      if (!supabase) { setMessage('O acesso ainda não está configurado. Tente novamente mais tarde.'); return; }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) { setMessage('Não foi possível validar sua sessão agora. Confira sua conexão e tente novamente.'); return; }
      if (!user) { router.replace('/login/'); return; }
      const { data: isPlatformOwner, error: ownerError } = await supabase.rpc('is_platform_owner_for_company');
      if (ownerError) { setMessage('Não foi possível confirmar as permissões da conta. Tente novamente.'); return; }
      if (isPlatformOwner === true) { router.replace('/app/admin/'); return; }
      const { data, error } = await supabase.from('company_members')
        .select('company_id, role, companies(name)').eq('user_id', user.id).limit(1).maybeSingle();
      if (error) { setMessage('Não foi possível carregar os dados da empresa. Tente novamente.'); return; }
      if (!data) { router.replace('/app/company/'); return; }
      const companyName = getWorkspaceCompanyName(data.companies);
      if (!companyName) { setMessage('Não foi possível identificar a empresa vinculada à sua conta.'); return; }
      const nextWorkspace = { email: user.email ?? 'E-mail não informado', companyName, companyId: data.company_id, role: data.role as CompanyRole };
      setWorkspace(nextWorkspace);
      setWorkspaceSessionCache({ userId: user.id, ...nextWorkspace });
    } catch {
      setMessage('Ocorreu um erro ao carregar sua área de trabalho. Confira sua conexão.');
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => {
    // The workspace request is asynchronous; its result updates the loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkspace(false);
  }, [loadWorkspace]);

  const companyId = workspace?.companyId;
  useCompanyRealtimeRefresh(companyId, ['customers', 'products', 'rentals'], () => setRealtimeRefresh((value) => value + 1));

  useEffect(() => {
    if (!companyId || !supabase) return;
    let active = true;
    async function loadDashboard() {
      setStatsLoading(true);
      setStatsError('');
      try {
        const [customersResult, productsResult, rentalsResult, recentResult] = await Promise.all([
          supabase!.from('customers').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
          supabase!.from('products').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
          supabase!.from('rentals').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
          supabase!.from('rentals').select('id,rental_number,start_date,status,total_amount')
            .eq('company_id', companyId).order('created_at', { ascending: false }).limit(4),
        ]);
        if (!active) return;
        if (customersResult.error || productsResult.error || rentalsResult.error || recentResult.error) {
          setStatsError('Não foi possível atualizar os indicadores agora. Tente novamente.');
          return;
        }
        setStats({
          customers: customersResult.count ?? 0,
          products: productsResult.count ?? 0,
          rentals: rentalsResult.count ?? 0,
        });
        setRecentRentals((recentResult.data ?? []) as RecentRental[]);
      } catch {
        if (active) setStatsError('Ocorreu um erro ao consultar os dados da empresa.');
      } finally {
        if (active) setStatsLoading(false);
      }
    }
    void loadDashboard();
    return () => { active = false; };
  }, [companyId, realtimeRefresh]);

  async function signOut() {
    if (!supabase || signingOut) return;
    setSigningOut(true); setMessage('');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) { setMessage('Não foi possível encerrar sua sessão. Tente novamente.'); return; }
      router.push('/login/');
    } catch {
      setMessage('Não foi possível encerrar sua sessão. Tente novamente.');
    } finally { setSigningOut(false); }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5"><p role="status" className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm font-medium text-gray-600 shadow-sm">Carregando sua área de trabalho...</p></main>;
  if (!workspace) return (
    <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5">
      <section className="w-full max-w-md rounded-2xl border border-purple-100 bg-white p-6 shadow-sm">
        <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-[#8054d8] text-xl font-black text-white">K</div>
        <h1 className="text-xl font-bold">Não foi possível abrir o KidsLoc</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-gray-600">{message || 'Não foi possível carregar os dados da sua conta.'}</p>
        <button type="button" onClick={() => void loadWorkspace()} className="mt-5 rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6e43c4]">Tentar novamente</button>
      </section>
    </main>
  );

  const indicators = [
    { label: 'Clientes cadastrados', value: stats?.customers, href: '/app/customers/' },
    { label: 'Itens no catálogo', value: stats?.products, href: '/app/products/' },
    { label: 'Locações registradas', value: stats?.rentals, href: '/app/rentals/' },
  ];

  return (
    <AppShell companyName={workspace.companyName} email={workspace.email} role={workspace.role}
      companyId={workspace.companyId} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''}
      signingOut={signingOut} onSignOut={signOut}>
      <section aria-labelledby="workspace-title">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">Área da empresa</p>
          <h1 id="workspace-title" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Visão geral</h1>
          <p className="mt-2 text-sm text-gray-500">Resumo atualizado da {workspace.companyName}.</p>
        </div>
        <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Sua empresa</p>
              <h2 className="mt-1 text-xl font-bold">{workspace.companyName}</h2>
              <p className="mt-2 break-all text-sm text-gray-500">{workspace.email}</p></div>
            <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700"><span aria-hidden="true" className="size-2 rounded-full bg-green-500" />Acesso ativo</span>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-3">
            <h2 className="text-lg font-bold">Resumo da empresa</h2>
          </div>
          {statsError && <p role="alert" className="mb-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{statsError}</p>}
          <div className="grid grid-cols-2 gap-3">
            {indicators.map((item) => <Link key={item.label} href={item.href}
              className="min-w-0 rounded-xl border border-purple-100 bg-white p-3 shadow-sm transition hover:border-purple-200 hover:shadow-md sm:p-4">
              <p className="text-xs font-medium leading-5 text-gray-500 sm:text-sm">{item.label}</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                {statsLoading || item.value === undefined ? <span className="text-lg text-gray-300">...</span> : item.value}
              </p>
              <span className="mt-2 inline-block text-[11px] font-semibold text-[#8054d8] sm:text-xs">Ver detalhes →</span>
            </Link>)}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-purple-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Locações recentes</h2>
            <Link href="/app/rentals/" className="text-sm font-semibold text-[#8054d8]">Ver todas</Link>
          </div>
          {statsLoading ? <p role="status" className="mt-4 text-sm text-gray-500">Carregando movimentações...</p>
            : recentRentals.length ? <ul className="mt-3 divide-y divide-gray-100">
              {recentRentals.map((rental) => <li key={rental.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div><p className="font-semibold text-gray-900">Locação #{rental.rental_number}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatDate(rental.start_date)} · {rentalStatus(rental.status)}</p></div>
                <p className="text-sm font-semibold text-gray-800">{formatCurrency(Number(rental.total_amount) || 0)}</p>
              </li>)}
            </ul> : <p className="mt-4 rounded-xl bg-purple-50/70 px-4 py-5 text-sm leading-6 text-gray-600">Ainda não há locações registradas. Quando uma locação for cadastrada, ela aparecerá aqui.</p>}
        </div>
      </section>
    </AppShell>
  );
}
