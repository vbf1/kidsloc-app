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
      <ul className="space-y-3">
        {products.map((product) => (
          <li key={product.id} className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words text-base font-bold text-gray-900">{product.name}</h2>
                  <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-[#6840bd]">{product.item_type === 'toy' ? 'Brinquedo' : 'Serviço'}</span>
                  <span className={product.active ? 'rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700' : 'rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600'}>{product.active ? 'Ativo' : 'Inativo'}</span>
                </div>
                {product.description && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-600">{product.description}</p>}
                <p className="mt-2 text-sm font-semibold text-gray-800">{formatPrice(product.item_type === 'toy' ? product.daily_price : product.event_price)} <span className="font-normal text-gray-500">{product.item_type === 'toy' ? 'por dia' : 'por evento'}</span></p>
                {product.item_type === 'toy' && <p className="mt-1 text-xs text-gray-500">{product.inventory_mode === 'individual' ? 'Controle por unidades individuais' : 'Controle por quantidade'} · {product.total_quantity} {product.total_quantity === 1 ? 'unidade' : 'unidades'}</p>}
                <p className="mt-2 text-xs text-gray-400">Cadastrado em {formatDate(product.created_at)}</p>
              </div>
              <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onEdit(product)} className="rounded-lg border border-purple-200 px-3 py-2 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50">Editar</button>{product.item_type === 'toy' && product.inventory_mode === 'individual' && <button type="button" onClick={() => onManageUnits(product)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">Gerenciar unidades</button>}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-gray-500">{totalCount} {totalCount === 1 ? 'item' : 'itens'} · Página {page + 1} de {pageCount}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 0} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page + 1 >= pageCount} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">Próxima</button>
        </div>
      </div>
    </div>
  );
}
