'use client';

// This workspace is reserved exclusively for the KidsLoc platform owner.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { CustomerForm } from '../../../components/customer-form';
import { SearchablePicker } from '../../../components/searchable-picker';
import type { CustomerFormValues, CustomerRecord } from '../../../lib/customers';
import { useResponsivePageSize } from '../../../lib/use-responsive-page-size';

type Company = { id: string; name: string; created_at: string };

function formatRoleLabel(role: string) {
  const labels: Record<string, string> = {
    owner: 'Administrador da empresa',
    staff: 'Funcionário',
    admin: 'Administrador da empresa',
  };
  return labels[role.toLowerCase()] ?? role;
}
type PlatformUser = { id: string; name: string; email: string; phone: string; role: string; company: string; registered_at: string; last_sign_in_at: string | null; email_confirmed_at: string | null; memberships: { company: string; role: string }[] };
type CompanyOverview = { members: number; customers: number; products: number; rentals: number; financialTransactions: number };
type CompanyCustomer = Pick<CustomerRecord, 'id' | 'company_id' | 'name' | 'phone' | 'email' | 'city_state' | 'created_at' | 'address' | 'notes' | 'cpf' | 'rg' | 'zip' | 'neighborhood'>;
const panelClass = 'rounded-2xl border border-purple-100 bg-white p-5 shadow-sm';
const buttonClass = 'rounded-xl border border-purple-200 px-3 py-2 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50 disabled:opacity-50';

