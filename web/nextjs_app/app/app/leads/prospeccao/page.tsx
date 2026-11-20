'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { AppShell } from '../../../../components/app-shell';
import { supabase } from '../../../../lib/supabase';

type CompanyOption = { id: string; name: string };
type Workspace = { email: string; companyName: string; companyId: string; role: 'admin' | 'owner' };
type Stage = { id: string; name: string; position: number };
type LeadDraft = { name: string; phone: string; email: string; website: string; address: string; notes: string };

const panel = 'rounded-2xl border border-purple-100 bg-white p-5 shadow-sm';
const field = 'mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100';
const primary = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-[#8054d8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6840bd] disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-purple-200 px-4 py-2.5 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50';

const emptyDraft: LeadDraft = { name: '', phone: '', email: '', website: '', address: '', notes: '' };

export default function LeadProspectingPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState('');
  const [city, setCity] = useState('Contagem, MG');
  const [draft, setDraft] = useState<LeadDraft>(emptyDraft);
  const [stages, setStages] = useState<Stage[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [searchOpened, setSearchOpened] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!supabase) throw new Error('Supabase não configurado.');
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) {
          window.location.replace((process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/login/');
          return;
        }
        const { data: isOwner, error: ownerError } = await supabase.rpc('is_platform_owner_for_company');
        if (ownerError) throw ownerError;
        let companyId = '';
        let companyName = '';
        let role: 'admin' | 'owner' = 'admin';
        if (isOwner === true) {
          const { data: companies, error: companiesError } = await supabase.from('companies').select('id,name').order('name');
          if (companiesError) throw companiesError;
          setCompanies((companies ?? []) as CompanyOption[]);
          companyId = companies?.[0]?.id ?? '';
          companyName = companies?.[0]?.name ?? '';
          role = 'owner';
        } else {
          const { data: membership, error: memberError } = await supabase.from('company_members')
            .select('company_id,role,companies(name)').eq('user_id', user.id).limit(1).maybeSingle();
          if (memberError) throw memberError;
          if (!membership?.company_id || (membership.role !== 'admin' && membership.role !== 'owner')) {
            throw new Error('A prospecção está disponível somente para administradores da empresa.');
          }
          const { data: available, error: featureError } = await supabase.rpc('leadfesta_is_available', { p_company_id: membership.company_id });
          if (featureError || available !== true) throw new Error('O LeadFesta ainda não está ativado para esta empresa.');
          const relation = Array.isArray(membership.companies) ? membership.companies[0] : membership.companies;
          companyId = membership.company_id;
          companyName = relation?.name ?? 'Sua empresa';
          role = membership.role as 'admin' | 'owner';
          setCompanies([{ id: companyId, name: companyName }]);
        }
        if (!companyId) throw new Error('Nenhuma empresa disponível para prospecção.');
        const { data: available, error: featureError } = await supabase.rpc('leadfesta_is_available', { p_company_id: companyId });
        if (featureError || available !== true) throw new Error('O LeadFesta ainda não está ativado para esta empresa.');
        const { data: stageRows, error: stageError } = await supabase.from('lead_pipeline_stages')
          .select('id,name,position').eq('company_id', companyId).order('position').limit(1);
        if (stageError) throw stageError;
        if (active) {
          setWorkspace({ email: user.email ?? '', companyName, companyId, role });
          setStages((stageRows ?? []) as Stage[]);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível validar o acesso.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const mapsUrl = useMemo(() => {
    const query = [segment.trim(), city.trim()].filter(Boolean).join(' em ');
    return query ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query) : '';
  }, [segment, city]);

  function openMaps() {
    if (!mapsUrl) return;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
    setSearchOpened(true);
    setNotice('O Google Maps foi aberto em outra aba. Escolha uma empresa e copie os dados disponíveis para os campos ao lado.');
    setError('');
  }

  async function saveLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !workspace || saving) return;
    if (!draft.name.trim()) {
      setError('Informe o nome da empresa ou do contato.');
      return;
    }
    if (!stages[0]) {
      setError('O funil ainda não possui uma etapa inicial configurada.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const { data: existing, error: duplicateError } = await supabase.from('leads')
      .select('id,name,phone,contact_company').eq('company_id', workspace.companyId).limit(500);
    if (duplicateError) {
      setError('Não foi possível verificar possíveis duplicados. Tente novamente.');
      setSaving(false);
      return;
    }
    const normalize = (value: string | null | undefined) => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
    const phoneDigits = draft.phone.replace(/\D/g, '');
    const duplicate = (existing ?? []).find((lead) =>
      normalize(lead.contact_company || lead.name) === normalize(draft.name) ||
      (phoneDigits.length >= 8 && (lead.phone ?? '').replace(/\D/g, '') === phoneDigits));
    if (duplicate) {
      setError('Este contato parece já existir no LeadFesta: ' + duplicate.name + '. Abra o CRM para conferir antes de cadastrar novamente.');
      setSaving(false);
      return;
    }
    const noteParts = [
      draft.address.trim() ? 'Endereço: ' + draft.address.trim() : '',
      draft.website.trim() ? 'Site: ' + draft.website.trim() : '',
      draft.notes.trim(),
      'Origem: Prospecção pelo Google Maps',
    ].filter(Boolean);
    const { error: insertError } = await supabase.from('leads').insert({
      company_id: workspace.companyId,
      stage_id: stages[0].id,
      name: draft.name.trim(),
      contact_company: draft.name.trim(),
      phone: phoneDigits ? draft.phone.trim() : null,
      email: draft.email.trim() || null,
      source: 'Google Maps',
      notes: noteParts.join('\n\n') || null,
      updated_at: new Date().toISOString(),
    });
    if (insertError) setError('Não foi possível salvar o lead. Confira os dados e tente novamente.');
    else {
      setDraft(emptyDraft);
      setSearchOpened(false);
      setNotice('Empresa adicionada ao LeadFesta com sucesso. Ela já aparece no funil de oportunidades.');
    }
    setSaving(false);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc]"><p role="status" className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm text-gray-600">Verificando acesso...</p></main>;

  if (error && !workspace) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5"><section className="w-full max-w-lg rounded-2xl border border-purple-100 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#8054d8]">LeadFesta • Prospecção</p><h1 className="mt-2 text-2xl font-bold">Acesso não disponível</h1><p role="alert" className="mt-3 text-sm leading-6 text-gray-600">{error}</p><a href={(process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/app/leads/'} className="mt-5 inline-flex rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-semibold text-white">Voltar ao LeadFesta</a></section></main>;

  return <AppShell companyName={workspace?.companyName ?? ''} email={workspace?.email ?? ''} role={workspace?.role} companyId={workspace?.companyId} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''} signingOut={false} onSignOut={() => { void supabase?.auth.signOut().then(() => window.location.assign((process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/login/')); }}>
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#8054d8]">LeadFesta • captação de oportunidades</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Prospectar empresas</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">Encontre negócios por segmento e região no Google Maps e traga os contatos selecionados para seu funil.</p></div>
        <a href={(process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/app/leads/'} className={secondary}>← Voltar ao CRM</a>
      </div>

      {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {workspace?.role === 'owner' && companies.length > 1 && <label className="block max-w-md text-sm font-semibold">Empresa ativa
        <select className={field} value={workspace.companyId} onChange={async (event) => { const nextId = event.target.value; const selected = companies.find((company) => company.id === nextId); if (!selected || !supabase) return; setWorkspace({ ...workspace, companyId: nextId, companyName: selected.name }); setStages([]); const { data } = await supabase.from('lead_pipeline_stages').select('id,name,position').eq('company_id', nextId).order('position').limit(1); setStages((data ?? []) as Stage[]); setNotice('Empresa ativa alterada para ' + selected.name + '.'); }}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
      </label>}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
        <section className={panel}>
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-purple-100 text-xl">⌕</span><div><h2 className="text-lg font-bold">1. Buscar no Google Maps</h2><p className="text-sm text-gray-500">Informe o tipo de negócio e a cidade.</p></div></div>
          <label className="mt-5 block text-sm font-semibold">Segmento / tipo de empresa
            <input className={field} value={segment} onChange={(event) => setSegment(event.target.value)} placeholder="Ex.: buffets infantis, escolas, salões de festa" />
          </label>
          <label className="mt-4 block text-sm font-semibold">Cidade ou região
            <input className={field} value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ex.: Contagem, MG" />
          </label>
          <button type="button" className={primary + ' mt-5 w-full'} onClick={openMaps} disabled={!mapsUrl}>Abrir resultados no Google Maps ↗</button>
          <p className="mt-3 text-xs leading-5 text-gray-500">A pesquisa é aberta no próprio Google Maps. Por segurança e para manter o uso gratuito, o LeadFesta não coleta dados escondidos nem raspa resultados automaticamente.</p>
          <div className="mt-5 rounded-xl bg-purple-50 p-4"><p className="text-sm font-bold text-purple-900">Como funciona para a funcionária</p><ol className="mt-2 list-inside list-decimal space-y-2 text-sm leading-5 text-purple-900/80"><li>Abre a busca pronta no Maps.</li><li>Escolhe uma empresa e copia os dados públicos exibidos.</li><li>Preenche os campos ao lado e adiciona ao funil.</li></ol></div>
        </section>

        <section className={panel}>
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-green-50 text-xl">＋</span><div><h2 className="text-lg font-bold">2. Adicionar empresa ao LeadFesta</h2><p className="text-sm text-gray-500">Os dados vão direto para a etapa inicial do funil.</p></div></div>
          <form onSubmit={saveLead} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold sm:col-span-2">Nome da empresa / contato *
              <input className={field} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nome exibido no Google Maps" required maxLength={160} />
            </label>
            <label className="text-sm font-semibold">Telefone
              <input className={field} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} placeholder="(31) 99999-9999" maxLength={20} />
            </label>
            <label className="text-sm font-semibold">E-mail
              <input className={field} type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="contato@empresa.com" maxLength={254} />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">Endereço
              <input className={field} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} placeholder="Endereço exibido no Maps" maxLength={500} />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">Site
              <input className={field} type="url" value={draft.website} onChange={(event) => setDraft({ ...draft, website: event.target.value })} placeholder="https://..." maxLength={500} />
            </label>
            <label className="text-sm font-semibold sm:col-span-2">Observações
              <textarea className={field + ' min-h-24'} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Ex.: perfil de cliente ideal, horário para contato..." maxLength={3000} />
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="submit" className={primary} disabled={saving || !draft.name.trim()}>{saving ? 'Adicionando...' : 'Adicionar ao funil'}</button>
              <button type="button" className={secondary} onClick={() => { setDraft(emptyDraft); setError(''); }} disabled={saving}>Limpar campos</button>
            </div>
          </form>
          {searchOpened && <p className="mt-4 text-xs text-gray-500">Busca aberta: {segment} • {city}</p>}
        </section>
      </div>
    </div>
  </AppShell>;
}
