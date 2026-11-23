'use client';

import { useMemo } from 'react';

type FinanceChartTransaction = {
  id: string;
  transaction_type: 'income' | 'expense';
  category: string | null;
  description: string;
  amount: number | string;
  due_date: string | null;
  paid_at: string | null;
  status: 'pending' | 'paid' | 'cancelled';
};

type MonthPoint = { key: string; label: string; income: number; expense: number; result: number };

const currency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

function chartDate(transaction: FinanceChartTransaction) {
  const value = transaction.due_date || transaction.paid_at;
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function EmptyChart({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-44 items-center justify-center rounded-xl bg-slate-50 px-4 text-center text-sm text-slate-500">{children}</div>;
}

export function FinanceCharts({ transactions }: { transactions: FinanceChartTransaction[] }) {
  const months = useMemo<MonthPoint[]>(() => {
    const now = new Date();
    const points = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      return {
        key: monthKey(date),
        label: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', ''),
        income: 0,
        expense: 0,
        result: 0,
      };
    });
    const byMonth = new Map(points.map((point) => [point.key, point]));
    transactions.forEach((transaction) => {
      if (transaction.status === 'cancelled') return;
      const date = chartDate(transaction);
      if (!date) return;
      const point = byMonth.get(monthKey(date));
      if (!point) return;
      const amount = Number(transaction.amount) || 0;
      if (transaction.transaction_type === 'income') point.income += amount;
      else point.expense += amount;
      point.result = point.income - point.expense;
    });
    return points;
  }, [transactions]);

  const expenses = useMemo(() => {
    const start = months[0]?.key;
    const end = months[months.length - 1]?.key;
    const grouped = new Map<string, number>();
    transactions.forEach((transaction) => {
      if (transaction.status === 'cancelled' || transaction.transaction_type !== 'expense') return;
      const date = chartDate(transaction);
      if (!date) return;
      const key = monthKey(date);
      if (key < start || key > end) return;
      const category = transaction.category?.trim() || 'Sem categoria';
      grouped.set(category, (grouped.get(category) ?? 0) + (Number(transaction.amount) || 0));
    });
    const sorted = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length <= 5) return sorted;
    const top = sorted.slice(0, 4);
    top.push(['Outras categorias', sorted.slice(4).reduce((sum, item) => sum + item[1], 0)]);
    return top;
  }, [transactions, months]);

  const maxValue = Math.max(1, ...months.flatMap((month) => [month.income, month.expense]));
  const maxAbsResult = Math.max(1, ...months.map((month) => Math.abs(month.result)));
  const totalExpenses = expenses.reduce((sum, item) => sum + item[1], 0);
  const colors = ['#8054d8', '#e7a928', '#0f9f79', '#e16b6b', '#64748b'];
  const circumference = 2 * Math.PI * 42;

  return (
    <section className="space-y-3" aria-labelledby="finance-charts-title">
      <div>
        <h2 id="finance-charts-title" className="text-lg font-bold text-slate-900">Visão gráfica</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">Resumo visual dos lançamentos dos últimos 6 meses, agrupados pelo vencimento (ou data de recebimento, quando não há vencimento).</p>
      </div>
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="font-bold text-slate-900">Receitas x despesas</h3>
          <p className="mt-1 text-xs text-slate-500">Comparação mensal dos valores lançados</p>
          {months.some((month) => month.income || month.expense) ? (
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
                <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-[#8054d8]" />Receitas</span>
                <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-[#e7a928]" />Despesas</span>
              </div>
              <div className="grid h-44 grid-cols-6 items-end gap-2 border-b border-slate-200 pb-1">
                {months.map((month) => (
                  <div key={month.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
                    <div className="flex h-full w-full items-end justify-center gap-1">
                      <div title={`Receitas: ${currency(month.income)}`} className="w-3 rounded-t bg-[#8054d8] sm:w-5" style={{ height: `${Math.max(month.income ? 3 : 0, (month.income / maxValue) * 100)}%` }} />
                      <div title={`Despesas: ${currency(month.expense)}`} className="w-3 rounded-t bg-[#e7a928] sm:w-5" style={{ height: `${Math.max(month.expense ? 3 : 0, (month.expense / maxValue) * 100)}%` }} />
                    </div>
                    <span className="text-[10px] capitalize text-slate-500">{month.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-slate-400"><span>{currency(0)}</span><span>Maior valor: {currency(maxValue)}</span></div>
            </div>
          ) : <EmptyChart>Não há lançamentos com data nos últimos 6 meses para comparar.</EmptyChart>}
        </article>

        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="font-bold text-slate-900">Evolução do resultado</h3>
          <p className="mt-1 text-xs text-slate-500">Receitas menos despesas em cada mês</p>
          {months.some((month) => month.result !== 0) ? (
            <div className="mt-5">
              <div className="relative h-44 border-b border-slate-200">
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-300" />
                <svg viewBox="0 0 600 160" preserveAspectRatio="none" className="h-full w-full overflow-visible" role="img" aria-label="Gráfico de linha do resultado mensal">
                  <polyline fill="none" stroke="#8054d8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={months.map((month, index) => `${index * 100 + 50},${80 - (month.result / maxAbsResult) * 65}`).join(' ')} />
                  {months.map((month, index) => <circle key={month.key} cx={index * 100 + 50} cy={80 - (month.result / maxAbsResult) * 65} r="5" fill="#8054d8"><title>{`${month.label}: ${currency(month.result)}`}</title></circle>)}
                </svg>
              </div>
              <div className="mt-2 grid grid-cols-6 gap-1 text-center text-[10px] capitalize text-slate-500">{months.map((month) => <span key={month.key}>{month.label}</span>)}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">{months.slice(-2).map((month) => <div key={month.key} className="rounded-xl bg-slate-50 p-2"><p className="text-[10px] capitalize text-slate-500">{month.label}</p><p className={`mt-1 text-sm font-bold ${month.result >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{currency(month.result)}</p></div>)}</div>
            </div>
          ) : <EmptyChart>O resultado será exibido quando houver receitas ou despesas lançadas no período.</EmptyChart>}
        </article>

        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2 sm:p-5">
          <h3 className="font-bold text-slate-900">Distribuição das despesas</h3>
          <p className="mt-1 text-xs text-slate-500">Despesas por categoria nos últimos 6 meses</p>
          {totalExpenses > 0 ? (
            <div className="mt-4 grid min-w-0 items-center gap-5 sm:grid-cols-[minmax(160px,220px)_1fr]">
              <div className="relative mx-auto aspect-square w-full max-w-[220px]">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label="Gráfico de rosca da distribuição das despesas">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                  {expenses.map(([category, amount], index) => {
                    const length = (amount / totalExpenses) * circumference;
                    const offset = expenses.slice(0, index).reduce((sum, item) => sum + (item[1] / totalExpenses) * circumference, 0);
                    return <circle key={category} cx="50" cy="50" r="42" fill="none" stroke={colors[index % colors.length]} strokeWidth="12" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset}><title>{`${category}: ${currency(amount)}`}</title></circle>;
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center"><span className="text-[10px] text-slate-500">Total</span><strong className="text-lg text-slate-900">{currency(totalExpenses)}</strong></div>
              </div>
              <div className="min-w-0 space-y-3">
                {expenses.map(([category, amount], index) => (
                  <div key={category} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 font-semibold text-slate-700"><i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colors[index % colors.length] }} /><span className="truncate">{category}</span></span><span className="shrink-0 font-bold text-slate-800">{currency(amount)} · {Math.round((amount / totalExpenses) * 100)}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(amount / totalExpenses) * 100}%`, backgroundColor: colors[index % colors.length] }} /></div>
                  </div>
                ))}
              </div>
            </div>
          ) : <EmptyChart>Não há despesas categorizadas com data nos últimos 6 meses.</EmptyChart>}
        </article>
      </div>
    </section>
  );
}
