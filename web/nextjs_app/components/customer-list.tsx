'use client';
import type { CustomerRecord } from '../lib/customers';
type CustomerListProps = {
  customers: CustomerRecord[]; loading: boolean; totalCount: number; page: number; pageSize: number;
  onPageChange: (page: number) => void; onEdit: (customer: CustomerRecord) => void;
};
function displayValue(value: string | null): string { return value?.trim() || 'Não informado'; }
function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data não disponível';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}
export function CustomerList({ customers, loading, totalCount, page, pageSize, onPageChange, onEdit }: CustomerListProps) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  if (loading) return <p role="status" className="rounded-2xl border border-purple-100 bg-white p-6 text-sm text-gray-500">Carregando clientes...</p>;
  if (customers.length === 0) return (
    <div className="rounded-2xl border border-dashed border-purple-200 bg-white p-8 text-center">
      <div aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-2xl bg-purple-50 text-2xl">👥</div>
      <h2 className="mt-4 text-lg font-bold text-gray-900">Nenhum cliente encontrado</h2>
      <p className="mt-2 text-sm text-gray-500">Cadastre o primeiro cliente ou ajuste sua pesquisa.</p>
    </div>
  );
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {customers.map((customer) => (
          <li key={customer.id} className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="break-words text-base font-bold text-gray-900">{customer.name}</h2>
                <p className="mt-1 break-all text-sm text-gray-600">{displayValue(customer.phone)}</p>
                {customer.email && <p className="mt-1 break-all text-sm text-gray-500">{customer.email}</p>}
                <p className="mt-2 text-xs text-gray-400">Cadastrado em {formatDate(customer.created_at)}</p>
              </div>
              <button type="button" onClick={() => onEdit(customer)} className="rounded-lg border border-purple-200 px-3 py-2 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50">Editar</button>
            </div>
            <details className="mt-4 border-t border-gray-100 pt-3">
              <summary className="cursor-pointer text-sm font-semibold text-[#6840bd]">Ver dados completos</summary>
              <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-gray-400">CPF</dt><dd className="mt-1 break-words text-gray-800">{displayValue(customer.cpf)}</dd></div>
                <div><dt className="text-xs text-gray-400">RG</dt><dd className="mt-1 break-words text-gray-800">{displayValue(customer.rg)}</dd></div>
                <div><dt className="text-xs text-gray-400">CEP</dt><dd className="mt-1 break-words text-gray-800">{displayValue(customer.zip)}</dd></div>
                <div><dt className="text-xs text-gray-400">Endereço</dt><dd className="mt-1 break-words text-gray-800">{displayValue(customer.address)}</dd></div>
                <div><dt className="text-xs text-gray-400">Bairro</dt><dd className="mt-1 break-words text-gray-800">{displayValue(customer.neighborhood)}</dd></div>
                <div><dt className="text-xs text-gray-400">Cidade / UF</dt><dd className="mt-1 break-words text-gray-800">{displayValue(customer.city_state)}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-gray-400">Observações</dt><dd className="mt-1 whitespace-pre-wrap break-words text-gray-800">{displayValue(customer.notes)}</dd></div>
              </dl>
            </details>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-gray-500">{totalCount} {totalCount === 1 ? 'cliente' : 'clientes'} · Página {page + 1} de {pageCount}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 0} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page + 1 >= pageCount} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">Próxima</button>
        </div>
      </div>
    </div>
  );
}
