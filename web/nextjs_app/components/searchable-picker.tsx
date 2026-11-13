'use client';

import { useEffect, useMemo, useState } from 'react';

type PickerOption = {
  value: string;
  label: string;
  description?: string;
};

type SearchablePickerProps = {
  title: string;
  value: string;
  options: PickerOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function SearchablePicker({
  title, value, options, placeholder, searchPlaceholder, emptyText, disabled = false, onChange,
}: SearchablePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = options.find((option) => option.value === value);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return options;
    return options.filter((option) => `${option.label} ${option.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(term));
  }, [options, search]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function choose(option: PickerOption) {
    onChange(option.value);
    setOpen(false);
    setSearch('');
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm text-gray-900 shadow-sm transition hover:border-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
      >
        <span className={selected ? 'min-w-0 flex-1 truncate' : 'min-w-0 flex-1 truncate text-gray-400'}>
          {selected?.label ?? placeholder}
        </span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5 shrink-0 text-gray-400">
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) { setOpen(false); setSearch(''); } }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="searchable-picker-title"
            className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 id="searchable-picker-title" className="text-base font-bold text-gray-900">{title}</h2>
                <p className="mt-0.5 text-xs text-gray-500">{options.length} {options.length === 1 ? 'opção disponível' : 'opções disponíveis'}</p>
              </div>
              <button type="button" onClick={() => { setOpen(false); setSearch(''); }} aria-label="Fechar seleção" className="grid size-9 place-items-center rounded-full text-xl text-gray-500 hover:bg-gray-100">×</button>
            </div>
            <div className="border-b border-gray-100 p-4">
              <label className="sr-only" htmlFor="searchable-picker-search">Pesquisar opções</label>
              <div className="relative">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-400">
                  <circle cx="8.8" cy="8.8" r="5.8" stroke="currentColor" strokeWidth="1.6" />
                  <path d="m13.2 13.2 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <input id="searchable-picker-search" autoFocus type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#8054d8] focus:bg-white focus:ring-2 focus:ring-purple-100" />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox" aria-label={title}>
              {filtered.length ? filtered.map((option) => {
                const active = option.value === value;
                return (
                  <button key={option.value} type="button" role="option" aria-selected={active} onClick={() => choose(option)} className={'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ' + (active ? 'bg-purple-50 text-[#6840bd]' : 'text-gray-800 hover:bg-gray-50')}>
                    <span className={'grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold ' + (active ? 'bg-purple-100 text-[#6840bd]' : 'bg-gray-100 text-gray-500')}>{option.label.trim().charAt(0).toLocaleUpperCase('pt-BR')}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{option.label}</span>
                      {option.description && <span className="mt-0.5 block truncate text-xs text-gray-500">{option.description}</span>}
                    </span>
                    {active && <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5 shrink-0 text-[#6840bd]"><path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                );
              }) : <p className="px-4 py-10 text-center text-sm text-gray-500">{emptyText}</p>}
            </div>
            <div className="border-t border-gray-100 p-3">
              <button type="button" onClick={() => { setOpen(false); setSearch(''); }} className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">Fechar</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
