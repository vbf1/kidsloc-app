'use client';
import { hasModuleData, setModuleData, useModuleData } from '../../lib/module-data-cache';
import { useCompanyRealtimeRefresh } from '../../lib/use-company-realtime';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '../../components/app-shell';
import { getWorkspaceCompanyName } from '../../lib/workspace';
import { supabase } from '../../lib/supabase';
import { getWorkspaceSessionCache, setWorkspaceSessionCache } from '../../lib/workspace-session-cache';
import { preloadCompanyModules } from '../../lib/preload-company-modules';

type CompanyRole = 'admin' | 'staff';
type Workspace = { email: string; companyName: string; companyId: string; role: CompanyRole };
type DashboardStats = { rentalsToday: number; rentalsNext7Days: number; pendingQuotes: number; receivables: number; pendingReceivables: number };
type RecentRental = { id: string; rental_number: number; start_date: string; status: string; total_amount: number };

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR');
}
function localDateOffset(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); }
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
  const cachedWorkspace = getWorkspaceSessionCache();
  const workspaceScope = cachedWorkspace ? `${cachedWorkspace.userId}:${cachedWorkspace.companyId}` : '';
  const usableCachedWorkspace = cachedWorkspace && (cachedWorkspace.role === 'admin' || cachedWorkspace.role === 'staff') ? cachedWorkspace : null;
  const [workspace, setWorkspace] = useState<Workspace | null>(() => usableCachedWorkspace ? {
    email: usableCachedWorkspace.email, companyName: usableCachedWorkspace.companyName,
    companyId: usableCachedWorkspace.companyId, role: usableCachedWorkspace.role as CompanyRole,
  } : null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(!usableCachedWorkspace);
  const [signingOut, setSigningOut] = useState(false);
  const [stats, setStats] = useModuleData<DashboardStats | null>('dashboard','stats',workspaceScope,null);
  const [recentRentals, setRecentRentals] = useModuleData<RecentRental[]>('dashboard','recentRentals',workspaceScope,[]);
  const [statsLoading, setStatsLoading] = useState(!hasModuleData('dashboard', workspaceScope));
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
      const cached = getWorkspaceSessionCache();
      if (cached && cached.userId === user.id && (cached.role === 'admin' || cached.role === 'staff')) {
        const nextWorkspace = {
          email: user.email ?? cached.email, companyName: cached.companyName,
          companyId: cached.companyId, role: cached.role,
        };
        setWorkspace(nextWorkspace);
        setWorkspaceSessionCache({ ...cached, email: nextWorkspace.email });
        return;
      }
      setLoading(true);
      setWorkspace(null);
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

  // Warm the module cache as soon as the authenticated workspace is ready.
  // This runs in the background: the dashboard remains interactive while data loads.
  useEffect(() => {
    if (!companyId || !workspace) return;
    const cached = getWorkspaceSessionCache();
    if (!cached || cached.companyId !== companyId) return;
    void preloadCompanyModules(cached.userId, companyId, workspace.role).catch(() => {
      // Individual modules keep their normal on-demand fallback if preload fails.
    });
  }, [companyId, workspace]);
  useCompanyRealtimeRefresh(companyId, ['rentals', 'rental_quotes', 'financial_transactions'], () => setRealtimeRefresh((value) => value + 1));

  useEffect(() => {
    if (!companyId || !supabase) return;
    let active = true;
    async function loadDashboard() {
      if (!hasModuleData('dashboard', workspaceScope)) setStatsLoading(true);
      setStatsError('');
      try {
        const today = localDateOffset(0);
        const nextWeek = localDateOffset(7);
        const [todayResult, upcomingResult, recentResult, quotesResult, financeResult] = await Promise.all([
          supabase!.from('rentals').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('start_date', today).neq('status', 'cancelled'),
          supabase!.from('rentals').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('start_date', today).lte('start_date', nextWeek).neq('status', 'cancelled'),
          supabase!.from('rentals').select('id,rental_number,start_date,status,total_amount')
            .eq('company_id', companyId).gte('start_date', today).neq('status', 'cancelled').order('start_date', { ascending: true }).limit(5),
          supabase!.from('rental_quotes').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['draft', 'sent']),
          workspace?.role === 'admin'
            ? supabase!.from('financial_transactions').select('amount,status,transaction_type').eq('company_id', companyId).eq('transaction_type', 'income').neq('status', 'cancelled')
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (!active) return;
        if (todayResult.error || upcomingResult.error || recentResult.error || quotesResult.error || financeResult.error) {
          setStatsError('Não foi possível atualizar o painel agora. Tente novamente.');
          return;
        }
        const financeRows = financeResult.data ?? [];
        const receivables = financeRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const pendingReceivables = financeRows.filter(row => row.status === 'pending').reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const nextStats = {
          rentalsToday: todayResult.count ?? 0,
          rentalsNext7Days: upcomingResult.count ?? 0,
          pendingQuotes: quotesResult.count ?? 0,
          receivables,
          pendingReceivables,
        };
        const nextRecentRentals = (recentResult.data ?? []) as RecentRental[];
        const cachedWorkspaceNow = getWorkspaceSessionCache();
        const scope = cachedWorkspaceNow?.companyId === companyId ? `${cachedWorkspaceNow.userId}:${cachedWorkspaceNow.companyId}` : '';
        setModuleData('dashboard','stats',scope,nextStats);
        setModuleData('dashboard','recentRentals',scope,nextRecentRentals);
        setStats(nextStats);
        setRecentRentals(nextRecentRentals);
      } catch {
        if (active) setStatsError('Ocorreu um erro ao consultar os dados da empresa.');
      } finally {
        if (active) setStatsLoading(false);
      }
    }
    void loadDashboard();
    return () => { active = false; };
  }, [companyId, realtimeRefresh, workspace?.role]);

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


  return (
    <AppShell companyName={workspace.companyName} email={workspace.email} role={workspace.role}
      companyId={workspace.companyId} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''}
      signingOut={signingOut} onSignOut={signOut}>
      <section aria-labelledby="workspace-title">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">Painel de operação</p>
          <h1 id="workspace-title" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Olá! Vamos organizar o dia?</h1>
          <p className="mt-2 text-sm text-gray-500">{workspace.companyName} · {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        {statsError && <p role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{statsError}</p>}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[{label:'Locações hoje',value:stats?.rentalsToday,href:'/app/calendar/',tone:'text-emerald-700',hint:'Ver agenda'},{label:'Próximos 7 dias',value:stats?.rentalsNext7Days,href:'/app/calendar/',tone:'text-blue-700',hint:'Planejar eventos'},{label:'Orçamentos em aberto',value:stats?.pendingQuotes,href:'/app/quotes/',tone:'text-amber-700',hint:'Acompanhar propostas'},...(workspace.role==='admin'?[{label:'A receber',value:stats?formatCurrency(stats.pendingReceivables):undefined,href:'/app/finance/',tone:'text-purple-700',hint:'Abrir financeiro'}]:[])].map(item=><Link key={item.label} href={item.href} className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><p className="text-xs font-semibold text-gray-500">{item.label}</p><p className={`mt-2 text-2xl font-extrabold tracking-tight ${item.tone}`}>{statsLoading||item.value===undefined?'...':item.value}</p><p className="mt-2 text-xs font-semibold text-[#8054d8]">{item.hint} →</p></Link>)}
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
          <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Próximos eventos</h2><p className="mt-1 text-xs text-gray-500">Locações programadas a partir de hoje.</p></div><Link href="/app/calendar/" className="text-sm font-semibold text-[#8054d8]">Ver agenda</Link></div>
            {statsLoading?<p className="mt-4 text-sm text-gray-500">Carregando agenda...</p>:recentRentals.length?<ul className="mt-3 divide-y divide-gray-100">{recentRentals.map(rental=><li key={rental.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold text-gray-900">Locação #{rental.rental_number}</p><p className="mt-1 text-xs text-gray-500">{formatDate(rental.start_date)} · {rentalStatus(rental.status)}</p></div><p className="text-sm font-semibold text-gray-800">{formatCurrency(Number(rental.total_amount)||0)}</p></li>)}</ul>:<p className="mt-4 rounded-xl bg-purple-50/70 px-4 py-5 text-sm text-gray-600">Nenhum evento futuro programado. Aproveite para organizar a agenda.</p>}
          </div>
          <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold">Acesso rápido</h2><p className="mt-1 text-xs text-gray-500">Atalhos para as tarefas mais comuns.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[{label:'Nova locação',href:'/app/rentals/',symbol:'＋'},{label:'Novo orçamento',href:'/app/quotes/',symbol:'▤'},{label:'Novo cliente',href:'/app/customers/',symbol:'♙'},{label:'Abrir agenda',href:'/app/calendar/',symbol:'▦'}].map(item=><Link key={item.label} href={item.href} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-4 text-sm font-semibold text-gray-700 transition hover:border-purple-200 hover:bg-purple-50"><span className="mb-2 block text-xl text-[#8054d8]">{item.symbol}</span>{item.label}<span className="mt-1 block text-xs text-[#8054d8]">Acessar →</span></Link>)}
            </div>
            {workspace.role==='admin'&&<div className="mt-4 rounded-xl bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-800">Atenção financeira</p><p className="mt-1 text-sm text-amber-900">Você tem {statsLoading?'...':formatCurrency(stats?.pendingReceivables??0)} em receitas pendentes.</p><Link href="/app/finance/" className="mt-2 inline-block text-xs font-bold text-amber-800">Conferir recebimentos →</Link></div>}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
