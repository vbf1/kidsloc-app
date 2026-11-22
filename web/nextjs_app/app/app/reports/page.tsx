'use client';
import { hasModuleData, useModuleData } from '../../../lib/module-data-cache';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { supabase } from '../../../lib/supabase';
import { useCompanyRealtimeRefresh } from '../../../lib/use-company-realtime';
import { useResponsivePageSize } from '../../../lib/use-responsive-page-size';
import { Pagination } from '../../../components/pagination';
import { clearWorkspaceSessionCache, getWorkspaceSessionCache, setWorkspaceSessionCache } from '../../../lib/workspace-session-cache';

type Tx = { id: string; transaction_type: 'income' | 'expense'; amount: number | string; status: string; due_date: string | null; paid_at: string | null; category: string | null };
type Rental = { id: string; rental_number: number; start_date: string; end_date: string; status: string; total_amount: number | string };
type Product = { id: string; name: string };
type RentalItem = { rental_id: string; product_id: string; quantity: number; subtotal: number | string };
type PagedQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

async function fetchAllRows<T>(query: PagedQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const iso = (d: Date) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');

export default function ReportsPage() {
  const router = useRouter();
  const cachedWorkspace = getWorkspaceSessionCache();
  const workspaceScope = cachedWorkspace ? `${cachedWorkspace.userId}:${cachedWorkspace.companyId}` : '';
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(!hasModuleData('reports', workspaceScope));
  const [error, setError] = useState('');
  const [month, setMonth] = useState(() => iso(new Date()).slice(0,7));
  const [transactions, setTransactions] = useModuleData<Tx[]>('reports','transactions',workspaceScope,[]);
  const [payments, setPayments] = useModuleData<{ transaction_id: string | null; amount: number | string; paid_at: string }[]>('reports','payments',workspaceScope,[]);
  const [rentals, setRentals] = useModuleData<Rental[]>('reports','rentals',workspaceScope,[]);
  const [items, setItems] = useModuleData<RentalItem[]>('reports','items',workspaceScope,[]);
  const [products, setProducts] = useModuleData<Product[]>('reports','products',workspaceScope,[]);
  const [refresh, setRefresh] = useState(0);
  const [topPage, setTopPage] = useState(0);
  const pageSize = useResponsivePageSize();

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) { setError('Banco de dados não configurado.'); setLoading(false); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { clearWorkspaceSessionCache(); router.replace('/login/'); return; }
      const cached=getWorkspaceSessionCache();let cid:string;let companyNameValue:string;let memberRole:string;
      if(cached?.userId===user.id){cid=cached.companyId;companyNameValue=cached.companyName;memberRole=cached.role;}
      else {
        const { data: member, error: memberError } = await supabase.from('company_members')
          .select('company_id, role, companies(name)').eq('user_id', user.id).limit(1).maybeSingle();
        if (memberError || !member) { setError('Não foi possível identificar sua empresa.'); setLoading(false); return; }
        const company = Array.isArray(member.companies) ? member.companies[0] : member.companies;
        cid = member.company_id as string;companyNameValue=company?.name??'Empresa';memberRole=member.role;
        setWorkspaceSessionCache({userId:user.id,email:user.email??'',companyName:companyNameValue,companyId:cid,role:member.role});
      }
      if (memberRole !== 'admin') { setError('Os relatórios estão disponíveis apenas para administradores.'); setLoading(false); return; }
      let txRows: Tx[];
      let paymentRows: { transaction_id: string | null; amount: number | string; paid_at: string }[];
      let rentalRows: Rental[];
      let productRows: Product[];
      let itemRows: RentalItem[];
      try {
        [txRows, paymentRows, rentalRows, productRows, itemRows] = await Promise.all([
          fetchAllRows<Tx>(supabase.from('financial_transactions').select('id,transaction_type,amount,status,due_date,paid_at,category').eq('company_id', cid).order('id', { ascending: true }).neq('status','cancelled')),
          fetchAllRows<{ transaction_id: string | null; amount: number | string; paid_at: string }>(supabase.from('payments').select('transaction_id,amount,paid_at').eq('company_id', cid).order('id', { ascending: true })),
          fetchAllRows<Rental>(supabase.from('rentals').select('id,rental_number,start_date,end_date,status,total_amount').eq('company_id', cid).order('id', { ascending: true }).neq('status','cancelled')),
          fetchAllRows<Product>(supabase.from('products').select('id,name').eq('company_id', cid).order('id', { ascending: true })),
          fetchAllRows<RentalItem>(supabase.from('rental_items').select('rental_id,product_id,quantity,subtotal').eq('company_id', cid).order('id', { ascending: true })),
        ]);
      } catch {
        if (!active) return;
        setError('Não foi possível carregar os dados para os relatórios.');
        setLoading(false);
        return;
      }
      if (!active) return;
      setCompanyId(cid); setCompanyName(companyNameValue); setEmail(user.email ?? '');
      setTransactions(txRows);
      setPayments(paymentRows);
      setRentals(rentalRows); setItems(itemRows); setProducts(productRows);
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [router, refresh]);

  useCompanyRealtimeRefresh(companyId, ['financial_transactions','payments','rentals','rental_items','products'], () => setRefresh(v => v + 1));

  const from = month + '-01';
  const until = iso(new Date(Number(month.slice(0,4)), Number(month.slice(5,7)), 0));
  const summary = useMemo(() => {
    const tx = transactions.filter(t => (t.due_date ?? t.paid_at ?? '').slice(0,7) === month);
    const income = tx.filter(t => t.transaction_type === 'income');
    const expenses = tx.filter(t => t.transaction_type === 'expense');
    const received = payments.filter(p => p.paid_at.slice(0,7) === month).reduce((s,p) => s + Number(p.amount),0);
    const revenue = income.reduce((s,t) => s + Number(t.amount),0);
    const expense = expenses.reduce((s,t) => s + Number(t.amount),0);
    const paidByTransaction = new Map<string,number>();
    for (const payment of payments) if (payment.transaction_id) paidByTransaction.set(payment.transaction_id,(paidByTransaction.get(payment.transaction_id) ?? 0)+Number(payment.amount));
    const pending = income.reduce((s,t) => s + Math.max(0,Number(t.amount)-(paidByTransaction.get(t.id) ?? (t.status === 'paid' ? Number(t.amount) : 0))),0);
    const activeRentals = rentals.filter(r => r.start_date <= until && r.end_date >= from);
    const activeRentalIds = new Set(activeRentals.map(r=>r.id));
    const booked = activeRentals.reduce((s,r) => s + Number(r.total_amount),0);
    const productTotals = new Map<string,{ quantity:number; gross:number; rentalIds:Set<string> }>();
    for (const item of items) {
      if (!activeRentalIds.has(item.rental_id)) continue;
      const current = productTotals.get(item.product_id) ?? { quantity:0, gross:0, rentalIds:new Set<string>() };
      current.quantity += Number(item.quantity);
      current.gross += Number(item.subtotal);
      current.rentalIds.add(item.rental_id);
      productTotals.set(item.product_id,current);
    }
    const names = new Map(products.map(p => [p.id,p.name]));
    const grossTotal = [...productTotals.values()].reduce((s,p) => s+p.gross,0);
    const top = [...productTotals.entries()].map(([id,p]) => {
      const allocatedExpense = grossTotal > 0 ? expense * p.gross / grossTotal : 0;
      return { name:names.get(id) ?? 'Item removido', quantity:p.quantity, rentals:p.rentalIds.size,
        gross:p.gross, allocatedExpense, net:p.gross-allocatedExpense };
    }).sort((a,b) => b.gross-a.gross);
    const statuses = new Map<string,number>();
    for (const r of activeRentals) statuses.set(r.status,(statuses.get(r.status) ?? 0)+1);
    return { revenue, received, expense, result: revenue-expense, pending, rentals: activeRentals.length, booked, top, statuses: [...statuses.entries()] };
  }, [transactions,payments,rentals,items,products,month,from,until]);

  async function signOut() { if (supabase) { await supabase.auth.signOut(); router.push('/login/'); } }
  if (loading) return <main className="grid min-h-screen place-items-center">Carregando relatórios...</main>;

  const cards = [
    ['Receitas lançadas', brl(summary.revenue), 'Valores de receitas no período'],
    ['Recebimentos', brl(summary.received), 'Pagamentos efetivamente registrados'],
    ['Despesas', brl(summary.expense), 'Despesas lançadas no período'],
    ['Resultado', brl(summary.result), 'Receitas menos despesas lançadas'],
    ['A receber', brl(summary.pending), 'Receitas ainda não marcadas como pagas'],
    ['Locações', String(summary.rentals), 'Locações com evento no período'],
  ];
  const maxTop = Math.max(1,...summary.top.map(x=>x.gross));
  return <AppShell companyName={companyName} email={email} role="admin" companyId={companyId}
    basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''} signingOut={false} onSignOut={signOut}>
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-widest text-[#8054d8]">Gestão e desempenho</p>
          <h1 className="mt-2 text-3xl font-bold">Relatórios avançados</h1>
          <p className="mt-2 text-sm text-gray-500">Indicadores financeiros e operacionais da {companyName}.</p></div>
        <label className="text-sm font-semibold text-gray-600">Período
          <input type="month" value={month} onChange={e=>{setMonth(e.target.value);setTopPage(0);}} className="mt-1 block rounded-xl border border-purple-100 bg-white px-3 py-2.5"/>
        </label>
      </div>
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {cards.map(([label,value,description])=><article key={label} className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm sm:p-5">
          <p className="text-xs font-semibold text-gray-500">{label}</p><p className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{value}</p><p className="mt-1 text-xs text-gray-400">{description}</p>
        </article>)}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-purple-100 bg-white p-5">
          <h2 className="font-bold">Desempenho financeiro por brinquedo</h2><p className="mt-1 text-xs text-gray-500">Faturamento bruto, despesas rateadas e lucro líquido estimado no período</p>
          {summary.top.length ? <><div className="mt-5 space-y-4">{summary.top.slice(topPage*pageSize,(topPage+1)*pageSize).map(item=><div key={item.name} className="border-b border-gray-100 pb-3 last:border-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm"><strong className="truncate">{item.name}</strong><span className="text-xs text-gray-500">{item.rentals} locações · {item.quantity} unidades</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-purple-50"><div className="h-full rounded-full bg-[#8054d8]" style={{width:(item.gross/maxTop*100)+'%'}}/></div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs"><span><span className="block text-gray-400">Bruto</span><strong>{brl(item.gross)}</strong></span><span><span className="block text-gray-400">Despesas</span><strong>{brl(item.allocatedExpense)}</strong></span><span><span className="block text-gray-400">Líquido*</span><strong className={item.net<0?'text-red-600':'text-green-700'}>{brl(item.net)}</strong></span></div>
          </div>)}</div><Pagination totalCount={summary.top.length} page={topPage} pageSize={pageSize} onPageChange={setTopPage}/></> : <p className="mt-5 text-sm text-gray-500">Ainda não há itens de locação para exibir.</p>}
        </article>
        <article className="rounded-2xl border border-purple-100 bg-white p-5">
          <h2 className="font-bold">Situação das locações</h2><p className="mt-1 text-xs text-gray-500">Locações que cruzam o período selecionado</p>
          <div className="mt-4 space-y-3">{summary.statuses.length ? summary.statuses.map(([status,count])=><div key={status} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-3 text-sm"><span>{({pending:'Pendente',confirmed:'Confirmada',ongoing:'Em andamento',in_progress:'Em andamento',completed:'Concluída',draft:'Rascunho'} as Record<string,string>)[status] ?? status}</span><strong>{count}</strong></div>) : <p className="text-sm text-gray-500">Nenhuma locação neste período.</p>}</div>
          <div className="mt-5 rounded-xl bg-purple-50 p-4"><p className="text-xs text-purple-700">Valor contratado no período</p><p className="mt-1 text-xl font-bold text-purple-900">{brl(summary.booked)}</p></div>
        </article>
      </div>
      <p className="mt-5 text-xs leading-5 text-gray-400">*Lucro líquido estimado: as despesas financeiras registradas no mês são distribuídas proporcionalmente ao faturamento bruto de cada brinquedo. Custos não lançados no financeiro não entram no cálculo. Resultado geral e recebimentos são exibidos separadamente; confira os lançamentos antes de usar os números como demonstrativo contábil.</p>
    </section>
  </AppShell>;
}
