'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type RentalHistoryRow = {
  id: string;
  rental_number: number;
  start_date: string;
  end_date: string;
  status: string;
  total_amount: number | string;
};
type QuoteHistoryRow = {
  id: string;
  quote_number: number;
  issue_date: string;
  event_date: string | null;
  status: string;
  total_amount: number | string;
};
type ContractHistoryRow = {
  id: string;
  contract_number: number;
  rental_id: string;
  status: string;
  signed_at: string | null;
  token_expires_at: string | null;
};
type TransactionHistoryRow = {
  id: string;
  rental_id: string | null;
  description: string;
  amount: number | string;
  status: string;
  transaction_type: string;
  due_date: string | null;
};
type PaymentHistoryRow = { transaction_id: string | null; amount: number | string };

const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const dateLabel = (value: string | null) => value ? new Date(value + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data não informada';
const rentalStatus: Record<string, string> = { pending: 'Pendente', confirmed: 'Confirmada', ongoing: 'Em andamento', completed: 'Concluída', cancelled: 'Cancelada' };
const quoteStatus: Record<string, string> = { draft: 'Rascunho', sent: 'Enviado', accepted: 'Aprovado', rejected: 'Recusado', expired: 'Expirado', converted: 'Convertido em locação', cancelled: 'Cancelado' };
const contractStatus: Record<string, string> = { draft: 'Rascunho', sent: 'Enviado', viewed: 'Visualizado', signed: 'Assinado', cancelled: 'Cancelado', expired: 'Expirado' };

export function CustomerHistory({ companyId, customerId, canViewFinance }: { companyId: string; customerId: string; canViewFinance: boolean }) {
  const [rentals, setRentals] = useState<RentalHistoryRow[]>([]);
  const [quotes, setQuotes] = useState<QuoteHistoryRow[]>([]);
  const [contracts, setContracts] = useState<ContractHistoryRow[]>([]);
  const [received, setReceived] = useState(0);
  const [openBalance, setOpenBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) { setError('Histórico indisponível no momento.'); setLoading(false); return; }
      setLoading(true);
      setError('');
      try {
        const [rentalResult, quoteResult] = await Promise.all([
          supabase.from('rentals').select('id,rental_number,start_date,end_date,status,total_amount')
            .eq('company_id', companyId).eq('customer_id', customerId).order('start_date', { ascending: false }).limit(20),
          supabase.from('rental_quotes').select('id,quote_number,issue_date,event_date,status,total_amount')
            .eq('company_id', companyId).eq('customer_id', customerId).order('created_at', { ascending: false }).limit(20),
        ]);
        if (!active) return;
        if (rentalResult.error || quoteResult.error) setError('Parte do histórico não pôde ser carregada. Os dados disponíveis continuam exibidos.');
        const rentalRows = (rentalResult.data ?? []) as RentalHistoryRow[];
        const quoteRows = (quoteResult.data ?? []) as QuoteHistoryRow[];
        setRentals(rentalRows);
        setQuotes(quoteRows);
        const rentalIds = rentalRows.map((rental) => rental.id);
        if (!rentalIds.length) { setContracts([]); setReceived(0); setOpenBalance(0); return; }

        const [contractResult, transactionResult] = await Promise.all([
          supabase.from('rental_contracts').select('id,contract_number,rental_id,status,signed_at,token_expires_at')
            .eq('company_id', companyId).in('rental_id', rentalIds).order('created_at', { ascending: false }).limit(20),
          canViewFinance
            ? supabase.from('financial_transactions').select('id,rental_id,description,amount,status,transaction_type,due_date')
              .eq('company_id', companyId).in('rental_id', rentalIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (!active) return;
        if (contractResult.error || transactionResult.error) setError('Parte do histórico não pôde ser carregada. Os dados disponíveis continuam exibidos.');
        setContracts((contractResult.data ?? []) as ContractHistoryRow[]);
        if (canViewFinance) {
          const transactions = (transactionResult.data ?? []) as TransactionHistoryRow[];
          const incomeTransactions = transactions.filter((item) => item.transaction_type === 'income' && item.status !== 'cancelled');
          const transactionIds = incomeTransactions.map((item) => item.id);
          const paymentResult = transactionIds.length
            ? await supabase.from('payments').select('transaction_id,amount').eq('company_id', companyId).in('transaction_id', transactionIds)
            : { data: [], error: null };
          if (!active) return;
          if (paymentResult.error) setError('O histórico financeiro não pôde ser carregado. Os demais dados continuam disponíveis.');
          const payments = (paymentResult.data ?? []) as PaymentHistoryRow[];
          const paidByTransaction = new Map<string, number>();
          for (const payment of payments) {
            if (!payment.transaction_id) continue;
            paidByTransaction.set(payment.transaction_id, (paidByTransaction.get(payment.transaction_id) ?? 0) + Number(payment.amount || 0));
          }
          setReceived(incomeTransactions.reduce((sum, transaction) => {
            const paymentsTotal = paidByTransaction.get(transaction.id);
            return sum + (paymentsTotal ?? (transaction.status === 'paid' ? Number(transaction.amount || 0) : 0));
          }, 0));
          setOpenBalance(incomeTransactions.reduce((sum, transaction) =>
            sum + (transaction.status === 'paid' ? 0 : Math.max(0, Number(transaction.amount || 0) - (paidByTransaction.get(transaction.id) ?? 0))), 0));
        }
      } catch {
        if (active) setError('Não foi possível carregar o histórico deste cliente.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [companyId, customerId, canViewFinance]);

  if (loading) return <section aria-label="Histórico do cliente" className="rounded-2xl border border-gray-100 p-4"><p className="text-sm text-gray-500">Carregando histórico do cliente...</p></section>;

  return (
    <section aria-label="Histórico do cliente" className="space-y-4 border-t border-gray-100 pt-5">
      <div><h3 className="text-base font-bold text-gray-900">Histórico do cliente</h3><p className="mt-1 text-xs text-gray-500">Registros vinculados a este cadastro, conforme as permissões do seu perfil.</p></div>
      {error && <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{error}</p>}
      {canViewFinance && <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-700">Recebido</p><p className="mt-1 break-words text-lg font-bold text-emerald-900">{currency(received)}</p></div>
        <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-700">Saldo em aberto</p><p className="mt-1 break-words text-lg font-bold text-amber-900">{currency(openBalance)}</p></div>
      </div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-100 p-3">
          <h4 className="text-sm font-bold text-gray-800">Locações ({rentals.length})</h4>
          <div className="mt-2 space-y-2">{rentals.slice(0, 6).map((rental) => <div key={rental.id} className="border-t border-gray-100 pt-2 text-xs">
            <div className="flex items-start justify-between gap-2"><strong>Locação #{rental.rental_number}</strong><span>{rentalStatus[rental.status] ?? rental.status}</span></div>
            <p className="mt-1 text-gray-500">{dateLabel(rental.start_date)} a {dateLabel(rental.end_date)}</p>
            <p className="mt-1 font-semibold text-gray-800">{currency(Number(rental.total_amount || 0))}</p>
          </div>)}{!rentals.length && <p className="mt-2 text-xs text-gray-500">Nenhuma locação vinculada.</p>}</div>
        </div>
        <div className="rounded-xl border border-gray-100 p-3">
          <h4 className="text-sm font-bold text-gray-800">Orçamentos ({quotes.length})</h4>
          <div className="mt-2 space-y-2">{quotes.slice(0, 6).map((quote) => <div key={quote.id} className="border-t border-gray-100 pt-2 text-xs">
            <div className="flex items-start justify-between gap-2"><strong>Orçamento #{quote.quote_number}</strong><span>{quoteStatus[quote.status] ?? quote.status}</span></div>
            <p className="mt-1 text-gray-500">Evento: {dateLabel(quote.event_date)} · Emissão: {dateLabel(quote.issue_date)}</p>
            <p className="mt-1 font-semibold text-gray-800">{currency(Number(quote.total_amount || 0))}</p>
          </div>)}{!quotes.length && <p className="mt-2 text-xs text-gray-500">Nenhum orçamento vinculado.</p>}</div>
        </div>
        <div className="rounded-xl border border-gray-100 p-3 sm:col-span-2">
          <h4 className="text-sm font-bold text-gray-800">Contratos ({contracts.length})</h4>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">{contracts.slice(0, 8).map((contract) => <div key={contract.id} className="rounded-lg bg-gray-50 p-2 text-xs">
            <div className="flex items-center justify-between gap-2"><strong>Contrato #{contract.contract_number}</strong><span>{contract.status === 'signed' ? 'Assinado' : ['sent', 'viewed'].includes(contract.status) && contract.token_expires_at && new Date(contract.token_expires_at).getTime() < Date.now() ? 'Expirado' : contractStatus[contract.status] ?? contract.status}</span></div>
            {contract.signed_at && <p className="mt-1 text-gray-500">Assinado em {new Date(contract.signed_at).toLocaleDateString('pt-BR')}</p>}
          </div>)}{!contracts.length && <p className="text-xs text-gray-500">Nenhum contrato vinculado às locações deste cliente.</p>}</div>
        </div>
      </div>
      {!canViewFinance && <p className="text-[11px] text-gray-500">As informações financeiras são visíveis somente para administradores.</p>}
    </section>
  );
}
