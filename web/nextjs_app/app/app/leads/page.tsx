'use client';
import Link from 'next/link';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { AppShell } from '../../../components/app-shell';
import { EMPTY_LEAD, formatLeadCurrency, formatLeadDate, matchesLeadSearch, normalizeLead, validateLead, type LeadActivity, type LeadFormValues, type LeadRecord, type LeadStage } from '../../../lib/leadfesta';
import { supabase } from '../../../lib/supabase';
import { useResponsivePageSize } from '../../../lib/use-responsive-page-size';
import { Pagination } from '../../../components/pagination';
import { useModuleData } from '../../../lib/module-data-cache';

type CompanyOption = { id: string; name: string };
type Workspace = { email: string; companyName: string; companyId: string; role: 'admin' | 'platform_owner' };

const panel = 'rounded-2xl border border-purple-100 bg-white p-5 shadow-sm';
const primary = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-[#8054d8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6840bd] disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-purple-200 px-3 py-2 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50 disabled:opacity-50';
const field = 'mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100';

function toLocalDateTimeInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function LeadFestaPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [userId, setUserId] = useState('');
  const [platformOwner, setPlatformOwner] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyId] = useState('');
  const workspaceScope = userId && companyId ? `${userId}:${companyId}` : '';
  const [stages, setStages] = useModuleData<LeadStage[]>('leads', 'stages', workspaceScope, []);
  const [leads, setLeads] = useModuleData<LeadRecord[]>('leads', 'records', workspaceScope, []);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState('');
  const [form, setForm] = useState<LeadFormValues>(EMPTY_LEAD);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof LeadFormValues, string>>>({});
  const [activityDraft, setActivityDraft] = useState('');
  const [activityType, setActivityType] = useState<LeadActivity['activity_type']>('note');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = useResponsivePageSize();

  useEffect(() => {
    let active = true;
    async function loadAccess() {
      try {
        if (!supabase) {
          setAccessMessage('O acesso ainda não está configurado.');
          return;
        }
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          window.location.replace((process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/login/');
          return;
        }
        setUserId(user.id);
        const { data: isOwner, error: ownerError } = await supabase.rpc('is_platform_owner_for_company');
        if (ownerError) throw ownerError;
        if (!active) return;
        if (isOwner === true) {
          setPlatformOwner(true);
          const { data, error } = await supabase.from('companies').select('id,name').order('name');
          if (error) throw error;
          if (!active) return;
          const rows = (data ?? []) as CompanyOption[];
          setCompanies(rows);
          setCompanyId(rows[0]?.id ?? '');
          setWorkspace({ email: user.email ?? '', companyName: 'Administração da plataforma', companyId: '', role: 'platform_owner' });
          return;
        }
        const { data: membership, error: memberError } = await supabase.from('company_members')
          .select('company_id,role,companies(name)').eq('user_id', user.id).limit(1).maybeSingle();
        if (memberError) throw memberError;
        if (!membership?.company_id) {
          setAccessMessage('Sua conta ainda não está vinculada a uma empresa.');
          return;
        }
        if (membership.role !== 'admin') {
          setAccessMessage('O LeadFesta é disponibilizado somente para administradores da empresa.');
          return;
        }
        const { data: available, error: featureError } = await supabase.rpc('leadfesta_is_available', { p_company_id: membership.company_id });
        if (featureError) throw featureError;
        if (available !== true) {
          setAccessMessage('O LeadFesta ainda não está ativado para esta empresa. Entre em contato com o proprietário da plataforma.');
          return;
        }
        const relation = Array.isArray(membership.companies) ? membership.companies[0] : membership.companies;
        if (!active) return;
        setWorkspace({
          email: user.email ?? '',
          companyName: relation?.name ?? 'Sua empresa',
          companyId: membership.company_id,
          role: 'admin',
        });
        setCompanyId(membership.company_id);
      } catch {
        if (active) setAccessMessage('Não foi possível validar seu acesso ao LeadFesta. Tente novamente.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadAccess();
    return () => { active = false; };
  }, []);

  const loadData = useCallback(async () => {
    if (!supabase || !companyId) {
      setStages([]);
      setLeads([]);
      return;
    }
    setPageError('');
    const { data: available, error: accessError } = await supabase.rpc('leadfesta_is_available', { p_company_id: companyId });
    if (accessError || available !== true) {
      setPageError('O acesso ao LeadFesta não está ativo para esta empresa.');
      setStages([]);
      setLeads([]);
      return;
    }
    const [stageResult, leadResult] = await Promise.all([
      supabase.from('lead_pipeline_stages').select('id,company_id,name,color,position,is_won,is_lost')
        .eq('company_id', companyId).order('position'),
      supabase.from('leads').select('id,company_id,stage_id,name,phone,email,contact_company,source,estimated_value,expected_close_date,next_contact_at,notes,converted_customer_id,created_at,updated_at')
        .eq('company_id', companyId).order('updated_at', { ascending: false }).limit(500),
    ]);
    if (stageResult.error || leadResult.error) {
      setPageError('Não foi possível carregar os dados do funil. Confira se a atualização do LeadFesta foi aplicada.');
      setStages([]);
      setLeads([]);
      return;
    }
    const nextStages = (stageResult.data ?? []) as LeadStage[];
    const nextLeads = (leadResult.data ?? []) as LeadRecord[];
    setStages(nextStages);
    setLeads(nextLeads);
    setSelectedLeadId((current) => current && nextLeads.some((lead) => lead.id === current) ? current : nextLeads[0]?.id ?? '');
  }, [companyId]);

  useEffect(() => {
    // Synchronize the selected company with its protected CRM data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (workspace && companyId) void loadData();
  }, [workspace, companyId, loadData]);

  const selectedLead = useMemo(() => leads.find((lead) => lead.id === selectedLeadId) ?? null, [leads, selectedLeadId]);
  const filteredLeads = useMemo(() => leads.filter((lead) => {
    if (!matchesLeadSearch(lead, search)) return false;
    if (stageFilter !== 'all' && lead.stage_id !== stageFilter) return false;
    return true;
  }), [leads, search, stageFilter]);
  const paginatedLeads = filteredLeads.slice(page * pageSize, (page + 1) * pageSize);

  const loadActivities = useCallback(async () => {
    if (!supabase || !companyId || !selectedLeadId) {
      setActivities([]);
      return;
    }
    const { data, error } = await supabase.from('lead_activities')
      .select('id,company_id,lead_id,activity_type,body,created_at')
      .eq('company_id', companyId).eq('lead_id', selectedLeadId)
      .order('created_at', { ascending: false }).limit(100);
    if (!error) setActivities((data ?? []) as LeadActivity[]);
  }, [companyId, selectedLeadId]);

  useEffect(() => {
    // Load the selected lead's activity history from Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadActivities();
  }, [loadActivities]);

  function openLeadForm(lead?: LeadRecord) {
    if (lead) {
      setEditingLeadId(lead.id);
      setForm({
        name: lead.name,
        phone: lead.phone ?? '',
        email: lead.email ?? '',
        contact_company: lead.contact_company ?? '',
        source: lead.source,
        estimated_value: lead.estimated_value === null ? '' : String(lead.estimated_value),
        expected_close_date: lead.expected_close_date ?? '',
        next_contact_at: toLocalDateTimeInput(lead.next_contact_at),
        notes: lead.notes ?? '',
      });
    } else {
      setEditingLeadId('');
      setForm(EMPTY_LEAD);
    }
    setFormErrors({});
    setShowForm(true);
  }

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !companyId || saving) return;
    const errors = validateLead(form);
    setFormErrors(errors);
    if (Object.keys(errors).length) return;
    if (!editingLeadId && !stages[0]) {
      setPageError('O funil ainda não possui etapas configuradas.');
      return;
    }
    setSaving(true);
    setNotice('');
    setPageError('');
    const value = normalizeLead(form);
    const payload = {
      company_id: companyId,
      name: value.name,
      phone: value.phone || null,
      email: value.email || null,
      contact_company: value.contact_company || null,
      source: value.source,
      estimated_value: value.estimated_value ? Number(value.estimated_value) : null,
      expected_close_date: value.expected_close_date || null,
      next_contact_at: value.next_contact_at ? new Date(value.next_contact_at).toISOString() : null,
      notes: value.notes || null,
      updated_at: new Date().toISOString(),
    };
    let savedLeadId = editingLeadId;
    let initialNoteSaved = true;
    if (editingLeadId) {
      const { data, error } = await supabase.from('leads').update(payload)
        .eq('id', editingLeadId).eq('company_id', companyId).select('id').maybeSingle();
      if (error || !data) {
        setPageError('Não foi possível atualizar o lead. Verifique os dados e tente novamente.');
        setSaving(false);
        return;
      }
      savedLeadId = data.id;
    } else {
      const { data, error } = await supabase.from('leads').insert({
        ...payload, stage_id: stages[0].id,
      }).select('id').single();
      if (error || !data) {
        setPageError('Não foi possível salvar o lead. Verifique os dados e tente novamente.');
        setSaving(false);
        return;
      }
      savedLeadId = data.id;
      if (value.notes) {
        const { error: activityError } = await supabase.from('lead_activities').insert({
          company_id: companyId, lead_id: data.id, activity_type: 'note', body: value.notes,
        });
        initialNoteSaved = !activityError;
      }
    }
    setForm(EMPTY_LEAD);
    setEditingLeadId('');
    setFormErrors({});
    setShowForm(false);
    setSelectedLeadId(savedLeadId);
    setNotice(
      editingLeadId
        ? 'Lead atualizado com sucesso.'
        : initialNoteSaved
          ? 'Lead cadastrado com sucesso.'
          : 'Lead cadastrado, mas a anotação não entrou no histórico. O texto continua salvo nos dados do lead.',
    );
    await loadData();
    setSaving(false);
  }

  async function changeStage(lead: LeadRecord, nextStageId: string) {
    if (!supabase || !companyId || lead.stage_id === nextStageId || saving) return;
    setSaving(true);
    setPageError('');
    const { error } = await supabase.rpc('update_lead_stage', {
      p_company_id: companyId,
      p_lead_id: lead.id,
      p_stage_id: nextStageId,
    });
    if (error) {
      setPageError('Não foi possível atualizar a etapa e registrar o histórico. Nenhuma alteração foi aplicada.');
    } else {
      setNotice('Etapa atualizada e registrada no histórico.');
      await loadData();
      await loadActivities();
    }
    setSaving(false);
  }

  async function addActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !companyId || !selectedLead || !activityDraft.trim() || saving) return;
    setSaving(true);
    const { error } = await supabase.from('lead_activities').insert({
      company_id: companyId, lead_id: selectedLead.id, activity_type: activityType, body: activityDraft.trim(),
    });
    if (error) setPageError('Não foi possível registrar a atividade.');
    else {
      setActivityDraft('');
      setActivityType('note');
      await loadActivities();
      setNotice('Histórico atualizado.');
    }
    setSaving(false);
  }

  async function convertLead() {
    if (!supabase || !companyId || !selectedLead || selectedLead.converted_customer_id || saving) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('convert_lead_to_customer', {
      p_company_id: companyId, p_lead_id: selectedLead.id,
    });
    if (error || !data) setPageError('Não foi possível converter este lead em cliente.');
    else {
      setNotice('Lead convertido em cliente. O cadastro já está disponível na área de Clientes.');
      await loadData();
      await loadActivities();
    }
    setSaving(false);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc]"><p role="status" className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm text-gray-600">Verificando acesso ao LeadFesta...</p></main>;

  if (accessMessage || !workspace) {
    return <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5">
      <section className="w-full max-w-lg rounded-2xl border border-purple-100 bg-white p-6 shadow-sm">
        <div className="grid size-12 place-items-center rounded-2xl bg-purple-100 text-2xl">✦</div>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">KidsLoc • módulo comercial</p>
        <h1 className="mt-2 text-2xl font-bold">LeadFesta</h1>
        <p role="alert" className="mt-3 text-sm leading-6 text-gray-600">{accessMessage || 'Não foi possível abrir o módulo.'}</p>
        <Link href="/app/" className="mt-5 inline-flex rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-semibold text-white">Voltar ao KidsLoc</Link>
      </section>
    </main>;
  }

  const content = (
    <div className="kl-workspace-refresh space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">KidsLoc • módulo comercial</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">LeadFesta</h1>
          <p className="mt-2 text-sm text-gray-500">Organize oportunidades, acompanhe negociações e mantenha todo o histórico de contatos.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/app/leads/prospeccao/" className={secondary}>⌕ Prospectar empresas</Link>
          <button type="button" className={primary} onClick={() => { if (showForm) { setShowForm(false); setEditingLeadId(''); } else openLeadForm(); }}>
            {showForm ? 'Fechar cadastro' : '+ Novo lead'}
          </button>
        </div>
      </div>

      {platformOwner && <section className={panel}>
        <label className="block text-sm font-semibold text-gray-700">Empresa em atendimento
          <select className={field} value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
        <p className="mt-2 text-xs text-gray-500">Acesso administrativo global. A ativação comercial de cada empresa continua sendo controlada no painel do proprietário.</p>
      </section>}

      {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {(pageError) && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{pageError}</p>}

      {showForm && <section className={panel}>
        <div className="mb-4"><h2 className="text-lg font-bold">{editingLeadId ? 'Editar oportunidade' : 'Cadastrar oportunidade'}</h2><p className="mt-1 text-sm text-gray-500">Os campos são flexíveis para empresas de diferentes segmentos.</p></div>
        <form onSubmit={createLead} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Nome do contato *
            <input className={field} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={160} required />
            {formErrors.name && <span className="mt-1 block text-xs text-red-600">{formErrors.name}</span>}
          </label>
          <label className="text-sm font-semibold">Telefone
            <input className={field} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={20} placeholder="(31) 99999-9999" />
            {formErrors.phone && <span className="mt-1 block text-xs text-red-600">{formErrors.phone}</span>}
          </label>
          <label className="text-sm font-semibold">E-mail
            <input className={field} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={254} />
            {formErrors.email && <span className="mt-1 block text-xs text-red-600">{formErrors.email}</span>}
          </label>
          <label className="text-sm font-semibold">Empresa / organização
            <input className={field} value={form.contact_company} onChange={(event) => setForm({ ...form, contact_company: event.target.value })} maxLength={160} />
          </label>
          <label className="text-sm font-semibold">Origem do lead
            <select className={field} value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })}>
              <option value="">Selecione uma origem</option><option>WhatsApp</option><option>Instagram</option><option>Facebook</option><option>Google</option><option>Indicação</option><option>Site</option><option>Evento</option><option>Outro</option>
            </select>
          </label>
          <label className="text-sm font-semibold">Valor estimado (R$)
            <input className={field} inputMode="decimal" value={form.estimated_value} onChange={(event) => setForm({ ...form, estimated_value: event.target.value })} placeholder="0,00" />
            {formErrors.estimated_value && <span className="mt-1 block text-xs text-red-600">{formErrors.estimated_value}</span>}
          </label>
          <label className="text-sm font-semibold">Previsão de fechamento
            <input className={field} type="date" value={form.expected_close_date} onChange={(event) => setForm({ ...form, expected_close_date: event.target.value })} />
          </label>
          <label className="text-sm font-semibold">Próximo contato
            <input className={field} type="datetime-local" value={form.next_contact_at} onChange={(event) => setForm({ ...form, next_contact_at: event.target.value })} />
          </label>
          <label className="text-sm font-semibold sm:col-span-2">Observações iniciais
            <textarea className={field + ' min-h-24 py-3'} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} maxLength={4000} />
            {formErrors.notes && <span className="mt-1 block text-xs text-red-600">{formErrors.notes}</span>}
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="submit" className={primary} disabled={saving}>{saving ? 'Salvando...' : editingLeadId ? 'Salvar alterações' : 'Salvar lead'}</button>
            <button type="button" className={secondary} onClick={() => setShowForm(false)} disabled={saving}>Cancelar</button>
          </div>
        </form>
      </section>}

      <div className="grid gap-4 sm:grid-cols-3">
        <section className={panel}><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Oportunidades</p><p className="mt-2 text-3xl font-bold">{leads.length}</p><p className="mt-1 text-xs text-gray-500">Total de leads cadastrados</p></section>
        <section className={panel}><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Em andamento</p><p className="mt-2 text-3xl font-bold">{leads.filter((lead) => !stages.find((stage) => stage.id === lead.stage_id)?.is_won && !stages.find((stage) => stage.id === lead.stage_id)?.is_lost).length}</p><p className="mt-1 text-xs text-gray-500">Negociações abertas</p></section>
        <section className={panel}><p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Valor em aberto</p><p className="mt-2 text-2xl font-bold">{formatLeadCurrency(leads.filter((lead) => { const stage = stages.find((item) => item.id === lead.stage_id); return !stage?.is_won && !stage?.is_lost; }).reduce((total, lead) => total + Number(lead.estimated_value ?? 0), 0))}</p><p className="mt-1 text-xs text-gray-500">Soma dos valores estimados</p></section>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]">
        <section className={panel}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input className={field + ' mt-0'} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Buscar por nome, telefone, e-mail ou origem..." aria-label="Buscar leads" />
            <select className={field + ' mt-0 sm:max-w-52'} value={stageFilter} onChange={(event) => { setStageFilter(event.target.value); setPage(0); }} aria-label="Filtrar por etapa">
              <option value="all">Todas as etapas</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
          </div>
          <div className="mt-4 space-y-2">
            {filteredLeads.length ? paginatedLeads.map((lead) => {
              const stage = stages.find((item) => item.id === lead.stage_id);
              return <button type="button" key={lead.id} onClick={() => setSelectedLeadId(lead.id)}
                className={'w-full rounded-xl border p-4 text-left transition ' + (selectedLeadId === lead.id ? 'border-purple-300 bg-purple-50/70 shadow-sm' : 'border-gray-100 hover:border-purple-200 hover:bg-purple-50/30')}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0"><p className="truncate font-bold text-gray-900">{lead.name}</p><p className="mt-1 truncate text-xs text-gray-500">{lead.contact_company || lead.phone || lead.email || 'Sem dados adicionais'}</p></div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ backgroundColor: (stage?.color ?? '#8054d8') + '18', color: stage?.color ?? '#8054d8' }}>{stage?.name ?? 'Sem etapa'}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500"><span>{lead.source}</span><span className="font-semibold text-gray-700">{formatLeadCurrency(lead.estimated_value)}</span></div>
              </button>;
            }) : <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center"><p className="font-semibold text-gray-700">Nenhum lead encontrado</p><p className="mt-1 text-sm text-gray-500">Cadastre uma oportunidade ou ajuste os filtros.</p></div>}
          </div>
          <Pagination totalCount={filteredLeads.length} page={page} pageSize={pageSize} onPageChange={setPage}/>
        </section>

        <section className={panel}>
          {selectedLead ? <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-wide text-[#8054d8]">Detalhes da oportunidade</p><h2 className="mt-1 text-xl font-bold">{selectedLead.name}</h2><p className="mt-1 text-sm text-gray-500">{selectedLead.contact_company || 'Pessoa física / organização não informada'}</p></div>
              {selectedLead.converted_customer_id ? <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">Convertido em cliente</span> : <button type="button" className={secondary} onClick={() => openLeadForm(selectedLead)} disabled={saving}>Editar lead</button>}{selectedLead.converted_customer_id ? null : <button type="button" className={secondary} onClick={() => void convertLead()} disabled={saving}>Converter em cliente</button>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-sm">
              <div><p className="text-xs text-gray-400">Telefone</p><p className="mt-1 break-words font-medium">{selectedLead.phone || '—'}</p></div>
              <div><p className="text-xs text-gray-400">E-mail</p><p className="mt-1 break-all font-medium">{selectedLead.email || '—'}</p></div>
              <div><p className="text-xs text-gray-400">Origem</p><p className="mt-1 font-medium">{selectedLead.source}</p></div>
              <div><p className="text-xs text-gray-400">Valor estimado</p><p className="mt-1 font-medium">{formatLeadCurrency(selectedLead.estimated_value)}</p></div>
              <div><p className="text-xs text-gray-400">Fechamento previsto</p><p className="mt-1 font-medium">{formatLeadDate(selectedLead.expected_close_date)}</p></div>
              <div><p className="text-xs text-gray-400">Próximo contato</p><p className="mt-1 font-medium">{selectedLead.next_contact_at ? new Date(selectedLead.next_contact_at).toLocaleString('pt-BR') : '—'}</p></div>
            </div>
            <label className="mt-4 block text-sm font-semibold">Etapa do funil
              <select className={field} value={selectedLead.stage_id} onChange={(event) => void changeStage(selectedLead, event.target.value)}>
                {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
              </select>
            </label>
            {selectedLead.notes && <div className="mt-4 rounded-xl border border-purple-100 p-3"><p className="text-xs font-bold uppercase tracking-wide text-gray-400">Observações</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{selectedLead.notes}</p></div>}
            <div className="mt-5 border-t border-gray-100 pt-4">
              <h3 className="font-bold">Histórico de contatos</h3>
              <form onSubmit={addActivity} className="mt-3 space-y-2">
                <select className={field} value={activityType} onChange={(event) => setActivityType(event.target.value as LeadActivity['activity_type'])} aria-label="Tipo de atividade">
                  <option value="note">Observação</option><option value="call">Ligação</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="meeting">Reunião</option>
                </select>
                <textarea className={field + ' min-h-20 py-3'} value={activityDraft} onChange={(event) => setActivityDraft(event.target.value)} placeholder="Registre uma ligação, conversa, retorno ou observação..." maxLength={4000} required />
                <button type="submit" className={secondary} disabled={saving || !activityDraft.trim()}>Adicionar ao histórico</button>
              </form>
              <div className="mt-4 space-y-3">
                {activities.length ? activities.map((activity) => <div key={activity.id} className="border-l-2 border-purple-200 pl-3">
                  <div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-bold capitalize text-[#6840bd]">{activity.activity_type.replace('_', ' ')}</span><time className="text-[11px] text-gray-400">{new Date(activity.created_at).toLocaleString('pt-BR')}</time></div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-gray-700">{activity.body}</p>
                </div>) : <p className="text-sm text-gray-400">Nenhuma atividade registrada ainda.</p>}
              </div>
            </div>
          </> : <div className="py-12 text-center"><p className="font-semibold text-gray-700">Selecione um lead</p><p className="mt-1 text-sm text-gray-500">Os detalhes e o histórico aparecerão aqui.</p></div>}
        </section>
      </div>
    </div>
  );

  if (platformOwner) return <main className="min-h-screen bg-[#f8f7fc] px-4 py-6 text-gray-900 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Link href="/app/admin/" className="text-sm font-semibold text-[#6840bd]">← Painel do proprietário</Link><span className="text-xs text-gray-500">Acesso global da plataforma</span></div>
      {content}
    </div>
  </main>;

  return <AppShell companyName={workspace.companyName} email={workspace.email} role={workspace.role} companyId={workspace.companyId} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''} signingOut={false} onSignOut={() => { void supabase?.auth.signOut().then(() => window.location.assign((process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/login/')); }}>
    {content}
  </AppShell>;
}