export default function PlatformAdminPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [platformUsers, setPlatformUsers] = useState<PlatformUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const usersRequest = useRef(0);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyNameDraft, setCompanyNameDraft] = useState('');
  const [companySaving, setCompanySaving] = useState(false);
  const [companyFormError, setCompanyFormError] = useState('');
  const [companyOverview, setCompanyOverview] = useState<CompanyOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [companyCustomers, setCompanyCustomers] = useState<CompanyCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const customerPageSize = useResponsivePageSize();
  const [customerPagination, setCustomerPagination] = useState({ page: 0, pageSize: 6 });
  const customerPage = customerPagination.pageSize === customerPageSize ? customerPagination.page : 0;
  function setCustomerPage(nextPage: number | ((current: number) => number)) {
    const resolvedPage = typeof nextPage === 'function' ? nextPage(customerPage) : nextPage;
    setCustomerPagination({ page: resolvedPage, pageSize: customerPageSize });
  }
  const [editingCustomer, setEditingCustomer] = useState<CompanyCustomer | null>(null);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerFormError, setCustomerFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const overviewRequest = useRef(0);
  const customersRequest = useRef(0);

  const loadCompanies = useCallback(async () => {
    if (!supabase) {
      setError('O acesso ainda não está configurado.');
      return;
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      router.replace('/login/');
      return;
    }
    setEmail(user.email ?? '');
    const { data: isOwner, error: ownerError } = await supabase.rpc('is_platform_owner_for_company');
    if (ownerError || isOwner !== true) {
      router.replace('/app/');
      return;
    }
    const { data, error: companiesError } = await supabase.from('companies')
      .select('id,name,created_at').order('created_at', { ascending: false });
    if (companiesError) {
      setError('Não foi possível carregar as empresas cadastradas.');
      return;
    }
    const rows = (data ?? []) as Company[];
    setCompanies(rows);
    setSelectedCompanyId((current) => current && rows.some((company) => company.id === current) ? current : '');
    setError('');
  }, [router]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      await loadCompanies();
      if (active) setLoading(false);
    }
    void initialize();
    return () => { active = false; };
  }, [loadCompanies]);

  const loadPlatformUsers = useCallback(async () => {
    const requestId = ++usersRequest.current;
    if (!supabase) {
      setPlatformUsers([]);
      setUsersError('O acesso ainda não está configurado.');
      return;
    }
    setUsersLoading(true);
    const { data, error: invokeError } = await supabase.functions.invoke('manage-employees', {
      body: { action: 'list_users' },
    });
    if (requestId !== usersRequest.current) return;
    if (invokeError || data?.error) {
      setPlatformUsers([]);
      setUsersError(data?.error || 'Não foi possível carregar os usuários cadastrados.');
    } else {
      setPlatformUsers((data?.users ?? []) as PlatformUser[]);
      setUsersError('');
    }
    setUsersLoading(false);
  }, []);

  useEffect(() => {
    // The global user directory is restricted by the Edge Function to the platform owner.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPlatformUsers();
  }, [loadPlatformUsers]);

  async function saveCompanyName() {
    if (!supabase || !selectedCompanyId) return;
    const name = companyNameDraft.trim();
    if (name.length < 2 || name.length > 160) {
      setCompanyFormError('O nome da empresa deve ter entre 2 e 160 caracteres.');
      return;
    }
    setCompanySaving(true);
    setCompanyFormError('');
    const { data: updatedCompany, error: updateError } = await supabase.from('companies')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', selectedCompanyId)
      .select('id,name')
      .maybeSingle();
    if (updateError || !updatedCompany) {
      setCompanyFormError('Não foi possível confirmar a atualização do nome. Confira os dados e tente novamente.');
      setCompanySaving(false);
      return;
    }
    setCompanies((current) => current.map((company) => company.id === updatedCompany.id
      ? { ...company, name: updatedCompany.name }
      : company));
    setEditingCompany(false);
    setCompanySaving(false);
  }

  const loadCompanyOverview = useCallback(async () => {
    const requestId = ++overviewRequest.current;
    if (!supabase || !selectedCompanyId) {
      setCompanyOverview(null);
      setOverviewError('');
      setOverviewLoading(false);
      return;
    }
    setOverviewLoading(true);
    const client = supabase;
    const companyFilter = (table: string) => client.from(table).select('id', { count: 'exact', head: true }).eq('company_id', selectedCompanyId);
    const results = await Promise.all([
      companyFilter('company_members'),
      companyFilter('customers'),
      companyFilter('products'),
      companyFilter('rentals'),
      companyFilter('financial_transactions'),
    ]);
    if (requestId !== overviewRequest.current) return;
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      setCompanyOverview(null);
      setOverviewError('Não foi possível carregar o resumo desta empresa.');
    } else {
      setCompanyOverview({
        members: results[0].count ?? 0,
        customers: results[1].count ?? 0,
        products: results[2].count ?? 0,
        rentals: results[3].count ?? 0,
        financialTransactions: results[4].count ?? 0,
      });
      setOverviewError('');
    }
    setOverviewLoading(false);
  }, [selectedCompanyId]);

  useEffect(() => {
    // Load the selected company's read-only summary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCompanyOverview();
  }, [loadCompanyOverview]);

  const loadCompanyCustomers = useCallback(async () => {
    const requestId = ++customersRequest.current;
    if (!supabase || !selectedCompanyId) {
      setCompanyCustomers([]);
      setCustomersError('');
      setCustomersLoading(false);
      return;
    }
    setCustomersLoading(true);
    const { data, error: queryError } = await supabase.from('customers')
      .select('id,company_id,name,phone,email,city_state,created_at,address,notes,cpf,rg,zip,neighborhood')
      .eq('company_id', selectedCompanyId).order('created_at', { ascending: false }).limit(500);
    if (requestId !== customersRequest.current) return;
    if (queryError) {
      setCompanyCustomers([]);
      setCustomersError('Não foi possível carregar os clientes desta empresa.');
    } else {
      setCompanyCustomers((data ?? []) as CompanyCustomer[]);
      setCustomersError('');
    }
    setCustomersLoading(false);
  }, [selectedCompanyId]);

  useEffect(() => {
    // Load only records belonging to the selected company.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCompanyCustomers();
  }, [loadCompanyCustomers]);

  async function saveCompanyCustomer(values: CustomerFormValues) {
    if (!supabase || !selectedCompanyId || !editingCustomer) return;
    setCustomerSaving(true);
    setCustomerFormError('');
    const { data: updatedCustomer, error: updateError } = await supabase.from('customers')
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', editingCustomer.id)
      .eq('company_id', selectedCompanyId)
      .select('id')
      .maybeSingle();
    if (updateError || !updatedCustomer) {
      setCustomerFormError('Não foi possível confirmar a atualização. Confira os dados e tente novamente.');
      setCustomerSaving(false);
      return;
    }
    await loadCompanyCustomers();
    setEditingCustomer(null);
    setCustomerSaving(false);
  }

  async function refreshAll() {
    if (refreshing) return;
    setRefreshing(true);
    await loadCompanies();
    await loadPlatformUsers();
    await loadCompanyOverview();
    await loadCompanyCustomers();
    setRefreshing(false);
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (!signOutError) router.push('/login/');
    else setError('Não foi possível encerrar sua sessão. Tente novamente.');
  }

  const selectedCompany = companies.find((company) => company.id === selectedCompanyId);
  const normalizedUserSearch = userSearch.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim();
  const filteredPlatformUsers = platformUsers.filter((user) => [user.name, user.email, user.phone, user.company, user.role, ...user.memberships.map((membership) => membership.company + ' ' + membership.role)]
    .some((value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').includes(normalizedUserSearch)));
  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc]"><p className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm text-gray-600">Verificando acesso administrativo...</p></main>;

  return (
    <main className="min-h-screen bg-[#f8f7fc] text-gray-900">
      <header className="border-b border-purple-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[#8054d8] text-xl font-black text-white">K</span><div><p className="text-xl font-bold">KidsLoc <span className="text-[#8054d8]">Admin</span></p><p className="text-xs text-gray-500">Proprietário da plataforma</p></div></div>
          <button type="button" onClick={() => void signOut()} className={buttonClass}>Sair</button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">Administração global</p><h1 className="mt-2 text-3xl font-bold">Painel do proprietário</h1><p className="mt-2 text-sm text-gray-500">Acompanhamento das empresas e dos usuários cadastrados. {email}</p></div>
          <button type="button" onClick={() => void refreshAll()} disabled={refreshing || companySaving || customerSaving} className={buttonClass}>{refreshing ? 'Atualizando...' : 'Atualizar dados'}</button>
        </section>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <section className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Empresas cadastradas</h2><p className="text-sm text-gray-500">{companies.length} empresa(s) encontradas</p></div>
            <div className="min-w-64 text-sm font-semibold">Selecionar empresa
              <div className="mt-1"><SearchablePicker title="Selecionar empresa" value={selectedCompanyId} options={[
                { value: '', label: 'Selecione uma empresa' }, ...companies.map((company) => ({ value: company.id, label: company.name })),
              ]} placeholder="Selecione uma empresa" searchPlaceholder="Buscar empresa..." emptyText="Nenhuma empresa encontrada." disabled={companySaving || customerSaving} onChange={(value) => {
                setSelectedCompanyId(value);
                setEditingCompany(false);
                setCompanyNameDraft('');
                setCompanyFormError('');
                setEditingCustomer(null);
                setCustomerFormError('');
                setCustomerSearch('');
                setCustomerPage(0);
              }} /></div>
            </div>
          </div>
          {!companies.length && <p className="mt-4 text-sm text-gray-500">Ainda não há empresas cadastradas.</p>}
          {selectedCompany && !editingCompany && <div className="mt-4">
            <button type="button" onClick={() => { setCompanyNameDraft(selectedCompany.name); setCompanyFormError(''); setEditingCompany(true); }} className={buttonClass}>Editar nome da empresa</button>
          </div>}
          {selectedCompany && editingCompany && <form onSubmit={(event) => { event.preventDefault(); void saveCompanyName(); }} className="mt-4 max-w-xl rounded-xl border border-purple-100 bg-purple-50/40 p-4">
            <label className="block text-sm font-semibold">Nome da empresa
              <input value={companyNameDraft} onChange={(event) => setCompanyNameDraft(event.target.value)} maxLength={160} autoFocus className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 font-normal" />
            </label>
            {companyFormError && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{companyFormError}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="submit" disabled={companySaving} className="rounded-xl bg-[#8054d8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#6840bd] disabled:opacity-50">{companySaving ? 'Salvando...' : 'Salvar alterações'}</button>
              <button type="button" disabled={companySaving} onClick={() => { setEditingCompany(false); setCompanyFormError(''); }} className={buttonClass}>Cancelar</button>
            </div>
          </form>}
        </section>
        <section className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-bold">Usuários cadastrados</h2><p className="text-sm text-gray-500">{platformUsers.length} conta(s) cadastrada(s) em toda a plataforma</p></div>
            <label className="text-sm font-medium">Buscar usuário
              <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Nome, e-mail, telefone ou empresa..." className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 font-normal sm:w-80" />
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-400">Consulta global somente leitura. Nenhum dado de acesso, senha ou token é exibido.</p>
          {usersError && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{usersError}</p>}
          {usersLoading ? <p className="mt-4 text-sm text-gray-500">Carregando usuários cadastrados...</p> : filteredPlatformUsers.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead><tr className="border-b border-gray-100 text-xs uppercase text-gray-500"><th className="px-3 py-3">Usuário</th><th className="px-3 py-3">E-mail</th><th className="px-3 py-3">Telefone</th><th className="px-3 py-3">Empresa / perfil</th><th className="px-3 py-3">Cadastro</th><th className="px-3 py-3">Último acesso</th></tr></thead>
                <tbody>{filteredPlatformUsers.map((user) => <tr key={user.id} className="border-b border-gray-50 align-top">
                  <td className="px-3 py-3 font-semibold">{user.name || 'Nome não informado'}<span className="mt-1 block text-xs font-normal text-gray-400">{user.email_confirmed_at ? 'E-mail confirmado' : 'E-mail não confirmado'}</span></td>
                  <td className="px-3 py-3">{user.email || '—'}</td>
                  <td className="px-3 py-3">{user.phone || '—'}</td>
                  <td className="px-3 py-3"><div className="space-y-1">{user.role === 'owner' && <div className="font-semibold text-[#6840bd]">Proprietário da plataforma</div>}{user.memberships.length ? user.memberships.map((membership, index) => <div key={membership.company + membership.role + index}><span className="font-medium">{membership.company}</span><span className="ml-2 text-xs text-gray-500">{formatRoleLabel(membership.role)}</span></div>) : user.role !== 'owner' ? <span className="text-gray-400">{user.company || 'Sem empresa vinculada'}</span> : null}</div></td>
                  <td className="px-3 py-3 whitespace-nowrap">{user.registered_at ? new Date(user.registered_at).toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : 'Nunca acessou'}</td>
                </tr>)}</tbody>
              </table>
              <p className="mt-3 text-xs text-gray-400">Exibindo {filteredPlatformUsers.length} usuário(s). Os dados são carregados diretamente do cadastro de autenticação e dos vínculos com empresas.</p>
            </div>
          ) : <p className="mt-4 text-sm text-gray-500">{platformUsers.length ? 'Nenhum usuário corresponde à busca.' : 'Nenhum usuário cadastrado foi encontrado.'}</p>}
        </section>
        <section className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-bold">Resumo da empresa</h2><p className="text-sm text-gray-500">{selectedCompany?.name ?? 'Selecione uma empresa'}</p></div>
            <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-[#6840bd]">Consulta somente leitura</span>
          </div>
          {overviewError && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{overviewError}</p>}
          {overviewLoading ? <p className="mt-4 text-sm text-gray-500">Carregando dados da empresa...</p> : companyOverview && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ['Usuários', companyOverview.members],
                ['Clientes', companyOverview.customers],
                ['Itens do catálogo', companyOverview.products],
                ['Locações', companyOverview.rentals],
                ['Lançamentos financeiros', companyOverview.financialTransactions],
              ].map(([label, value]) => <div key={label} className="rounded-xl border border-purple-100 bg-purple-50/50 p-3">
                <p className="text-xs font-medium text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold text-[#6840bd]">{value}</p>
              </div>)}
            </div>
          )}
          <p className="mt-3 text-xs text-gray-400">Este resumo não permite editar, cadastrar ou excluir informações da empresa.</p>
        </section>
        <section className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-bold">Clientes da empresa</h2><p className="text-sm text-gray-500">Consulta dos cadastros de {selectedCompany?.name ?? 'empresa selecionada'}</p></div>
            <label className="text-sm font-medium">Buscar cliente
              <input value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); setCustomerPage(0); }} placeholder="Nome, telefone, CPF, endereço..." className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 font-normal sm:w-64" />
            </label>
          </div>
          {customersError && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{customersError}</p>}
          {customersLoading ? <p className="mt-4 text-sm text-gray-500">Carregando clientes...</p> : (() => {
            const term = customerSearch.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim();
            const numericTerm = customerSearch.replace(/\D/g, '');
            const filtered = companyCustomers.filter((customer) => {
              const textMatch = [
                customer.name, customer.phone, customer.email, customer.city_state,
                customer.cpf, customer.rg, customer.address, customer.neighborhood,
                customer.zip, customer.notes,
              ].some((value) => value !== null && value !== undefined
                && value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').includes(term));
              const numericMatch = numericTerm.length > 0 && [
                customer.phone, customer.cpf, customer.zip,
              ].some((value) => value !== null && value !== undefined
                && value.replace(/\D/g, '').includes(numericTerm));
              return textMatch || numericMatch;
            });
            const pageCount = Math.max(1, Math.ceil(filtered.length / customerPageSize));
            const visibleCustomers = filtered.slice(customerPage * customerPageSize, (customerPage + 1) * customerPageSize);
            return filtered.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm">
              <thead><tr className="border-b border-gray-100 text-xs uppercase text-gray-500"><th className="px-3 py-3">Nome</th><th className="px-3 py-3">Telefone</th><th className="px-3 py-3">E-mail</th><th className="px-3 py-3">Cidade / UF</th><th className="px-3 py-3 text-right">Ações</th></tr></thead>
              <tbody>{visibleCustomers.map((customer) => <tr key={customer.id} className="border-b border-gray-50"><td className="px-3 py-3 font-semibold">{customer.name}</td><td className="px-3 py-3">{customer.phone || '—'}</td><td className="px-3 py-3">{customer.email || '—'}</td><td className="px-3 py-3">{customer.city_state || '—'}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => { setEditingCustomer(customer); setCustomerFormError(''); }} className={buttonClass}>Editar</button></td></tr>)}</tbody>
            </table><div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-gray-400">Exibindo {Math.min(customerPage * customerPageSize + 1, filtered.length)}–{Math.min((customerPage + 1) * customerPageSize, filtered.length)} de {filtered.length} resultado(s), entre até 500 clientes carregados.</p><div className="flex items-center gap-2"><button type="button" disabled={customerPage === 0} onClick={() => setCustomerPage((current) => Math.max(0, current - 1))} className={buttonClass}>Anterior</button><span className="text-xs text-gray-500">Página {Math.min(customerPage + 1, pageCount)} de {pageCount}</span><button type="button" disabled={customerPage + 1 >= pageCount} onClick={() => setCustomerPage((current) => Math.min(pageCount - 1, current + 1))} className={buttonClass}>Próxima</button></div></div></div>
            : <p className="mt-4 text-sm text-gray-500">Nenhum cliente encontrado.</p>;
          })()}
          {editingCustomer && <div className="mt-6 rounded-2xl border border-purple-100 bg-purple-50/40 p-4 sm:p-5">
            <CustomerForm
              key={editingCustomer.id}
              initialValues={{
                name: editingCustomer.name,
                phone: editingCustomer.phone ?? '',
                email: editingCustomer.email ?? '',
                cpf: editingCustomer.cpf ?? '',
                rg: editingCustomer.rg ?? '',
                zip: editingCustomer.zip ?? '',
                address: editingCustomer.address ?? '',
                neighborhood: editingCustomer.neighborhood ?? '',
                city_state: editingCustomer.city_state ?? '',
                notes: editingCustomer.notes ?? '',
              }}
              saving={customerSaving}
              error={customerFormError}
              onCancel={() => { setEditingCustomer(null); setCustomerFormError(''); }}
              onSubmit={saveCompanyCustomer}
            />
          </div>}
        </section>
      </div>
    </main>
  );
}
