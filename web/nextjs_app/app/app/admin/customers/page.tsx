'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CustomerForm } from '../../../../components/customer-form';
import { SearchablePicker } from '../../../../components/searchable-picker';
import { supabase } from '../../../../lib/supabase';
import type { CustomerFormValues, CustomerRecord } from '../../../../lib/customers';
import { useResponsivePageSize } from '../../../../lib/use-responsive-page-size';

type Company = { id: string; name: string; created_at: string };
type CompanyCustomer = Pick<CustomerRecord, 'id' | 'company_id' | 'name' | 'phone' | 'email' | 'city_state' | 'created_at' | 'address' | 'notes' | 'cpf' | 'rg' | 'zip' | 'neighborhood'>;

const panelClass = 'rounded-[22px] border border-[#ebe6f3] bg-white p-4 shadow-[0_8px_28px_rgba(39,24,70,0.045)] sm:p-6';
const buttonClass = 'rounded-xl border border-purple-200 px-3 py-2 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50 disabled:opacity-50';
function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim();
}
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

export default function PlatformCompanyCustomersPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [customers, setCustomers] = useState<CompanyCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<CompanyCustomer | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const pageSize = useResponsivePageSize();
  const [pagination, setPagination] = useState({ page: 0, pageSize: 6 });
  const currentPage = pagination.pageSize === pageSize ? pagination.page : 0;

  const loadCompanies = useCallback(async () => {
    if (!supabase) { setError('O acesso ainda não está configurado.'); setLoading(false); return; }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) { router.replace('/login/'); return; }
    const { data: isOwner, error: ownerError } = await supabase.rpc('is_platform_owner_for_company');
    if (ownerError || isOwner !== true) { router.replace('/app/'); return; }
    const { data, error: companiesError } = await supabase.from('companies')
      .select('id,name,created_at').order('created_at', { ascending: false });
    if (companiesError) { setError('Não foi possível carregar as empresas cadastradas.'); setLoading(false); return; }
    const rows = (data ?? []) as Company[];
    setCompanies(rows);
    const requestedId = new URLSearchParams(window.location.search).get('companyId') || '';
    setSelectedCompanyId((current) => current && rows.some((company) => company.id === current)
      ? current : rows.some((company) => company.id === requestedId) ? requestedId : '');
    setError('');
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadCompanies(); });
    return () => window.cancelAnimationFrame(frame);
  }, [loadCompanies]);

  const loadCustomers = useCallback(async () => {
    if (!supabase || !selectedCompanyId) {
      setCustomers([]);
      setCustomersLoading(false);
      return;
    }
    setCustomersLoading(true);
    const { data, error: queryError } = await supabase.from('customers')
      .select('id,company_id,name,phone,email,city_state,created_at,address,notes,cpf,rg,zip,neighborhood')
      .eq('company_id', selectedCompanyId).order('created_at', { ascending: false }).limit(500);
    if (queryError) {
      setCustomers([]);
      setError('Não foi possível carregar os clientes desta empresa.');
    } else {
      setCustomers((data ?? []) as CompanyCustomer[]);
      setError('');
    }
    setCustomersLoading(false);
  }, [selectedCompanyId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadCustomers(); });
    return () => window.cancelAnimationFrame(frame);
  }, [loadCustomers]);

  const filteredCustomers = useMemo(() => {
    const term = normalize(search);
    const numericTerm = search.replace(/\D/g, '');
    return customers.filter((customer) => {
      const textMatch = [
        customer.name, customer.phone, customer.email, customer.city_state, customer.cpf,
        customer.rg, customer.address, customer.neighborhood, customer.zip, customer.notes,
      ].some((value) => value !== null && value !== undefined && normalize(value).includes(term));
      const numericMatch = numericTerm.length > 0 && [customer.phone, customer.cpf, customer.zip]
        .some((value) => value !== null && value !== undefined && value.replace(/\D/g, '').includes(numericTerm));
      return textMatch || numericMatch;
    });
  }, [customers, search]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const visibleCustomers = filteredCustomers.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  async function saveCustomer(values: CustomerFormValues) {
    if (!supabase || !selectedCompanyId || !editingCustomer) return;
    setSaving(true);
    setFormError('');
    const { data: updatedCustomer, error: updateError } = await supabase.from('customers')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', editingCustomer.id).eq('company_id', selectedCompanyId)
      .select('id').maybeSingle();
    if (updateError || !updatedCustomer) {
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
    await loadCustomers();
    setRefreshing(false);
  }

  const selectedCompany = companies.find((company) => company.id === selectedCompanyId);

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc]"><p className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm text-gray-600">Verificando acesso administrativo...</p></main>;

  return (
    <main className="min-h-screen bg-[#f8f7fc] text-gray-900">
      <header className="border-b border-purple-100 bg-white">
        <div className="kl-admin-header-inner mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <Link href="/app/admin/" className="kl-admin-brand rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8054d8]">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#8054d8] text-lg font-black text-white sm:size-11 sm:rounded-2xl sm:text-xl">K</span>
            <span className="kl-admin-brand-copy"><span className="block whitespace-nowrap text-base font-bold sm:text-xl">KidsLoc <span className="text-[#8054d8]">Admin</span></span><span className="block text-[11px] text-gray-500 sm:text-xs">Proprietário da plataforma</span></span>
          </Link>
          <Link href="/app/admin/" className="kl-admin-back-link rounded-xl border border-purple-200 px-3 py-2 text-sm font-semibold text-[#6840bd] hover:bg-purple-50">Voltar ao painel</Link>
        </div>
      </header>
      <div className="kl-workspace-refresh kl-platform-admin mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <section className="kl-admin-hero">
          <div className="relative z-10 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="kl-admin-eyebrow">CENTRAL DE CONTROLE · KIDSLOC</p>
              <h1 className="mt-2 text-[clamp(1.45rem,6vw,2.15rem)] font-extrabold leading-tight tracking-tight text-white">Clientes da empresa</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">Consulte e atualize os cadastros da empresa selecionada.</p>
            </div>
            <button type="button" onClick={() => void refresh()} disabled={refreshing || customersLoading || !selectedCompanyId} className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#6840bd] shadow-sm hover:bg-purple-50 disabled:opacity-60 sm:w-auto">{refreshing ? 'Atualizando...' : 'Atualizar lista'}</button>
          </div>
          <div className="kl-admin-hero-orb" aria-hidden="true" />
        </section>

        <section className={panelClass}>
          <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] sm:items-end">
            <div className="min-w-0"><h2 className="text-base font-bold text-[#29213b] sm:text-lg">Empresa selecionada</h2><p className="mt-1 break-words text-sm text-gray-500">{selectedCompany?.name ?? 'Escolha uma empresa para visualizar os clientes.'}</p></div>
            <label className="min-w-0 text-xs font-bold text-[#514a61]">Selecionar empresa
              <div className="mt-1"><SearchablePicker title="Selecionar empresa" value={selectedCompanyId} options={[
                { value: '', label: 'Selecione uma empresa' }, ...companies.map((company) => ({ value: company.id, label: company.name })),
              ]} placeholder="Selecione uma empresa" searchPlaceholder="Buscar empresa..." emptyText="Nenhuma empresa encontrada." onChange={(value) => {
                setSelectedCompanyId(value);
                setSearch('');
                setPagination({ page: 0, pageSize });
                setEditingCustomer(null);
                setFormError('');
              }} /></div>
            </label>
          </div>
        </section>

        {selectedCompanyId && <section className={panelClass}>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0"><h2 className="text-base font-bold text-[#29213b] sm:text-lg">Clientes cadastrados</h2><p className="mt-1 text-sm text-gray-500">{filteredCustomers.length} resultado(s) de até 500 registros carregados.</p></div>
            <label className="w-full min-w-0 text-xs font-bold text-[#514a61] sm:max-w-sm">Buscar cliente
              <input value={search} onChange={(event) => { setSearch(event.target.value); setPagination({ page: 0, pageSize }); }} placeholder="Nome, telefone, CPF, endereço..." className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 px-3 text-sm font-normal" />
            </label>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {customersLoading ? <p className="mt-5 text-sm text-gray-500">Carregando clientes...</p> : filteredCustomers.length ? <>
            <div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[680px] text-left text-sm">
              <thead><tr className="border-b border-gray-100 text-xs uppercase text-gray-500"><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Telefone</th><th className="px-3 py-3">E-mail</th><th className="px-3 py-3">Cidade / UF</th><th className="px-3 py-3 text-right">Ação</th></tr></thead>
              <tbody>{visibleCustomers.map((customer) => <tr key={customer.id} className="border-b border-gray-50 align-top hover:bg-purple-50/30">
                <td className="px-3 py-3"><p className="font-semibold text-gray-900">{customer.name}</p><p className="mt-1 text-xs text-gray-400">Cadastro: {formatDate(customer.created_at)}</p></td>
                <td className="px-3 py-3 break-all">{customer.phone || '—'}</td><td className="px-3 py-3 break-all">{customer.email || '—'}</td><td className="px-3 py-3">{customer.city_state || '—'}</td>
                <td className="px-3 py-3 text-right"><button type="button" onClick={() => { setEditingCustomer(customer); setFormError(''); }} className={buttonClass}>Editar</button></td>
              </tr>)}</tbody>
            </table></div>
            <div className="mt-4 grid gap-3 md:hidden">{visibleCustomers.map((customer) => <article key={customer.id} className="min-w-0 rounded-2xl border border-[#ebe6f3] bg-white p-4 shadow-[0_4px_14px_rgba(39,24,70,0.04)]">
              <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-bold text-[#29213b]">{customer.name}</h3><p className="mt-1 break-all text-xs text-[#625b70]">{customer.phone || 'Telefone não informado'}</p><p className="mt-1 break-all text-xs text-[#777187]">{customer.email || 'E-mail não informado'}</p></div><button type="button" onClick={() => { setEditingCustomer(customer); setFormError(''); }} className={buttonClass}>Editar</button></div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#f0edf5] pt-3"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#918a9e]">Cidade / UF</p><p className="mt-1 break-words text-xs text-[#40394f]">{customer.city_state || 'Não informada'}</p></div><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#918a9e]">Cadastro</p><p className="mt-1 text-xs text-[#40394f]">{formatDate(customer.created_at)}</p></div></div>
            </article>)}</div>
            <div className="mt-5 flex flex-col gap-3 border-t border-[#f0edf5] pt-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-gray-500">Exibindo {visibleCustomers.length} de {filteredCustomers.length} cliente(s).</p><div className="flex items-center gap-2"><button type="button" disabled={currentPage===0} onClick={() => setPagination({page:currentPage-1,pageSize})} className={buttonClass}>Anterior</button><span className="whitespace-nowrap text-xs font-semibold text-gray-500">Página {currentPage+1} de {totalPages}</span><button type="button" disabled={currentPage+1>=totalPages} onClick={() => setPagination({page:currentPage+1,pageSize})} className={buttonClass}>Próxima</button></div></div>
          </> : <p className="mt-5 rounded-xl bg-[#faf8fd] px-4 py-8 text-center text-sm text-gray-500">{customers.length ? 'Nenhum cliente corresponde à pesquisa.' : 'Esta empresa ainda não possui clientes cadastrados.'}</p>}
        </section>}

        {editingCustomer && <section className={panelClass}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-bold text-[#29213b]">Editar cadastro</h2><p className="mt-1 text-xs text-gray-500">{editingCustomer.name}</p></div><button type="button" onClick={() => { setEditingCustomer(null); setFormError(''); }} disabled={saving} className={buttonClass}>Fechar</button></div>
          <CustomerForm key={editingCustomer.id} initialValues={{
            name: editingCustomer.name, phone: editingCustomer.phone ?? '', email: editingCustomer.email ?? '',
            cpf: editingCustomer.cpf ?? '', rg: editingCustomer.rg ?? '', zip: editingCustomer.zip ?? '',
            address: editingCustomer.address ?? '', neighborhood: editingCustomer.neighborhood ?? '',
            city_state: editingCustomer.city_state ?? '', notes: editingCustomer.notes ?? '',
          }} saving={saving} error={formError} onCancel={() => { setEditingCustomer(null); setFormError(''); }} onSubmit={saveCustomer} />
        </section>}
        {!selectedCompanyId && <section className={panelClass}><p className="text-sm text-gray-500">Selecione uma empresa para visualizar os clientes cadastrados.</p></section>}
      </div>
    </main>
  );
}
