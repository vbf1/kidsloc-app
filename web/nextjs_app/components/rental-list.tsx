import {
  formatRentalDate, formatRentalPrice, rentalStatusLabel,
  type RentalRecord,
} from '../lib/rentals';

type RentalListProps = {
  rentals: RentalRecord[];
  loading: boolean;
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onEdit: (rental: RentalRecord) => void;
};
const statusClasses: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-100',
  confirmed: 'bg-blue-50 text-blue-800 border-blue-100',
  ongoing: 'bg-purple-50 text-purple-800 border-purple-100',
  completed: 'bg-green-50 text-green-800 border-green-100',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
};
function RentalStatus({ status }: { status: RentalRecord['status'] }) {
  return <span className={'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ' + (statusClasses[status] ?? statusClasses.pending)}>{rentalStatusLabel(status)}</span>;
}
function isFixedPriceCombo(rental: RentalRecord) {
  return rental.items.length > 0 && rental.items.every((item) => Number(item.unit_price) === 0);
}
function RentalDetails({ rental }: { rental: RentalRecord }) {
  return (
    <div className="mt-2 space-y-1 text-xs leading-5 text-gray-500">
      <p>{rental.items.length ? rental.items.map((item) => item.product_name + ' × ' + item.quantity).join(', ') : 'Itens não disponíveis para este acesso'}</p>
      {isFixedPriceCombo(rental) && <p className="font-semibold text-purple-700">Combo fechado</p>}
      <p>Responsáveis: {rental.responsible_names.length ? rental.responsible_names.join(', ') : 'Não definidos'}</p>
      {rental.delivery_method === 'delivery' && rental.delivery_address && <p>Entrega: {rental.delivery_address}</p>}
    </div>
  );
}
export function RentalList({ rentals, loading, totalCount, page, pageSize, onPageChange, onEdit }: RentalListProps) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  if (loading) return <div role="status" className="rounded-2xl border border-purple-100 bg-white px-5 py-10 text-center text-sm text-gray-500">Carregando locações...</div>;
  if (!rentals.length) return <div className="rounded-2xl border border-dashed border-purple-200 bg-white px-5 py-10 text-center"><p className="font-semibold text-gray-800">Nenhuma locação encontrada</p><p className="mt-1 text-sm text-gray-500">Cadastre uma nova locação ou ajuste os filtros de pesquisa.</p></div>;
  return (
    <section aria-label="Lista de locações" className="space-y-4">
      <div className="hidden overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] border-collapse text-left text-sm">
            <thead className="bg-purple-50/70 text-xs uppercase tracking-wide text-gray-500">
              <tr><th className="px-4 py-3 font-semibold">Locação</th><th className="px-4 py-3 font-semibold">Cliente</th><th className="px-4 py-3 font-semibold">Período</th><th className="px-4 py-3 font-semibold">Itens</th><th className="px-4 py-3 font-semibold">Responsáveis</th><th className="px-4 py-3 font-semibold">Situação</th><th className="px-4 py-3 text-right font-semibold">Valor</th><th className="px-4 py-3 text-right font-semibold">Ação</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rentals.map((rental) => <tr key={rental.id} className="align-top hover:bg-purple-50/30">
                <td className="px-4 py-4 font-semibold text-gray-900">#{rental.rental_number}</td>
                <td className="px-4 py-4"><p className="font-semibold text-gray-800">{rental.customer_name}</p><p className="mt-1 text-xs text-gray-500">{rental.delivery_method === 'delivery' ? 'Entrega' : 'Retirada'}</p></td>
                <td className="px-4 py-4 whitespace-nowrap text-gray-600">{formatRentalDate(rental.start_date)} – {formatRentalDate(rental.end_date)}<p className="mt-1 text-xs text-gray-400">{rental.start_time?.slice(0,5) ?? '—'} às {rental.end_time?.slice(0,5) ?? '—'}</p></td>
                <td className="max-w-[220px] px-4 py-4 text-gray-600">{rental.items.map((item) => <p key={item.id}>{item.product_name} × {item.quantity}</p>)}{isFixedPriceCombo(rental) && <p className="mt-1 text-xs font-semibold text-purple-700">Combo fechado</p>}</td>
                <td className="max-w-[180px] px-4 py-4 text-xs text-gray-600">{rental.responsible_names.length ? rental.responsible_names.join(', ') : 'Não definidos'}</td>
                <td className="px-4 py-4"><RentalStatus status={rental.status} /></td>
                <td className="px-4 py-4 text-right font-semibold tabular-nums text-gray-900">{formatRentalPrice(rental.total_amount)}</td>
                <td className="px-4 py-4 text-right"><button type="button" onClick={() => onEdit(rental)} className="rounded-lg border border-purple-200 px-3 py-2 text-xs font-semibold text-[#6840bd] hover:bg-purple-50">Editar</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>
      <div className="space-y-3 md:hidden">
        {rentals.map((rental) => <article key={rental.id} className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-gray-400">Locação #{rental.rental_number}</p><h3 className="mt-1 font-bold text-gray-900">{rental.customer_name}</h3></div><RentalStatus status={rental.status} /></div>
          <p className="mt-3 text-sm text-gray-600">{formatRentalDate(rental.start_date)} – {formatRentalDate(rental.end_date)}</p>
          <p className="mt-1 text-xs text-gray-400">{rental.start_time?.slice(0,5) ?? '—'} às {rental.end_time?.slice(0,5) ?? '—'} · {rental.delivery_method === 'delivery' ? 'Entrega' : 'Retirada'}</p>
          <RentalDetails rental={rental} />
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3"><strong className="text-sm text-gray-900">{formatRentalPrice(rental.total_amount)}</strong><button type="button" onClick={() => onEdit(rental)} className="rounded-lg border border-purple-200 px-4 py-2 text-xs font-semibold text-[#6840bd] hover:bg-purple-50">Editar</button></div>
        </article>)}
      </div>
      {pageCount > 1 && <nav aria-label="Paginação de locações" className="flex flex-col gap-3 rounded-xl border border-purple-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">Mostrando {page * pageSize + 1}–{Math.min((page + 1) * pageSize, totalCount)} de {totalCount} locações</p>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 0} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40">Anterior</button>
          <span className="text-xs tabular-nums text-gray-500">Página {page + 1} de {pageCount}</span>
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page + 1 >= pageCount} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-40">Próxima</button>
        </div>
      </nav>}
    </section>
  );
}
