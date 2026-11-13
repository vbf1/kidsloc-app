'use client';

// This workspace is reserved for the KidsLoc platform owner and is read-only for conversations.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { CustomerForm } from '../../../components/customer-form';
import type { CustomerFormValues, CustomerRecord } from '../../../lib/customers';

type Company = { id: string; name: string; created_at: string };
type CompanyOverview = { members: number; customers: number; products: number; rentals: number; financialTransactions: number };
type Conversation = { id: string; company_id: string; conversation_type: string; title: string | null; created_by: string; created_at: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
type CompanyCustomer = Pick<CustomerRecord, 'id' | 'company_id' | 'name' | 'phone' | 'email' | 'city_state' | 'created_at' | 'address' | 'notes' | 'cpf' | 'rg' | 'zip' | 'neighborhood'>;
const panelClass = 'rounded-2xl border border-purple-100 bg-white p-5 shadow-sm';
const buttonClass = 'rounded-xl border border-purple-200 px-3 py-2 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50 disabled:opacity-50';

export default function PlatformAdminPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companyOverview, setCompanyOverview] = useState<CompanyOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [companyCustomers, setCompanyCustomers] = useState<CompanyCustomer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
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
    setSelectedCompanyId((current) => current && rows.some((company) => company.id === current) ? current : rows[0]?.id ?? '');
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

  const loadCompanyOverview = useCallback(async () => {
    if (!supabase || !selectedCompanyId) {
      setCompanyOverview(null);
      setOverviewError('');
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
    if (!supabase || !selectedCompanyId) {
      setCompanyCustomers([]);
      setCustomersError('');
      return;
    }
    setCustomersLoading(true);
    const { data, error: queryError } = await supabase.from('customers')
      .select('id,company_id,name,phone,email,city_state,created_at,address,notes,cpf,rg,zip,neighborhood')
      .eq('company_id', selectedCompanyId).order('created_at', { ascending: false }).limit(500);
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
    if (!supabase || !selectedCompanyId) {
      setConversations([]);
      setSelectedConversationId('');
      return;
    }
    setConversationsLoading(true);
    const { data, error: queryError } = await supabase.from('team_conversations')
      .select('id,company_id,conversation_type,title,created_by,created_at')
      .eq('company_id', selectedCompanyId).order('created_at', { ascending: false });
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
    if (!supabase || !selectedConversationId) {
      setMessages([]);
      return;
    }
    setMessagesLoading(true);
    const { data, error: queryError } = await supabase.from('team_messages')
      .select('id,conversation_id,sender_id,body,created_at')
      .eq('conversation_id', selectedConversationId).order('created_at', { ascending: false }).limit(300);
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
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">Administração global</p><h1 className="mt-2 text-3xl font-bold">Painel do proprietário</h1><p className="mt-2 text-sm text-gray-500">Acompanhamento das empresas e das conversas internas. {email}</p></div>
          <button type="button" onClick={() => void refreshAll()} disabled={refreshing} className={buttonClass}>{refreshing ? 'Atualizando...' : 'Atualizar dados'}</button>
        </section>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <section className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Empresas cadastradas</h2><p className="text-sm text-gray-500">{companies.length} empresa(s) encontradas</p></div>
            <label className="min-w-64 text-sm font-semibold">Selecionar empresa
              <select value={selectedCompanyId} onChange={(event) => { setSelectedCompanyId(event.target.value); setSelectedConversationId(''); setMessages([]); }} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 font-normal">
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </label>
          </div>
          {!companies.length && <p className="mt-4 text-sm text-gray-500">Ainda não há empresas cadastradas.</p>}
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
              <input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Nome, telefone ou e-mail" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 font-normal sm:w-64" />
            </label>
          </div>
          {customersError && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{customersError}</p>}
          {customersLoading ? <p className="mt-4 text-sm text-gray-500">Carregando clientes...</p> : (() => {
            const term = customerSearch.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim();
            const filtered = companyCustomers.filter((customer) => [customer.name, customer.phone ?? '', customer.email ?? '', customer.city_state ?? '']
              .some((value) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').includes(term)));
            return filtered.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm">
              <thead><tr className="border-b border-gray-100 text-xs uppercase text-gray-500"><th className="px-3 py-3">Nome</th><th className="px-3 py-3">Telefone</th><th className="px-3 py-3">E-mail</th><th className="px-3 py-3">Cidade / UF</th><th className="px-3 py-3 text-right">Ações</th></tr></thead>
              <tbody>{filtered.map((customer) => <tr key={customer.id} className="border-b border-gray-50"><td className="px-3 py-3 font-semibold">{customer.name}</td><td className="px-3 py-3">{customer.phone || '—'}</td><td className="px-3 py-3">{customer.email || '—'}</td><td className="px-3 py-3">{customer.city_state || '—'}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => { setEditingCustomer(customer); setCustomerFormError(''); }} className={buttonClass}>Editar</button></td></tr>)}</tbody>
            </table><p className="mt-3 text-xs text-gray-400">Exibindo {filtered.length} de até 500 clientes carregados.</p></div>
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
