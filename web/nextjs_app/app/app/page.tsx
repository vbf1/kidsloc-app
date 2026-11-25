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
  useCompanyRealtimeRefresh(companyId, ['rentals', 'rental_quotes', 'financial_transactions', 'payments'], () => setRealtimeRefresh((value) => value + 1));

  // Listen directly to finance changes so the operation summary refreshes even
  // when the user stays in the same tab while registering or reversing a payment.
  useEffect(() => {
    if (!companyId || !supabase || workspace?.role !== 'admin') return;
    const channel = supabase.channel(`dashboard-finance-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `company_id=eq.${companyId}` }, () => {
        setRealtimeRefresh((value) => value + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_transactions', filter: `company_id=eq.${companyId}` }, () => {
        setRealtimeRefresh((value) => value + 1);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [companyId, workspace?.role]);

  useEffect(() => {
    if (!companyId || !supabase) return;
    let active = true;
    async function loadDashboard() {
      if (!hasModuleData('dashboard', workspaceScope)) setStatsLoading(true);
      setStatsError('');
      try {
        const today = localDateOffset(0);
        const nextWeek = localDateOffset(7);
        const [todayResult, upcomingResult, recentResult, quotesResult, financeResult, paymentsResult] = await Promise.all([
          supabase!.from('rentals').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('start_date', today).neq('status', 'cancelled'),
          supabase!.from('rentals').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('start_date', today).lte('start_date', nextWeek).neq('status', 'cancelled'),
          supabase!.from('rentals').select('id,rental_number,start_date,status,total_amount')
            .eq('company_id', companyId).gte('start_date', today).neq('status', 'cancelled').order('start_date', { ascending: true }).limit(5),
          supabase!.from('rental_quotes').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['draft', 'sent']),
          workspace?.role === 'admin'
            ? supabase!.from('financial_transactions').select('id,rental_id,amount,status,transaction_type').eq('company_id', companyId).eq('transaction_type', 'income').neq('status', 'cancelled')
            : Promise.resolve({ data: [], error: null }),
          workspace?.role === 'admin'
            ? supabase!.from('payments').select('transaction_id,rental_id,amount').eq('company_id', companyId).is('reversed_at', null)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (!active) return;
        if (todayResult.error || upcomingResult.error || recentResult.error || quotesResult.error || financeResult.error || paymentsResult.error) {
          setStatsError('Não foi possível atualizar o painel agora. Tente novamente.');
          return;
        }
        const financeRows = financeResult.data ?? [];
        const transactionByRental = new Map<string, string>();
        for (const row of financeRows) {
          if (row.rental_id && !transactionByRental.has(row.rental_id)) transactionByRental.set(row.rental_id, row.id);
        }
        const paymentTotals = new Map<string, number>();
        for (const payment of paymentsResult.data ?? []) {
          // Older payment rows may be linked only by rental_id; include them
          // so the dashboard does not keep showing the full amount as pending.
          const transactionId = payment.transaction_id ?? (payment.rental_id ? transactionByRental.get(payment.rental_id) : undefined);
          if (!transactionId) continue;
          paymentTotals.set(transactionId, (paymentTotals.get(transactionId) ?? 0) + Number(payment.amount || 0));
        }
        const receivables = financeRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const pendingReceivables = financeRows.reduce((sum, row) => {
          const paid = Math.min(Number(row.amount || 0), paymentTotals.get(row.id) ?? (row.status === 'paid' ? Number(row.amount || 0) : 0));
          return sum + Math.max(0, Number(row.amount || 0) - paid);
        }, 0);
        const nextStats = {
          rentalsToday: todayResult.count ?? 0,
          rentalsNext7Days: upcomingResult.count ?? 0,
          pendingQuotes: quotesResult.count ?? 0,
          receivables,
          pendingReceivables,
        };
        const nextRecentRentals = (recentResult.data ?? []) as RecentRental[];
        const cachedWorkspaceNow = getWorkspaceSessionCache();
        const scope = cachedWorkspaceNow && cachedWorkspaceNow.companyId === companyId ? `${cachedWorkspaceNow.userId}:${cachedWorkspaceNow.companyId}` : '';
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
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadDashboard();
    };
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('pageshow', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('pageshow', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
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
      <section aria-labelledby="workspace-title" className="space-y-5 sm:space-y-6">
        <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#7043c5] via-[#7043c5] to-[#503092] px-5 py-6 text-white shadow-[0_14px_34px_rgba(91,54,157,0.18)] sm:px-7 sm:py-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full border-[28px] border-white/[0.06]" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 right-28 size-44 rounded-full bg-[#ffd45a]/10 blur-2xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.19em] text-[#ffe18a]">Painel de operação</p>
              <h1 id="workspace-title" className="mt-2 max-w-2xl text-[26px] font-extrabold leading-tight tracking-tight sm:text-3xl">Olá! Vamos organizar o dia?</h1>
              <p className="mt-2 text-sm text-white/75">{workspace.companyName}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/65">Hoje</p>
              <p className="mt-1 text-sm font-bold capitalize">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
          </div>
        </div>

        {statsError && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{statsError}</p>}

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-[#262238]">Resumo da operação</h2>
              <p className="mt-0.5 text-xs text-[#777187]">Acompanhe os números mais importantes.</p>
            </div>
            <span className="rounded-full bg-[#f3edff] px-3 py-1 text-[10px] font-bold text-[#7043c5]">Visão geral</span>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              {label:'Locações hoje',value:stats?.rentalsToday,href:'/app/calendar/',hint:'Agenda do dia',symbol:'◷',tone:'bg-emerald-50 text-emerald-700',number:'text-emerald-700'},
              {label:'Próximos 7 dias',value:stats?.rentalsNext7Days,href:'/app/calendar/',hint:'Eventos próximos',symbol:'▦',tone:'bg-blue-50 text-blue-700',number:'text-blue-700'},
              {label:'Orçamentos abertos',value:stats?.pendingQuotes,href:'/app/quotes/',hint:'Propostas pendentes',symbol:'▤',tone:'bg-amber-50 text-amber-700',number:'text-amber-700'},
              ...(workspace.role==='admin'?[{label:'A receber',value:stats?formatCurrency(stats.pendingReceivables):undefined,href:'/app/finance/',hint:'Ver financeiro',symbol:'R$',tone:'bg-[#f3edff] text-[#7043c5]',number:'text-[#7043c5]'}]:[]),
            ].map(item=><Link key={item.label} href={item.href} className="group min-w-0 rounded-2xl border border-[#e9e4f1] bg-white p-3.5 shadow-[0_4px_16px_rgba(39,24,70,0.035)] transition duration-200 hover:-translate-y-0.5 hover:border-[#d6c7ef] hover:shadow-[0_9px_24px_rgba(39,24,70,0.08)] sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 text-[11px] font-bold leading-4 text-[#777187] sm:text-xs">{item.label}</p>
                <span className={`grid size-8 shrink-0 place-items-center rounded-xl text-xs font-black ${item.tone}`}>{item.symbol}</span>
              </div>
              <p className={`mt-3 truncate text-[25px] font-extrabold leading-none tracking-tight ${item.number}`}>{statsLoading||item.value===undefined?'…':item.value}</p>
              <p className="mt-2 flex items-center gap-1 text-[10px] font-bold text-[#7043c5] sm:text-[11px]"><span>{item.hint}</span><span aria-hidden="true" className="transition-transform group-hover:translate-x-1">→</span></p>
            </Link>)}
          </div>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(270px,0.85fr)]">
          <section className="min-w-0 overflow-hidden rounded-2xl border border-[#e9e4f1] bg-white shadow-[0_4px_16px_rgba(39,24,70,0.035)]" aria-labelledby="upcoming-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0edf4] px-4 py-4 sm:px-5">
              <div>
                <h2 id="upcoming-title" className="text-base font-extrabold tracking-tight text-[#262238]">Próximos eventos</h2>
                <p className="mt-1 text-xs text-[#777187]">Suas próximas locações em ordem de data.</p>
              </div>
              <Link href="/app/calendar/" className="rounded-xl px-3 py-2 text-xs font-extrabold text-[#7043c5] transition hover:bg-[#f3edff]">Ver agenda <span aria-hidden="true">→</span></Link>
            </div>
            {statsLoading?<div className="space-y-3 p-5" aria-label="Carregando agenda"><div className="h-14 animate-pulse rounded-xl bg-[#f5f3f8]" /><div className="h-14 animate-pulse rounded-xl bg-[#f5f3f8]" /></div>:recentRentals.length?<ul className="divide-y divide-[#f1eef5] px-4 sm:px-5">
              {recentRentals.map(rental=><li key={rental.id} className="flex min-w-0 items-center gap-3 py-3.5">
                <div className="grid size-12 shrink-0 content-center justify-items-center rounded-xl bg-[#f5f0ff] text-[#7043c5]">
                  <span className="text-lg font-extrabold leading-none">{new Date(`${rental.start_date}T00:00:00`).toLocaleDateString('pt-BR',{day:'2-digit'})}</span>
                  <span className="mt-1 text-[9px] font-extrabold uppercase tracking-wider">{new Date(`${rental.start_date}T00:00:00`).toLocaleDateString('pt-BR',{month:'short'}).replace('.','')}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#262238]">Locação #{rental.rental_number}</p>
                  <p className="mt-1 text-xs text-[#777187]">{formatDate(rental.start_date)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${rental.status==='confirmed'?'bg-emerald-50 text-emerald-700':rental.status==='in_progress'?'bg-blue-50 text-blue-700':'bg-amber-50 text-amber-700'}`}>{rentalStatus(rental.status)}</span>
                  <span className="text-xs font-extrabold text-[#393348]">{formatCurrency(Number(rental.total_amount)||0)}</span>
                </div>
              </li>)}
            </ul>:<div className="px-5 py-9 text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-[#f3edff] text-xl text-[#7043c5]" aria-hidden="true">▦</span>
              <p className="mt-3 text-sm font-bold text-[#393348]">Agenda livre por enquanto</p>
              <p className="mt-1 text-xs text-[#777187]">Quando houver novas locações, elas aparecerão aqui.</p>
              <Link href="/app/rentals/" className="mt-4 inline-flex rounded-xl bg-[#7043c5] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#5931a8]">Cadastrar locação</Link>
            </div>}
          </section>

          <div className="space-y-4">
            <section className="rounded-2xl border border-[#e9e4f1] bg-white p-4 shadow-[0_4px_16px_rgba(39,24,70,0.035)] sm:p-5" aria-labelledby="quick-title">
              <h2 id="quick-title" className="text-base font-extrabold tracking-tight text-[#262238]">Acesso rápido</h2>
              <p className="mt-1 text-xs text-[#777187]">Atalhos para tarefas frequentes.</p>
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {[{label:'Nova locação',href:'/app/rentals/',symbol:'＋',desc:'Registrar evento'},{label:'Novo orçamento',href:'/app/quotes/',symbol:'▤',desc:'Enviar proposta'},{label:'Novo cliente',href:'/app/customers/',symbol:'♙',desc:'Adicionar contato'},{label:'Abrir agenda',href:'/app/calendar/',symbol:'▦',desc:'Ver calendário'}].map(item=><Link key={item.label} href={item.href} className="group min-w-0 rounded-xl border border-[#eeeaf4] bg-[#fcfbfe] p-3 transition hover:border-[#d6c7ef] hover:bg-[#f8f5ff]">
                  <span className="grid size-8 place-items-center rounded-lg bg-[#f0e9ff] text-lg font-bold text-[#7043c5]">{item.symbol}</span>
                  <span className="mt-2 block text-xs font-extrabold text-[#393348]">{item.label}</span>
                  <span className="mt-0.5 block text-[10px] text-[#777187]">{item.desc}</span>
                </Link>)}
              </div>
            </section>
            {workspace.role==='admin'&&<section className="rounded-2xl border border-[#f2df9e] bg-gradient-to-br from-[#fff9e8] to-[#fffdf7] p-4 sm:p-5" aria-labelledby="finance-attention-title">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#ffedb5] text-sm font-black text-[#8b6410]">R$</span>
                <div className="min-w-0">
                  <h2 id="finance-attention-title" className="text-sm font-extrabold text-[#6f5010]">Atenção financeira</h2>
                  <p className="mt-1 text-xs leading-5 text-[#80672c]">Você tem <strong>{statsLoading?'…':formatCurrency(stats?.pendingReceivables??0)}</strong> em receitas pendentes.</p>
                  <Link href="/app/finance/" className="mt-2 inline-flex text-xs font-extrabold text-[#79570e] hover:underline">Conferir recebimentos <span aria-hidden="true" className="ml-1">→</span></Link>
                </div>
              </div>
            </section>}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
