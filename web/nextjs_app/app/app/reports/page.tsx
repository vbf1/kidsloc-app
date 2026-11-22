'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { supabase } from '../../../lib/supabase';
import { useCompanyRealtimeRefresh } from '../../../lib/use-company-realtime';

type Tx = { id: string; transaction_type: 'income' | 'expense'; amount: number | string; status: string; due_date: string | null; paid_at: string | null; category: string | null };
type Rental = { id: string; rental_number: number; start_date: string; end_date: string; status: string; total_amount: number | string };
type Product = { id: string; name: string };
type RentalItem = { product_id: string; quantity: number; subtotal: number | string };
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const iso = (d: Date) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');

export default function ReportsPage() {
  const router = useRouter();
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(() => iso(new Date()).slice(0,7));
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [payments, setPayments] = useState<{ amount: number | string; paid_at: string }[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [items, setItems] = useState<RentalItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) { setError('Banco de dados não configurado.'); setLoading(false); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login/'); return; }
      const { data: member, error: memberError } = await supabase.from('company_members')
        .select('company_id, role, companies(name)').eq('user_id', user.id).limit(1).maybeSingle();
      if (memberError || !member) { setError('Não foi possível identificar sua empresa.'); setLoading(false); return; }
      if (member.role !== 'admin') { setError('Os relatórios estão disponíveis apenas para administradores.'); setLoading(false); return; }
      const company = Array.isArray(member.companies) ? member.companies[0] : member.companies;
      const cid = member.company_id as string;
      const [tx, pay, rent, prod] = await Promise.all([
        supabase.from('financial_transactions').select('id,transaction_type,amount,status,due_date,paid_at,category').eq('company_id', cid).neq('status','cancelled').limit(5000),
        supabase.from('payments').select('amount,paid_at').eq('company_id', cid).limit(5000),
        supabase.from('rentals').select('id,rental_number,start_date,end_date,status,total_amount').eq('company_id', cid).neq('status','cancelled').limit(5000),
        supabase.from('products').select('id,name').eq('company_id', cid),
      ]);
      if (!active) return;
      if (tx.error || pay.error || rent.error || prod.error) { setError('Não foi possível carregar os dados para os relatórios.'); setLoading(false); return; }
      const rentalRows = (rent.data ?? []) as Rental[];
      const rentalIds = rentalRows.map(r => r.id);
      let itemRows: RentalItem[] = [];
      if (rentalIds.length) {
        const { data, error: itemError } = await supabase.from('rental_items').select('product_id,quantity,subtotal').eq('company_id', cid).in('rental_id', rentalIds).limit(10000);
        if (itemError) { setError('Não foi possível carregar os itens das locações.'); setLoading(false); return; }
        itemRows = (data ?? []) as RentalItem[];
      }
      setCompanyId(cid); setCompanyName(company?.name ?? 'Empresa'); setEmail(user.email ?? '');
      setTransactions((tx.data ?? []) as Tx[]);
      setPayments((pay.data ?? []) as { amount: number | string; paid_at: string }[]);
      setRentals(rentalRows); setItems(itemRows); setProducts((prod.data ?? []) as Product[]);
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
    const pending = income.filter(t => t.status !== 'paid').reduce((s,t) => s + Number(t.amount),0);
    const activeRentals = rentals.filter(r => r.start_date <= until && r.end_date >= from);
    const booked = activeRentals.reduce((s,r) => s + Number(r.total_amount),0);
    const counts = new Map<string,number>();
    for (const item of items) counts.set(item.product_id, (counts.get(item.product_id) ?? 0) + Number(item.quantity));
    const names = new Map(products.map(p => [p.id,p.name]));
    const top = [...counts.entries()].map(([id,quantity]) => ({ name:names.get(id) ?? 'Item removido', quantity }))
      .sort((a,b) => b.quantity-a.quantity).slice(0,5);
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
  const maxTop = Math.max(1,...summary.top.map(x=>x.quantity));
  return <AppShell companyName={companyName} email={email} role="admin" companyId={companyId}
    basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''} signingOut={false} onSignOut={signOut}>
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-widest text-[#8054d8]">Gestão e desempenho</p>
          <h1 className="mt-2 text-3xl font-bold">Relatórios avançados</h1>
          <p className="mt-2 text-sm text-gray-500">Indicadores financeiros e operacionais da {companyName}.</p></div>
        <label className="text-sm font-semibold text-gray-600">Período
          <input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="mt-1 block rounded-xl border border-purple-100 bg-white px-3 py-2.5"/>
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
          <h2 className="font-bold">Itens mais locados</h2><p className="mt-1 text-xs text-gray-500">Quantidade de unidades nos registros carregados</p>
          {summary.top.length ? <div className="mt-5 space-y-4">{summary.top.map(item=><div key={item.name}>
            <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate">{item.name}</span><strong>{item.quantity}</strong></div>
            <div className="h-2 overflow-hidden rounded-full bg-purple-50"><div className="h-full rounded-full bg-[#8054d8]" style={{width:(item.quantity/maxTop*100)+'%'}}/></div>
          </div>)}</div> : <p className="mt-5 text-sm text-gray-500">Ainda não há itens de locação para exibir.</p>}
        </article>
        <article className="rounded-2xl border border-purple-100 bg-white p-5">
          <h2 className="font-bold">Situação das locações</h2><p className="mt-1 text-xs text-gray-500">Locações que cruzam o período selecionado</p>
          <div className="mt-4 space-y-3">{summary.statuses.length ? summary.statuses.map(([status,count])=><div key={status} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-3 text-sm"><span>{({pending:'Pendente',confirmed:'Confirmada',ongoing:'Em andamento',in_progress:'Em andamento',completed:'Concluída',draft:'Rascunho'} as Record<string,string>)[status] ?? status}</span><strong>{count}</strong></div>) : <p className="text-sm text-gray-500">Nenhuma locação neste período.</p>}</div>
          <div className="mt-5 rounded-xl bg-purple-50 p-4"><p className="text-xs text-purple-700">Valor contratado no período</p><p className="mt-1 text-xl font-bold text-purple-900">{brl(summary.booked)}</p></div>
        </article>
      </div>
      <p className="mt-5 text-xs leading-5 text-gray-400">Os indicadores consideram os registros disponíveis na empresa. Resultado é calculado por lançamentos financeiros; recebimentos são exibidos separadamente. Confira os lançamentos antes de usar os números como demonstrativo contábil.</p>
    </section>
  </AppShell>;
}
