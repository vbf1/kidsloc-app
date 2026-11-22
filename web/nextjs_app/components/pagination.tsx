'use client';

type PaginationProps = { totalCount: number; page: number; pageSize: number; onPageChange: (page: number) => void };

export function Pagination({ totalCount, page, pageSize, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalCount <= pageSize) return null;
  const first = page * pageSize + 1;
  const last = Math.min((page + 1) * pageSize, totalCount);
  return <nav aria-label="Paginação" className="flex flex-col gap-3 rounded-xl border border-purple-100 bg-white p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
    <p className="text-xs text-gray-500">Mostrando {first}–{last} de {totalCount} registros · Página {page + 1} de {pageCount}</p>
    <div className="flex items-center justify-between gap-2 sm:justify-end">
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 0} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page + 1 >= pageCount} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">Próxima</button>
    </div>
  </nav>;
}
