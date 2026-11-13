'use client';
import type { ProductRecord } from '../lib/products';
import { formatPrice } from '../lib/products';
type ProductListProps = {
  products: ProductRecord[];
  loading: boolean;
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onEdit: (product: ProductRecord) => void;
  onManageUnits: (product: ProductRecord) => void;
};
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}
function ProductActions({ product, onEdit, onManageUnits }: { product: ProductRecord; onEdit: () => void; onManageUnits: () => void }) {
  return <div className="flex flex-wrap gap-2"><button type="button" onClick={onEdit} className="rounded-lg border border-purple-200 px-3 py-2 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50">Editar</button>{product.item_type === 'toy' && product.inventory_mode === 'individual' && <button type="button" onClick={onManageUnits} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">Unidades</button>}</div>;
}
function ProductStatus({ active }: { active: boolean }) {
  return <span className={active ? 'inline-flex rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700' : 'inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600'}>{active ? 'Ativo' : 'Inativo'}</span>;
}
export function ProductList({ products, loading, totalCount, page, pageSize, onPageChange, onEdit, onManageUnits }: ProductListProps) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  if (loading) return <p role="status" className="rounded-2xl border border-purple-100 bg-white p-6 text-sm text-gray-500">Carregando catálogo...</p>;
  if (products.length === 0) return (
    <div className="rounded-2xl border border-dashed border-purple-200 bg-white p-8 text-center">
      <div aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-2xl bg-purple-50 text-2xl">🧸</div>
      <h2 className="mt-4 text-lg font-bold text-gray-900">Nenhum item encontrado</h2>
      <p className="mt-2 text-sm text-gray-500">Cadastre um brinquedo ou serviço, ou ajuste os filtros.</p>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="hidden overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm md:block">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h2 className="font-bold text-gray-900">Itens do catálogo</h2><p className="mt-1 text-xs text-gray-500">Preço, disponibilidade e estoque organizados por coluna.</p></div><span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-[#6840bd]">{totalCount} {totalCount === 1 ? 'item' : 'itens'}</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-5 py-3 font-semibold">Item</th><th className="px-4 py-3 font-semibold">Tipo</th><th className="px-4 py-3 font-semibold">Preço</th><th className="px-4 py-3 font-semibold">Estoque</th><th className="px-4 py-3 font-semibold">Situação</th><th className="px-5 py-3 text-right font-semibold">Ações</th></tr></thead>
          <tbody className="divide-y divide-gray-100">{products.map((product) => <tr key={product.id} className="align-middle transition hover:bg-purple-50/30">
            <td className="px-5 py-4"><p className="font-semibold text-gray-900">{product.name}</p>{product.description && <p className="mt-1 max-w-xs truncate text-xs text-gray-500">{product.description}</p>}</td>
            <td className="px-4 py-4"><span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-[#6840bd]">{product.item_type === 'toy' ? 'Brinquedo' : 'Serviço'}</span></td>
            <td className="px-4 py-4 font-semibold text-gray-900">{formatPrice(product.item_type === 'toy' ? product.daily_price : product.event_price)}<p className="mt-1 text-xs font-normal text-gray-500">{product.item_type === 'toy' ? 'por diária' : 'por evento'}</p></td>
            <td className="px-4 py-4 text-gray-600">{product.item_type === 'service' ? 'Não se aplica' : product.inventory_mode === 'individual' ? 'Unidades individuais' : product.total_quantity + (product.total_quantity === 1 ? ' unidade' : ' unidades')}</td>
            <td className="px-4 py-4"><ProductStatus active={product.active} /></td>
            <td className="px-5 py-4"><div className="flex justify-end"><ProductActions product={product} onEdit={() => onEdit(product)} onManageUnits={() => onManageUnits(product)} /></div></td>
          </tr>)}</tbody>
        </table></div>
      </div>
      <ul className="space-y-3 md:hidden">{products.map((product) => <li key={product.id} className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words font-bold text-gray-900">{product.name}</h2><ProductStatus active={product.active} /></div>{product.description && <p className="mt-1 text-sm text-gray-500">{product.description}</p>}</div><span className="shrink-0 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-[#6840bd]">{product.item_type === 'toy' ? 'Brinquedo' : 'Serviço'}</span></div>
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3"><div><p className="text-xs text-gray-500">Preço</p><p className="mt-1 font-bold text-gray-900">{formatPrice(product.item_type === 'toy' ? product.daily_price : product.event_price)}</p><p className="text-xs text-gray-500">{product.item_type === 'toy' ? 'por diária' : 'por evento'}</p></div><div><p className="text-xs text-gray-500">Estoque</p><p className="mt-1 text-sm font-semibold text-gray-800">{product.item_type === 'service' ? 'Não se aplica' : product.inventory_mode === 'individual' ? 'Unidades individuais' : product.total_quantity + (product.total_quantity === 1 ? ' unidade' : ' unidades')}</p></div></div>
        <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-gray-400">Cadastro: {formatDate(product.created_at)}</span><ProductActions product={product} onEdit={() => onEdit(product)} onManageUnits={() => onManageUnits(product)} /></div>
      </li>)}</ul>
      <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-gray-500">Mostrando {products.length} de {totalCount} {totalCount === 1 ? 'item' : 'itens'} · Página {page + 1} de {pageCount}</p>
        <div className="flex gap-2"><button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 0} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button><button type="button" onClick={() => onPageChange(page + 1)} disabled={page + 1 >= pageCount} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">Próxima</button></div>
      </div>
    </div>
  );
}
