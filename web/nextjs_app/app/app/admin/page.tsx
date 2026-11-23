'use client';
import Link from 'next/link';

// This workspace is reserved for the KidsLoc platform owner and is read-only for conversations.

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
    platform_owner: 'Proprietário da plataforma',
    admin: 'Administrador',
    staff: 'Funcionário',
  };
  return labels[role.toLowerCase()] ?? role;
}
type PlatformUser = { id: string; name: string; email: string; phone: string; role: string; company: string; registered_at: string; last_sign_in_at: string | null; email_confirmed_at: string | null; memberships: { company: string; role: string }[] };
type CompanyOverview = { members: number; customers: number; products: number; rentals: number; financialTransactions: number };
type Conversation = { id: string; company_id: string; conversation_type: string; title: string | null; created_by: string; created_at: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
type CompanyCustomer = Pick<CustomerRecord, 'id' | 'company_id' | 'name' | 'phone' | 'email' | 'city_state' | 'created_at' | 'address' | 'notes' | 'cpf' | 'rg' | 'zip' | 'neighborhood'>;
const panelClass = 'rounded-[22px] border border-[#ebe6f3] bg-white p-5 shadow-[0_8px_28px_rgba(39,24,70,0.045)] sm:p-6';
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const overviewRequest = useRef(0);
  const customersRequest = useRef(0);
  const conversationsRequest = useRef(0);
  const messagesRequest = useRef(0);

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

  const loadConversations = useCallback(async () => {
    const requestId = ++conversationsRequest.current;
    if (!supabase || !selectedCompanyId) {
      setConversations([]);
      setSelectedConversationId('');
      setConversationsLoading(false);
      return;
    }
    setConversationsLoading(true);
    const { data, error: queryError } = await supabase.from('team_conversations')
      .select('id,company_id,conversation_type,title,created_by,created_at')
      .eq('company_id', selectedCompanyId).order('created_at', { ascending: false });
    if (requestId !== conversationsRequest.current) return;
    if (queryError) {
      setError('Não foi possível carregar as conversas desta empresa.');
      setConversations([]);
      setSelectedConversationId('');
    } else {
      const rows = (data ?? []) as Conversation[];
      setConversations(rows);
      setSelectedConversationId((current) => current && rows.some((item) => item.id === current) ? current : rows[0]?.id ?? '');
      setError('');
    }
    setConversationsLoading(false);
  }, [selectedCompanyId]);

  useEffect(() => {
    // The async loader synchronizes the selected company with Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConversations();
  }, [loadConversations]);

  const loadMessages = useCallback(async () => {
    const requestId = ++messagesRequest.current;
    if (!supabase || !selectedConversationId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    setMessagesLoading(true);
    const { data, error: queryError } = await supabase.from('team_messages')
      .select('id,conversation_id,sender_id,body,created_at')
      .eq('conversation_id', selectedConversationId).order('created_at', { ascending: false }).limit(300);
    if (requestId !== messagesRequest.current) return;
    if (queryError) {
      setError('Não foi possível carregar as mensagens desta conversa.');
      setMessages([]);
    } else {
      setMessages(((data ?? []) as Message[]).reverse());
      setError('');
    }
    setMessagesLoading(false);
  }, [selectedConversationId]);

  useEffect(() => {
    // The async loader synchronizes the selected conversation with Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMessages();
  }, [loadMessages]);

  async function refreshAll() {
    if (refreshing) return;
    setRefreshing(true);
    await loadCompanies();
    await loadPlatformUsers();
    await loadCompanyOverview();
    await loadCompanyCustomers();
    await loadConversations();
    await loadMessages();
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
  const selectedConversation = conversations.find((conversation) => conversation.id === selectedConversationId);
  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc]"><p className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm text-gray-600">Verificando acesso administrativo...</p></main>;

  return (
    <main className="min-h-screen bg-[#f8f7fc] text-gray-900">
      <header className="border-b border-purple-100 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[#8054d8] text-xl font-black text-white">K</span><div><p className="text-xl font-bold">KidsLoc <span className="text-[#8054d8]">Admin</span></p><p className="text-xs text-gray-500">Proprietário da plataforma</p></div></div>
          <button type="button" onClick={() => void signOut()} className={buttonClass}>Sair</button>
        </div>
      </header>
      <div className="kl-workspace-refresh kl-platform-admin mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <section className="kl-admin-hero">
          <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="kl-admin-eyebrow">CENTRAL DE CONTROLE · KIDSLOC</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-[2.15rem]">Painel do proprietário</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Visão geral da plataforma, empresas cadastradas e atividade das equipes.</p>
              <p className="mt-3 text-xs font-medium text-white/65">{email}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white">Acesso do proprietário</span>
              <button type="button" onClick={() => void refreshAll()} disabled={refreshing || companySaving || customerSaving} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#6840bd] shadow-sm transition hover:bg-purple-50 disabled:opacity-60">{refreshing ? 'Atualizando...' : 'Atualizar dados'}</button>
            </div>
          </div>
          <div className="kl-admin-hero-orb" aria-hidden="true" />
        </section>
        <section className="kl-admin-stat-grid" aria-label="Indicadores da plataforma">
          <article className="kl-admin-stat"><span className="kl-admin-stat-icon">▦</span><p>Empresas cadastradas</p><strong>{companies.length}</strong><small>Contas de empresas na plataforma</small></article>
          <article className="kl-admin-stat"><span className="kl-admin-stat-icon">♙</span><p>Usuários cadastrados</p><strong>{platformUsers.length}</strong><small>{usersLoading ? 'Atualizando usuários…' : 'Contas identificadas'}</small></article>
          <article className="kl-admin-stat"><span className="kl-admin-stat-icon">☷</span><p>Conversas da empresa</p><strong>{selectedCompanyId ? conversations.length : '—'}</strong><small>{selectedCompany?.name ?? 'Selecione uma empresa abaixo'}</small></article>
        </section>
        <Link href="/app/admin/leadfesta/" className="kl-admin-module-link">
          <span className="kl-admin-module-mark">LF</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#30264a]">LeadFesta</span><span className="mt-1 block text-xs leading-5 text-[#777187]">Gerencie o acesso ao módulo adicional por empresa.</span></span>
          <span className="kl-admin-module-action">Gerenciar módulo <span aria-hidden="true">→</span></span>
        </Link>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <section className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Empresas cadastradas</h2><p className="text-sm text-gray-500">{companies.length} empresa(s) encontradas</p></div>
            <div className="w-full min-w-0 text-sm font-semibold sm:w-auto sm:min-w-64">Selecionar empresa
              <div className="mt-1"><SearchablePicker title="Selecionar empresa" value={selectedCompanyId} options={[
                { value: '', label: 'Selecione uma empresa' }, ...companies.map((company) => ({ value: company.id, label: company.name })),
              ]} placeholder="Selecione uma empresa" searchPlaceholder="Buscar empresa..." emptyText="Nenhuma empresa encontrada." disabled={companySaving || customerSaving} onChange={(value) => {
                setSelectedCompanyId(value);
                setSelectedConversationId('');
                setMessages([]);
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
            <>
              <div className="mt-4 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead><tr className="border-b border-gray-100 text-xs uppercase text-gray-500"><th className="px-3 py-3">Usuário</th><th className="px-3 py-3">E-mail</th><th className="px-3 py-3">Telefone</th><th className="px-3 py-3">Empresa / perfil</th><th className="px-3 py-3">Cadastro</th><th className="px-3 py-3">Último acesso</th></tr></thead>
                  <tbody>{filteredPlatformUsers.map((user) => <tr key={user.id} className="border-b border-gray-50 align-top">
                    <td className="px-3 py-3 font-semibold">{user.name || 'Nome não informado'}<span className="mt-1 block text-xs font-normal text-gray-400">{user.email_confirmed_at ? 'E-mail confirmado' : 'E-mail não confirmado'}</span></td>
                    <td className="px-3 py-3">{user.email || '—'}</td>
                    <td className="px-3 py-3">{user.phone || '—'}</td>
                    <td className="px-3 py-3"><div className="space-y-1">{user.role === 'platform_owner' && <div className="font-semibold text-[#6840bd]">Proprietário da plataforma</div>}{user.memberships.length ? user.memberships.map((membership, index) => <div key={membership.company + membership.role + index}><span className="font-medium">{membership.company}</span><span className="ml-2 text-xs text-gray-500">{formatRoleLabel(membership.role)}</span></div>) : user.role !== 'platform_owner' ? <span className="text-gray-400">{user.company || 'Sem empresa vinculada'}</span> : null}</div></td>
                    <td className="px-3 py-3 whitespace-nowrap">{user.registered_at ? new Date(user.registered_at).toLocaleDateString('pt-BR') : '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : 'Nunca acessou'}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div className="mt-4 grid gap-3 md:hidden">
                {filteredPlatformUsers.map((user) => (
                  <article key={user.id} className="min-w-0 rounded-2xl border border-[#ebe6f3] bg-white p-4 shadow-[0_4px_14px_rgba(39,24,70,0.04)]">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-bold text-[#29213b]">{user.name || 'Nome não informado'}</h3>
                        <p className="mt-1 break-all text-xs leading-5 text-[#625b70]">{user.email || 'E-mail não informado'}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${user.email_confirmed_at ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{user.email_confirmed_at ? 'Confirmado' : 'Pendente'}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[#f0edf5] pt-3">
                      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#918a9e]">Telefone</p><p className="mt-1 break-words text-xs font-medium text-[#40394f]">{user.phone || '—'}</p></div>
                      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#918a9e]">Cadastro</p><p className="mt-1 text-xs font-medium text-[#40394f]">{user.registered_at ? new Date(user.registered_at).toLocaleDateString('pt-BR') : '—'}</p></div>
                      <div className="col-span-2 min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#918a9e]">Empresa / perfil</p>
                        <div className="mt-1 space-y-1 text-xs text-[#40394f]">
                          {user.role === 'platform_owner' && <p className="font-semibold text-[#6840bd]">Proprietário da plataforma</p>}
                          {user.memberships.length ? user.memberships.map((membership, index) => <p key={membership.company + membership.role + index} className="break-words"><span className="font-semibold">{membership.company}</span><span className="ml-1 text-[#777187]">· {formatRoleLabel(membership.role)}</span></p>) : user.role !== 'platform_owner' ? <p>{user.company || 'Sem empresa vinculada'}</p> : null}
                        </div>
                      </div>
                      <div className="col-span-2 min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#918a9e]">Último acesso</p><p className="mt-1 text-xs font-medium text-[#40394f]">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : 'Nunca acessou'}</p></div>
                    </div>
                  </article>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-400">Exibindo {filteredPlatformUsers.length} usuário(s). Os dados são carregados diretamente do cadastro de autenticação e dos vínculos com empresas.</p>
            </>
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
        <section className="grid gap-6 lg:grid-cols-[minmax(260px,.8fr)_minmax(0,1.5fr)]">
          <div className={panelClass}>
            <h2 className="text-lg font-bold">Conversas</h2><p className="mb-4 text-sm text-gray-500">{selectedCompany?.name ?? 'Selecione uma empresa'}</p>
            {conversationsLoading ? <p className="text-sm text-gray-500">Carregando conversas...</p> : conversations.length ? <ul className="space-y-2">{conversations.map((conversation) => <li key={conversation.id}>
              <button type="button" onClick={() => setSelectedConversationId(conversation.id)} className={'w-full rounded-xl border p-3 text-left transition ' + (selectedConversationId === conversation.id ? 'border-purple-300 bg-purple-50' : 'border-gray-100 hover:bg-gray-50')}>
                <span className="block font-semibold">{conversation.title?.trim() || (conversation.conversation_type === 'direct' ? 'Conversa direta' : 'Conversa da equipe')}</span>
                <span className="mt-1 block text-xs text-gray-500">{new Date(conversation.created_at).toLocaleString('pt-BR')}</span>
              </button>
            </li>)}</ul> : <p className="text-sm text-gray-500">Nenhuma conversa cadastrada para esta empresa.</p>}
          </div>
          <div className={panelClass}>
            <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold">Mensagens</h2><p className="text-sm text-gray-500">{selectedConversation?.title || 'Visualização somente leitura'}</p></div><span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-[#6840bd]">Somente leitura</span></div>
            <div className="mt-4 max-h-[65vh] space-y-3 overflow-y-auto rounded-xl bg-gray-50 p-3">
              {messagesLoading ? <p className="p-3 text-sm text-gray-500">Carregando mensagens...</p> : messages.length ? messages.map((message) => <article key={message.id} className="rounded-xl border border-gray-100 bg-white p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold text-gray-500">Remetente · {message.sender_id.slice(0, 8)}</span><time className="text-xs text-gray-400">{new Date(message.created_at).toLocaleString('pt-BR')}</time></div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">{message.body}</p>
              </article>) : <p className="p-3 text-sm text-gray-500">{selectedConversationId ? 'Esta conversa ainda não possui mensagens.' : 'Selecione uma conversa para visualizar as mensagens.'}</p>}
            </div>
            <p className="mt-3 text-xs text-gray-400">O painel não oferece ações para enviar, editar ou excluir mensagens. São exibidas as 300 mensagens mais recentes da conversa selecionada.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
