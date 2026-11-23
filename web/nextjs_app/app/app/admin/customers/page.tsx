'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';
import { CustomerForm } from '../../../../components/customer-form';
import { SearchablePicker } from '../../../../components/searchable-picker';
import { useResponsivePageSize } from '../../../../lib/use-responsive-page-size';
import type { CustomerFormValues, CustomerRecord } from '../../../../lib/customers';

type Company = { id: string; name: string };
type CompanyCustomer = Pick<CustomerRecord, 'id' | 'company_id' | 'name' | 'phone' | 'email' | 'city_state' | 'created_at' | 'address' | 'notes' | 'cpf' | 'rg' | 'zip' | 'neighborhood'>;

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
}

export default function PlatformCustomersPage() {
  const router = useRouter();
  const pageSize = useResponsivePageSize();
  const [email, setEmail] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [customers, setCustomers] = useState<CompanyCustomer[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<CompanyCustomer | null>(null);

  const selectedCompany = companies.find((company) => company.id === companyId) ?? null;

  const loadCompanies = useCallback(async () => {
    if (!supabase) { setError('O acesso ainda não está configurado.'); setLoading(false); return; }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { router.replace('/login/'); return; }
    setEmail(user.email ?? '');
    const { data: isOwner, error: ownerError } = await supabase.rpc('is_platform_owner_for_company');
    if (ownerError || isOwner !== true) { router.replace('/app/'); return; }
    const { data, error: queryError } = await supabase.from('companies')
      .select('id,name').order('created_at', { ascending: false });
    if (queryError) { setError('Não foi possível carregar as empresas cadastradas.'); return; }
    const rows = (data ?? []) as Company[];
    setCompanies(rows);
    const requestedCompany = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('company') : null;
    setCompanyId((current) => rows.some((item) => item.id === current) ? current
      : rows.some((item) => item.id === requestedCompany) ? requestedCompany! : rows[0]?.id ?? '');
    setError('');
    setLoading(false);
  }, [router]);

  const loadCustomers = useCallback(async () => {
    if (!supabase || !companyId) { setCustomers([]); setCustomersLoading(false); return; }
    setCustomersLoading(true);
    const { data, error: queryError } = await supabase.from('customers')
      .select('id,company_id,name,phone,email,city_state,created_at,address,notes,cpf,rg,zip,neighborhood')
      .eq('company_id', companyId).order('created_at', { ascending: false }).limit(500);
    if (queryError) {
      setCustomers([]);
      setError('Não foi possível carregar os clientes desta empresa.');
    } else {
      setCustomers((data ?? []) as CompanyCustomer[]);
      setError('');
    }
    setCustomersLoading(false);
  }, [companyId]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    setPage(0);
    setSearch('');
    setEditingCustomer(null);
    void loadCustomers();
  }, [loadCustomers]);

  const filteredCustomers = useMemo(() => {
    const term = normalize(search.trim());
    const numericTerm = search.replace(/\D/g, '');
    return customers.filter((customer) => {
      const fields = [customer.name, customer.phone, customer.email, customer.city_state,
        customer.cpf, customer.rg, customer.address, customer.neighborhood, customer.zip, customer.notes];
      const textMatch = !term || fields.some((value) => value != null && normalize(value).includes(term));
      const numericMatch = numericTerm.length > 0 && [customer.phone, customer.cpf, customer.zip]
        .some((value) => value != null && value.replace(/\D/g, '').includes(numericTerm));
      return textMatch || numericMatch;
    });
  }, [customers, search]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const visibleCustomers = filteredCustomers.slice(page * pageSize, (page + 1) * pageSize);

  async function saveCustomer(values: CustomerFormValues) {
    if (!supabase || !companyId || !editingCustomer) return;
    setSaving(true);
    setFormError('');
    const { data, error: updateError } = await supabase.from('customers')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', editingCustomer.id).eq('company_id', companyId).select('id').maybeSingle();
    if (updateError || !data) {
      setFormError('Não foi possível confirmar a atualização. Confira os dados e tente novamente.');
      setSaving(false);
      return;
    }
    await loadCustomers();
    setEditingCustomer(null);
    setSaving(false);
  }

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    await loadCompanies();
    await loadCustomers();
    setRefreshing(false);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc]"><p className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm text-gray-600">Verificando acesso administrativo...</p></main>;

  return (
    <main className="min-h-screen bg-[#f8f7fc] text-gray-900">
      <header className="border-b border-purple-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <Link href="/app/admin/" className="flex min-w-0 items-center gap-2.5" aria-label="Voltar ao painel do proprietário">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#8054d8] text-lg font-black text-white">K</span>
            <span className="min-w-0"><span className="block truncate text-base font-bold leading-tight sm:text-xl">KidsLoc <span className="text-[#8054d8]">Admin</span></span><span className="block truncate text-[11px] leading-4 text-gray-500 sm:text-xs">Proprietário da plataforma</span></span>
          </Link>
          <Link href="/app/admin/" className="shrink-0 rounded-xl border border-purple-200 px-3 py-2 text-xs font-semibold text-[#6840bd] hover:bg-purple-50 sm:text-sm">Voltar ao painel</Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <section className="overflow-hidden rounded-[22px] border border-[#6840bd] bg-gradient-to-br from-[#4f2b91] via-[#7043c5] to-[#8b65d7] p-5 text-white shadow-[0_14px_34px_rgba(80,48,145,0.17)] sm:p-7">
          <p className="text-[10px] font-extrabold tracking-[0.16em] text-purple-100">CENTRAL DE CONTROLE · KIDSLOC</p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0"><h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">Clientes da empresa</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">Consulte os cadastros e atualize os dados dos clientes da empresa selecionada.</p><p className="mt-2 break-all text-xs text-white/65">{email}</p></div>
            <button type="button" onClick={() => void refresh()} disabled={refreshing || saving} className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#6840bd] shadow-sm hover:bg-purple-50 disabled:opacity-60">{refreshing ? 'Atualizando...' : 'Atualizar lista'}</button>
          </div>
        </section>

        <section className="rounded-[22px] border border-[#ebe6f3] bg-white p-4 shadow-[0_8px_28px_rgba(39,24,70,0.045)] sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(240px,1.2fr)] sm:items-end">
            <div className="min-w-0"><h2 className="text-base font-bold text-[#29213b] sm:text-lg">Empresa selecionada</h2><p className="mt-1 break-words text-sm text-gray-500">{selectedCompany?.name ?? 'Nenhuma empresa cadastrada'}</p></div>
            <div className="min-w-0 text-xs font-bold text-[#514a61]">Selecionar empresa
              <div className="mt-1"><SearchablePicker title="Selecionar empresa" value={companyId} options={companies.map((company) => ({ value: company.id, label: company.name }))} placeholder="Selecione uma empresa" searchPlaceholder="Buscar empresa..." emptyText="Nenhuma empresa encontrada." disabled={saving} onChange={setCompanyId} /></div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="min-w-0 text-xs font-bold text-[#514a61]">Buscar cliente
              <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Nome, telefone, CPF, e-mail ou endereço..." className="mt-1 min-h-11 w-full min-w-0 rounded-xl border border-gray-200 px-3 text-sm font-normal" />
            </label>
            <p className="text-xs text-gray-500 sm:pb-3">{filteredCustomers.length} cliente(s) encontrado(s)</p>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {customersLoading ? <p className="mt-5 text-sm text-gray-500">Carregando clientes...</p> : visibleCustomers.length ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleCustomers.map((customer) => (
                <article key={customer.id} className="min-w-0 rounded-2xl border border-[#ebe6f3] bg-white p-4 shadow-[0_4px_14px_rgba(39,24,70,0.035)]">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0"><h3 className="break-words text-sm font-bold text-[#29213b]">{customer.name}</h3><p className="mt-1 break-all text-xs leading-5 text-[#625b70]">{customer.email || 'E-mail não informado'}</p></div>
                    <span className="shrink-0 rounded-full bg-purple-50 px-2.5 py-1 text-[10px] font-bold text-[#6840bd]">Cliente</span>
                  </div>
                  <div className="mt-3 grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 border-t border-[#f0edf5] pt-3">
                    <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#918a9e]">Telefone</p><p className="mt-1 break-words text-xs font-medium text-[#40394f]">{customer.phone || '—'}</p></div>
                    <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#918a9e]">Cidade / UF</p><p className="mt-1 break-words text-xs font-medium text-[#40394f]">{customer.city_state || '—'}</p></div>
                    <div className="col-span-2 min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#918a9e]">Endereço</p><p className="mt-1 break-words text-xs font-medium text-[#40394f]">{[customer.address, customer.neighborhood, customer.city_state].filter(Boolean).join(' · ') || '—'}</p></div>
                    <div className="col-span-2 flex min-w-0 items-center justify-between gap-2"><p className="text-[10px] text-gray-400">Cadastro: {customer.created_at ? new Date(customer.created_at).toLocaleDateString('pt-BR') : '—'}</p><button type="button" onClick={() => { setEditingCustomer(customer); setFormError(''); }} className="shrink-0 rounded-lg border border-purple-200 px-3 py-2 text-xs font-semibold text-[#6840bd] hover:bg-purple-50">Editar</button></div>
                  </div>
                </article>
              ))}
            </div>
          ) : <p className="mt-5 rounded-xl bg-[#faf8fd] px-4 py-8 text-center text-sm text-gray-500">{customers.length ? 'Nenhum cliente corresponde à busca.' : 'Nenhum cliente cadastrado para esta empresa.'}</p>}
          {!customersLoading && filteredCustomers.length > 0 && <div className="mt-5 flex flex-col gap-3 border-t border-[#f0edf5] pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-gray-500">Exibindo {visibleCustomers.length} de {filteredCustomers.length} cliente(s), entre até 500 cadastros carregados.</p><div className="flex items-center justify-between gap-2 sm:justify-end"><button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="rounded-xl border border-purple-200 px-3 py-2 text-xs font-bold text-[#6840bd] disabled:opacity-40">Anterior</button><span className="text-xs font-semibold text-gray-500">Página {page + 1} de {totalPages}</span><button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))} className="rounded-xl border border-purple-200 px-3 py-2 text-xs font-bold text-[#6840bd] disabled:opacity-40">Próxima</button></div></div>}
        </section>

        {editingCustomer && <section className="rounded-[22px] border border-purple-100 bg-purple-50/40 p-4 sm:p-6">
          <CustomerForm key={editingCustomer.id} initialValues={{
            name: editingCustomer.name, phone: editingCustomer.phone ?? '', email: editingCustomer.email ?? '',
            cpf: editingCustomer.cpf ?? '', rg: editingCustomer.rg ?? '', zip: editingCustomer.zip ?? '',
            address: editingCustomer.address ?? '', neighborhood: editingCustomer.neighborhood ?? '',
            city_state: editingCustomer.city_state ?? '', notes: editingCustomer.notes ?? '',
          }} saving={saving} error={formError} onCancel={() => { setEditingCustomer(null); setFormError(''); }} onSubmit={saveCustomer} />
        </section>}
      </div>
    </main>
  );
}
