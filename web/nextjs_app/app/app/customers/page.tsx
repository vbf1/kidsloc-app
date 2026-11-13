'use client';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { CustomerForm } from '../../../components/customer-form';
import { CustomerList } from '../../../components/customer-list';
import { buildCustomerSearchFilter, CUSTOMER_PAGE_SIZE, normalizeCustomer, type CustomerFormValues, type CustomerRecord } from '../../../lib/customers';
import { supabase } from '../../../lib/supabase';

const CUSTOMER_COLUMNS = 'id,company_id,name,phone,email,address,notes,created_at,updated_at,cpf,rg,zip,neighborhood,city_state';
type CustomerPayload = {
  company_id: string; name: string; phone: string | null; email: string | null; address: string | null;
  notes: string | null; cpf: string | null; rg: string | null; zip: string | null;
  neighborhood: string | null; city_state: string | null; updated_at: string;
};
function toPayload(companyId: string, values: CustomerFormValues): CustomerPayload {
  const normalized = normalizeCustomer(values);
  return {
    company_id: companyId, name: normalized.name, phone: normalized.phone || null,
    email: normalized.email || null, address: normalized.address || null, notes: normalized.notes || null,
    cpf: normalized.cpf || null, rg: normalized.rg || null, zip: normalized.zip || null,
    neighborhood: normalized.neighborhood || null, city_state: normalized.city_state || null,
    updated_at: new Date().toISOString(),
  };
}
export default function CustomersPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadAccess() {
      await Promise.resolve();
      try {
        if (!supabase) {
          if (active) setAccessError('O acesso ainda não está configurado. Tente novamente mais tarde.');
          return;
        }
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (!active) return;
        if (authError || !user) { router.replace('/login/'); return; }
        setEmail(user.email ?? 'E-mail não informado');
        const { data: membership, error: membershipError } = await supabase
          .from('company_members').select('company_id, companies(name)').eq('user_id', user.id).limit(1).maybeSingle();
        if (!active) return;
        if (membershipError) { setAccessError('Não foi possível confirmar o vínculo com a empresa. Tente novamente.'); return; }
        if (!membership?.company_id) { router.replace('/app/company/'); return; }
        const relatedCompany = Array.isArray(membership.companies) ? membership.companies[0] : membership.companies;
        const name = relatedCompany && typeof relatedCompany === 'object' && 'name' in relatedCompany ? relatedCompany.name : null;
        if (typeof name !== 'string' || !name.trim()) { setAccessError('Não foi possível identificar a empresa vinculada à sua conta.'); return; }
        setCompanyName(name.trim());
        setCompanyId(membership.company_id);
      } catch {
        if (active) setAccessError('Ocorreu um erro ao verificar seu acesso. Confira sua conexão.');
      } finally {
        if (active) setAccessLoading(false);
      }
    }
    void loadAccess();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    const supabaseClient = supabase;
    if (!companyId || !supabaseClient) return;
    let active = true;
    async function loadCustomers() {
      await Promise.resolve();
      if (!active) return;
      setListLoading(true);
      setListError('');
      try {
        const filter = buildCustomerSearchFilter(searchTerm);
        let request = supabaseClient.from('customers').select(CUSTOMER_COLUMNS, { count: 'exact' })
          .eq('company_id', companyId).order('name', { ascending: true })
          .range(page * CUSTOMER_PAGE_SIZE, (page + 1) * CUSTOMER_PAGE_SIZE - 1);
        if (filter) request = request.or(filter);
        const { data, error, count } = await request;
        if (!active) return;
        if (error) { setListError('Não foi possível carregar os clientes. Tente novamente.'); return; }
        setCustomers((data ?? []) as CustomerRecord[]);
        setTotalCount(count ?? 0);
      } catch {
        if (active) setListError('Ocorreu um erro ao carregar os clientes. Confira sua conexão.');
      } finally {
        if (active) setListLoading(false);
      }
    }
    void loadCustomers();
    return () => { active = false; };
  }, [companyId, page, searchTerm, refreshIndex]);

  function openNewCustomer() { setEditingCustomer(null); setFormError(''); setFormOpen(true); setNotice(''); }
  function openEditCustomer(customer: CustomerRecord) { setEditingCustomer(customer); setFormError(''); setFormOpen(true); setNotice(''); }
  function closeForm() { if (saving) return; setFormOpen(false); setEditingCustomer(null); setFormError(''); }

  async function saveCustomer(values: CustomerFormValues) {
    if (!supabase || !companyId || saving) return;
    setSaving(true); setFormError(''); setNotice('');
    try {
      const payload = toPayload(companyId, values);
      if (editingCustomer) {
        const { error } = await supabase.from('customers').update(payload)
          .eq('id', editingCustomer.id).eq('company_id', companyId).select('id').single();
        if (error) { setFormError('Não foi possível atualizar o cliente. Confira os dados e tente novamente.'); return; }
        setNotice('Cliente atualizado com sucesso.');
      } else {
        const { error } = await supabase.from('customers').insert(payload).select('id').single();
        if (error) { setFormError('Não foi possível cadastrar o cliente. Confira os dados e tente novamente.'); return; }
        setNotice('Cliente cadastrado com sucesso.');
      }
      setFormOpen(false); setEditingCustomer(null); setPage(0); setListLoading(true);
      setRefreshIndex((current) => current + 1);
    } catch {
      setFormError('Ocorreu um erro ao salvar o cliente. Confira sua conexão e tente novamente.');
    } finally { setSaving(false); }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPage(0); setSearchTerm(searchDraft.trim()); setListLoading(true); setNotice('');
    setRefreshIndex((current) => current + 1);
  }
  function clearSearch() {
    setSearchDraft(''); setSearchTerm(''); setPage(0); setListLoading(true);
    setRefreshIndex((current) => current + 1);
  }
  function changePage(nextPage: number) { setPage(nextPage); setListLoading(true); }
  async function signOut() {
    if (!supabase || signingOut) return;
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) { setListError('Não foi possível encerrar sua sessão. Tente novamente.'); return; }
      router.push('/login/');
    } catch {
      setListError('Não foi possível encerrar sua sessão. Tente novamente.');
    } finally { setSigningOut(false); }
  }

  if (accessLoading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5"><p role="status" className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">Verificando seu acesso...</p></main>;
  if (accessError) return (
    <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5">
      <section className="w-full max-w-md rounded-2xl border border-purple-100 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Não foi possível abrir Clientes</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-gray-600">{accessError}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-semibold text-white">Tentar novamente</button>
      </section>
    </main>
  );
  if (!companyId) return null;

  return (
    <AppShell companyName={companyName} email={email} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''} signingOut={signingOut} onSignOut={signOut}>
      <section aria-labelledby="customers-title">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">Gestão da empresa</p>
            <h1 id="customers-title" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Clientes</h1>
            <p className="mt-2 text-sm text-gray-500">Cadastre e mantenha os dados dos seus clientes organizados.</p>
          </div>
          {!formOpen && <button type="button" onClick={openNewCustomer} className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6e43c4]">+ Novo cliente</button>}
        </div>
        {notice && !formOpen && <p role="status" className="mb-4 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}
        {formOpen && (
          <div className="mb-6 rounded-2xl border border-purple-100 bg-white p-5 shadow-sm sm:p-7">
            <CustomerForm key={editingCustomer?.id ?? 'new-customer'} initialValues={editingCustomer ? {
              name: editingCustomer.name, phone: editingCustomer.phone ?? '', email: editingCustomer.email ?? '',
              cpf: editingCustomer.cpf ?? '', rg: editingCustomer.rg ?? '', zip: editingCustomer.zip ?? '',
              address: editingCustomer.address ?? '', neighborhood: editingCustomer.neighborhood ?? '',
              city_state: editingCustomer.city_state ?? '', notes: editingCustomer.notes ?? '',
            } : undefined} saving={saving} error={formError} onCancel={closeForm} onSubmit={saveCustomer} />
          </div>
        )}
        <form onSubmit={submitSearch} className="mb-4 flex flex-col gap-2 rounded-2xl border border-purple-100 bg-white p-3 sm:flex-row">
          <label htmlFor="customer-search" className="sr-only">Pesquisar clientes por nome, telefone, e-mail ou CPF</label>
          <input id="customer-search" type="search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Buscar por nome, telefone, e-mail ou CPF"
            className="min-w-0 flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#8054d8] focus:ring-2 focus:ring-purple-100" />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-700 sm:flex-none">Pesquisar</button>
            {searchTerm && <button type="button" onClick={clearSearch} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700">Limpar</button>}
          </div>
        </form>
        {listError && <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert">{listError}</p><button type="button" onClick={() => setRefreshIndex((current) => current + 1)} className="font-semibold underline">Tentar novamente</button>
        </div>}
        <CustomerList customers={customers} loading={listLoading} totalCount={totalCount} page={page}
          pageSize={CUSTOMER_PAGE_SIZE} onPageChange={changePage} onEdit={openEditCustomer} />
      </section>
    </AppShell>
  );
}
