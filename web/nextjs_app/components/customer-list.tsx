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
function CustomerDetails({ customer }: { customer: CustomerRecord }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      <div><dt className="text-xs text-gray-400">CPF</dt><dd className="mt-1 break-words text-gray-800">{displayValue(customer.cpf)}</dd></div>
      <div><dt className="text-xs text-gray-400">RG</dt><dd className="mt-1 break-words text-gray-800">{displayValue(customer.rg)}</dd></div>
      <div><dt className="text-xs text-gray-400">CEP</dt><dd className="mt-1 break-words text-gray-800">{displayValue(customer.zip)}</dd></div>
      <div><dt className="text-xs text-gray-400">Endereço</dt><dd className="mt-1 break-words text-gray-800">{displayValue(customer.address)}</dd></div>
      <div><dt className="text-xs text-gray-400">Bairro</dt><dd className="mt-1 break-words text-gray-800">{displayValue(customer.neighborhood)}</dd></div>
      <div><dt className="text-xs text-gray-400">Cidade / UF</dt><dd className="mt-1 break-words text-gray-800">{displayValue(customer.city_state)}</dd></div>
      <div className="sm:col-span-2"><dt className="text-xs text-gray-400">Observações</dt><dd className="mt-1 whitespace-pre-wrap break-words text-gray-800">{displayValue(customer.notes)}</dd></div>
    </dl>
  );
}
function EditButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-lg border border-purple-200 px-3 py-2 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50">Editar</button>;
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
      <div className="hidden overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm md:block">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div><h2 className="font-bold text-gray-900">Lista de clientes</h2><p className="mt-1 text-xs text-gray-500">Nome, contato e cadastro em uma visualização.</p></div>
          <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-[#6840bd]">{totalCount} {totalCount === 1 ? 'cliente' : 'clientes'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3 font-semibold">Cliente</th><th className="px-5 py-3 font-semibold">Contato</th><th className="px-5 py-3 font-semibold">Cadastro</th><th className="px-5 py-3 text-right font-semibold">Ação</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((customer) => <tr key={customer.id} className="align-top transition hover:bg-purple-50/30">
                <td className="px-5 py-4"><p className="font-semibold text-gray-900">{customer.name}</p><details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-[#6840bd]">Ver dados completos</summary><div className="mt-3 max-w-xl rounded-xl bg-gray-50 p-4"><CustomerDetails customer={customer} /></div></details></td>
                <td className="px-5 py-4"><p className="text-gray-800">{displayValue(customer.phone)}</p><p className="mt-1 break-all text-xs text-gray-500">{customer.email || 'Sem e-mail'}</p></td>
                <td className="px-5 py-4 text-gray-500">{formatDate(customer.created_at)}</td>
                <td className="px-5 py-4 text-right"><EditButton onClick={() => onEdit(customer)} /></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="space-y-3 md:hidden">
        {customers.map((customer) => <li key={customer.id} className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-bold text-gray-900">{customer.name}</h2><p className="mt-1 break-all text-sm text-gray-600">{displayValue(customer.phone)}</p><p className="mt-1 break-all text-xs text-gray-500">{customer.email || 'Sem e-mail'}</p></div><EditButton onClick={() => onEdit(customer)} /></div>
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3"><details><summary className="cursor-pointer text-sm font-semibold text-[#6840bd]">Dados completos</summary><div className="mt-3"><CustomerDetails customer={customer} /></div></details><span className="text-xs text-gray-400">{formatDate(customer.created_at)}</span></div>
        </li>)}
      </ul>
      <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-gray-500">Mostrando {customers.length} de {totalCount} {totalCount === 1 ? 'cliente' : 'clientes'} · Página {page + 1} de {pageCount}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 0} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page + 1 >= pageCount} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">Próxima</button>
        </div>
      </div>
    </div>
  );
}
