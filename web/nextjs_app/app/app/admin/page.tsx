'use client';
import Link from 'next/link';

// This workspace is reserved for the KidsLoc platform owner and is read-only for conversations.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { SearchablePicker } from '../../../components/searchable-picker';

type Company = { id: string; name: string; created_at: string };

type CompanyOverview = { members: number; customers: number; products: number; rentals: number; financialTransactions: number };
type Conversation = { id: string; company_id: string; conversation_type: string; title: string | null; created_by: string; created_at: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
const panelClass = 'rounded-[22px] border border-[#ebe6f3] bg-white p-5 shadow-[0_8px_28px_rgba(39,24,70,0.045)] sm:p-6';
const buttonClass = 'rounded-xl border border-purple-200 px-3 py-2 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50 disabled:opacity-50';

export default function PlatformAdminPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyNameDraft, setCompanyNameDraft] = useState('');
  const [companySaving, setCompanySaving] = useState(false);
  const [companyFormError, setCompanyFormError] = useState('');
  const [companyOverview, setCompanyOverview] = useState<CompanyOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const overviewRequest = useRef(0);
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
    await loadCompanyOverview();
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
  return (
    <main className="min-h-screen bg-[#f8f7fc] text-gray-900">
      <header className="border-b border-purple-100 bg-white">
        <div className="kl-admin-header-inner mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div className="kl-admin-brand"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#8054d8] text-lg font-black text-white sm:size-11 sm:rounded-2xl sm:text-xl">K</span><div className="kl-admin-brand-copy"><p className="whitespace-nowrap text-base font-bold sm:text-xl">KidsLoc <span className="text-[#8054d8]">Admin</span></p><p className="text-[11px] text-gray-500 sm:text-xs">Proprietário da plataforma</p></div></div>
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
              <button type="button" onClick={() => void refreshAll()} disabled={refreshing || companySaving} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#6840bd] shadow-sm transition hover:bg-purple-50 disabled:opacity-60">{refreshing ? 'Atualizando...' : 'Atualizar dados'}</button>
            </div>
          </div>
          <div className="kl-admin-hero-orb" aria-hidden="true" />
        </section>
        <section className="kl-admin-stat-grid" aria-label="Indicadores da plataforma">
          <article className="kl-admin-stat"><span className="kl-admin-stat-icon">▦</span><p>Empresas cadastradas</p><strong>{companies.length}</strong><small>Contas de empresas na plataforma</small></article>
          <article className="kl-admin-stat"><span className="kl-admin-stat-icon">☷</span><p>Conversas da empresa</p><strong>{selectedCompanyId ? conversations.length : '—'}</strong><small>{selectedCompany?.name ?? 'Selecione uma empresa abaixo'}</small></article>
        </section>
        <Link href="/app/admin/users/" className="kl-admin-module-link">
          <span className="kl-admin-module-mark">US</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#30264a]">Usuários da plataforma</span><span className="mt-1 block text-xs leading-5 text-[#777187]">Consulte contas, empresas vinculadas, perfis e acessos.</span></span>
          <span className="kl-admin-module-action">Abrir usuários <span aria-hidden="true">→</span></span>
        </Link>
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
              ]} placeholder="Selecione uma empresa" searchPlaceholder="Buscar empresa..." emptyText="Nenhuma empresa encontrada." disabled={companySaving} onChange={(value) => {
                setSelectedCompanyId(value);
                setSelectedConversationId('');
                setMessages([]);
                setEditingCompany(false);
                setCompanyNameDraft('');
                setCompanyFormError('');
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
            <div><h2 className="text-lg font-bold">Resumo da empresa</h2><p className="text-sm text-gray-500">{selectedCompany?.name ?? 'Selecione uma empresa'}</p></div>
            <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-[#6840bd]">Consulta somente leitura</span>
          </div>
          {overviewError && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{overviewError}</p>}
          {overviewLoading ? <p className="mt-4 text-sm text-gray-500">Carregando dados da empresa...</p> : companyOverview && (
            <div className="kl-admin-company-summary-grid mt-4 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ['Usuários', companyOverview.members],
                ['Clientes', companyOverview.customers],
                ['Itens do catálogo', companyOverview.products],
                ['Locações', companyOverview.rentals],
                ['Lançamentos financeiros', companyOverview.financialTransactions],
              ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-purple-100 bg-purple-50/50 p-3">
                <p className="break-words text-[11px] font-medium leading-4 text-gray-500 sm:text-xs">{label}</p><p className="mt-1 text-xl font-bold text-[#6840bd] sm:text-2xl">{value}</p>
              </div>)}
            </div>
          )}
          <p className="mt-3 text-xs text-gray-400">Este resumo não permite editar, cadastrar ou excluir informações da empresa.</p>
        </section>
        {selectedCompany && <Link href={`/app/admin/customers/?companyId=${selectedCompany.id}`} className="kl-admin-module-link">
          <span className="kl-admin-module-mark">CL</span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[#30264a]">Clientes da empresa</span><span className="mt-1 block text-xs leading-5 text-[#777187]">Consulte e edite os cadastros de {selectedCompany.name} em uma página própria.</span></span>
          <span className="kl-admin-module-action">Abrir clientes <span aria-hidden="true">→</span></span>
        </Link>}
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
