'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useCompanyRealtimeRefresh } from '../lib/use-company-realtime';
import { useResponsivePageSize } from '../lib/use-responsive-page-size';
import { Pagination } from './pagination';

type Tx = { id: string; transaction_type: 'income' | 'expense'; amount: number | string; status: string; due_date: string | null; paid_at: string | null };
type Rental = { id: string; rental_number: number; start_date: string; end_date: string; status: string; total_amount: number | string };
type Product = { id: string; name: string };
type RentalItem = { rental_id: string; product_id: string; quantity: number; subtotal: number | string };
type PagedQuery<T> = { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> };
const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const iso = (d: Date) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');

async function fetchAllRows<T>(query: PagedQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query.range(offset, offset + 999);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export function AdvancedReportsSection({ companyId }: { companyId: string }) {
  const [month, setMonth] = useState(() => iso(new Date()).slice(0, 7));
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [payments, setPayments] = useState<{ transaction_id: string | null; amount: number | string; paid_at: string }[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [items, setItems] = useState<RentalItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [topPage, setTopPage] = useState(0);
  const pageSize = useResponsivePageSize();

  async function load() {
    if (!supabase || !companyId) return;
    await Promise.resolve();
    setError('');
    try {
      const [txRows, paymentRows, rentalRows, productRows, itemRows] = await Promise.all([
        fetchAllRows<Tx>(supabase.from('financial_transactions').select('id,transaction_type,amount,status,due_date,paid_at').eq('company_id', companyId).neq('status', 'cancelled').order('id', { ascending: true })),
        fetchAllRows<{ transaction_id: string | null; amount: number | string; paid_at: string }>(supabase.from('payments').select('transaction_id,amount,paid_at').eq('company_id', companyId).order('id', { ascending: true })),
        fetchAllRows<Rental>(supabase.from('rentals').select('id,rental_number,start_date,end_date,status,total_amount').eq('company_id', companyId).neq('status', 'cancelled').order('id', { ascending: true })),
        fetchAllRows<Product>(supabase.from('products').select('id,name').eq('company_id', companyId).order('id', { ascending: true })),
        fetchAllRows<RentalItem>(supabase.from('rental_items').select('rental_id,product_id,quantity,subtotal').eq('company_id', companyId).order('id', { ascending: true })),
      ]);
      setTransactions(txRows); setPayments(paymentRows); setRentals(rentalRows); setProducts(productRows); setItems(itemRows);
    } catch {
      setError('Não foi possível carregar os indicadores avançados deste período.');
    } finally {
      setLoading(false);
    }
  }

  // Load the selected company's reporting data on entry and after realtime refreshes.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [companyId, refresh]);
  useCompanyRealtimeRefresh(companyId, ['financial_transactions', 'payments', 'rentals', 'rental_items', 'products'], () => setRefresh(v => v + 1));

  const from = month + '-01';
  const until = iso(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  const summary = useMemo(() => {
    const tx = transactions.filter(t => (t.due_date ?? t.paid_at ?? '').slice(0, 7) === month);
    const income = tx.filter(t => t.transaction_type === 'income');
    const expenses = tx.filter(t => t.transaction_type === 'expense');
    const received = payments.filter(p => p.paid_at.slice(0, 7) === month).reduce((s, p) => s + Number(p.amount), 0);
    const revenue = income.reduce((s, t) => s + Number(t.amount), 0);
    const expense = expenses.reduce((s, t) => s + Number(t.amount), 0);
    const paidBy = new Map<string, number>();
    for (const payment of payments) if (payment.transaction_id) paidBy.set(payment.transaction_id, (paidBy.get(payment.transaction_id) ?? 0) + Number(payment.amount));
    const pending = income.reduce((s, t) => s + Math.max(0, Number(t.amount) - (paidBy.get(t.id) ?? (t.status === 'paid' ? Number(t.amount) : 0))), 0);
    const activeRentals = rentals.filter(r => r.start_date <= until && r.end_date >= from);
    const activeIds = new Set(activeRentals.map(r => r.id));
    const booked = activeRentals.reduce((s, r) => s + Number(r.total_amount), 0);
    const productTotals = new Map<string, { quantity: number; gross: number; rentalIds: Set<string> }>();
    for (const item of items) {
      if (!activeIds.has(item.rental_id)) continue;
      const current = productTotals.get(item.product_id) ?? { quantity: 0, gross: 0, rentalIds: new Set<string>() };
      current.quantity += Number(item.quantity); current.gross += Number(item.subtotal); current.rentalIds.add(item.rental_id);
      productTotals.set(item.product_id, current);
    }
    const names = new Map(products.map(p => [p.id, p.name]));
    const grossTotal = [...productTotals.values()].reduce((s, p) => s + p.gross, 0);
    const top = [...productTotals.entries()].map(([id, p]) => {
      const allocatedExpense = grossTotal > 0 ? expense * p.gross / grossTotal : 0;
      return { name: names.get(id) ?? 'Item removido', quantity: p.quantity, rentals: p.rentalIds.size, gross: p.gross, allocatedExpense, net: p.gross - allocatedExpense };
    }).sort((a, b) => b.gross - a.gross);
    const statuses = new Map<string, number>();
    for (const rental of activeRentals) statuses.set(rental.status, (statuses.get(rental.status) ?? 0) + 1);
    return { revenue, received, expense, result: revenue - expense, pending, rentals: activeRentals.length, booked, top, statuses: [...statuses.entries()] };
  }, [transactions, payments, rentals, items, products, month, from, until]);
  const maxTop = Math.max(1, ...summary.top.map(item => item.gross));

  return <section className="space-y-4 rounded-2xl border border-purple-100 bg-purple-50/40 p-4 sm:p-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-[#8054d8]">Análise do período</p><h2 className="mt-1 text-xl font-extrabold text-slate-900">Relatórios e desempenho</h2><p className="mt-1 text-sm text-slate-500">Indicadores financeiros e operacionais reunidos ao financeiro.</p></div>
      <label className="text-sm font-semibold text-gray-600">Período<input type="month" value={month} onChange={e => { setMonth(e.target.value); setTopPage(0); }} className="mt-1 block rounded-xl border border-purple-100 bg-white px-3 py-2.5" /></label>
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading ? <p className="rounded-xl bg-white p-4 text-sm text-slate-500">Carregando indicadores do período...</p> : <>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-purple-100 bg-white p-4">
          <h3 className="font-bold">Desempenho financeiro por brinquedo</h3><p className="mt-1 text-xs text-gray-500">Faturamento bruto, despesas rateadas e lucro líquido estimado no período.</p>
          {summary.top.length ? <><div className="mt-4 space-y-4">{summary.top.slice(topPage * pageSize, (topPage + 1) * pageSize).map(item => <div key={item.name} className="border-b border-gray-100 pb-3 last:border-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm"><strong className="truncate">{item.name}</strong><span className="text-xs text-gray-500">{item.rentals} locações · {item.quantity} unidades</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-purple-50"><div className="h-full rounded-full bg-[#8054d8]" style={{ width: (item.gross / maxTop * 100) + '%' }} /></div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs"><span><span className="block text-gray-400">Bruto</span><strong>{brl(item.gross)}</strong></span><span><span className="block text-gray-400">Despesas</span><strong>{brl(item.allocatedExpense)}</strong></span><span><span className="block text-gray-400">Líquido*</span><strong className={item.net < 0 ? 'text-red-600' : 'text-green-700'}>{brl(item.net)}</strong></span></div>
          </div>)}</div><Pagination totalCount={summary.top.length} page={topPage} pageSize={pageSize} onPageChange={setTopPage} /></> : <p className="mt-4 text-sm text-gray-500">Ainda não há itens de locação para exibir.</p>}
        </article>
        <article className="rounded-xl border border-purple-100 bg-white p-4">
          <h3 className="font-bold">Situação das locações</h3><p className="mt-1 text-xs text-gray-500">Locações que cruzam o período selecionado.</p><p className="mt-3 text-sm font-semibold text-purple-800">{summary.rentals} {summary.rentals === 1 ? 'locação' : 'locações'} no período</p>
          <div className="mt-4 space-y-3">{summary.statuses.length ? summary.statuses.map(([status, count]) => <div key={status} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-3 text-sm"><span>{({ pending: 'Pendente', confirmed: 'Confirmada', ongoing: 'Em andamento', in_progress: 'Em andamento', completed: 'Concluída', draft: 'Rascunho' } as Record<string, string>)[status] ?? status}</span><strong>{count}</strong></div>) : <p className="text-sm text-gray-500">Nenhuma locação neste período.</p>}</div>
          <div className="mt-5 rounded-xl bg-purple-50 p-4"><p className="text-xs text-purple-700">Valor contratado no período</p><p className="mt-1 text-xl font-bold text-purple-900">{brl(summary.booked)}</p></div>
        </article>
      </div>
      <p className="text-xs leading-5 text-gray-400">*Lucro líquido estimado: as despesas financeiras registradas no mês são distribuídas proporcionalmente ao faturamento bruto de cada brinquedo. Custos não lançados no financeiro não entram no cálculo. O resultado é gerencial e não substitui demonstrativos contábeis.</p>
    </>}
  </section>;
}
