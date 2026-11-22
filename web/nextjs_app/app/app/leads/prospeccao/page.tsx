'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ProspectResult, OSMElement } from '../../../../lib/leadfesta-prospecting';
import { buildIntentSearchLinks, classifyPublicIntent, isDuplicateProspect, mapOSMElement, matchesProspectingSegment } from '../../../../lib/leadfesta-prospecting';
import { AppShell } from '../../../../components/app-shell';
import { supabase } from '../../../../lib/supabase';
import { useResponsivePageSize } from '../../../../lib/use-responsive-page-size';
import { Pagination } from '../../../../components/pagination';

type CompanyOption = { id: string; name: string };
type Workspace = { email: string; companyName: string; companyId: string; role: 'admin' | 'platform_owner' };
type Stage = { id: string; name: string; position: number };
type ExistingLead = { id: string; name: string; phone: string | null; contact_company: string | null };
type SearchElement = OSMElement & { tags?: Record<string, string> };

const panel = 'rounded-2xl border border-purple-100 bg-white p-5 shadow-sm';
const field = 'mt-1 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100';
const primary = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-[#8054d8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#6840bd] disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-purple-200 px-4 py-2.5 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export default function LeadProspectingPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState('');
  const [city, setCity] = useState('Contagem, MG');
  const [radius, setRadius] = useState('10000');
  const [stages, setStages] = useState<Stage[]>([]);
  const [results, setResults] = useState<ProspectResult[]>([]);
  const [existingLeads, setExistingLeads] = useState<ExistingLead[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [searchLabel, setSearchLabel] = useState('');
  const [intentService, setIntentService] = useState('');
  const [intentLocation, setIntentLocation] = useState('');
  const [intentPeriod, setIntentPeriod] = useState<'any' | 'day' | 'week' | 'month' | 'year'>('month');
  const [intentAuthor, setIntentAuthor] = useState('');
  const [intentPostUrl, setIntentPostUrl] = useState('');
  const [intentText, setIntentText] = useState('');
  const [intentVerified, setIntentVerified] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = useResponsivePageSize();
  const [intentPhone, setIntentPhone] = useState('');
  const [savingIntent, setSavingIntent] = useState(false);
  const intentLinks = useMemo(() => buildIntentSearchLinks(intentService, intentLocation, intentPeriod), [intentService, intentLocation, intentPeriod]);
  const intentSignal = useMemo(() => classifyPublicIntent(intentText, Boolean(intentPhone.trim())), [intentText, intentPhone]);

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
        let role: 'admin' | 'platform_owner' = 'admin';
        if (isOwner === true) {
          const { data: rows, error: companiesError } = await supabase.from('companies').select('id,name').order('name');
          if (companiesError) throw companiesError;
          setCompanies((rows ?? []) as CompanyOption[]);
          companyId = rows?.[0]?.id ?? '';
          companyName = rows?.[0]?.name ?? '';
          role = 'platform_owner';
        } else {
          const { data: membership, error: memberError } = await supabase.from('company_members')
            .select('company_id,role,companies(name)').eq('user_id', user.id).limit(1).maybeSingle();
          if (memberError) throw memberError;
          if (!membership?.company_id || (membership.role !== 'admin')) {
            throw new Error('A prospecção está disponível somente para administradores da empresa.');
          }
          const relation = Array.isArray(membership.companies) ? membership.companies[0] : membership.companies;
          companyId = membership.company_id;
          companyName = relation?.name ?? 'Sua empresa';
          role = 'admin';
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

  const duplicateIds = useMemo(() => new Set(results.filter((result) =>
    isDuplicateProspect(result, existingLeads),
  ).map((result) => result.id)), [results, existingLeads]);

  const selectedNewCount = selected.filter((id) => !duplicateIds.has(id)).length;

  async function changeCompany(nextId: string) {
    const company = companies.find((item) => item.id === nextId);
    if (!company || !supabase || !workspace) return;
    setError('');
    setNotice('');
    const { data: available, error: accessError } = await supabase.rpc('leadfesta_is_available', { p_company_id: nextId });
    if (accessError || available !== true) {
      setError('O LeadFesta não está ativado para esta empresa.');
      return;
    }
    const { data, error: stageError } = await supabase.from('lead_pipeline_stages')
      .select('id,name,position').eq('company_id', nextId).order('position').limit(1);
    if (stageError) {
      setError('Não foi possível carregar o funil da empresa selecionada.');
      return;
    }
    setWorkspace({ ...workspace, companyId: nextId, companyName: company.name });
    setStages((data ?? []) as Stage[]);
    setResults([]);
    setSelected([]);
    setExistingLeads([]);
    setNotice('Empresa ativa alterada para ' + company.name + '.');
  }

  async function searchBusinesses() {
    if (!supabase || !workspace || searching) return;
    if (!city.trim()) {
      setError('Informe uma cidade ou região para pesquisar.');
      return;
    }
    setSearching(true);
    setError('');
    setNotice('');
    setResults([]);
    setSelected([]);
    try {
      const geocodeUrl = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=' + encodeURIComponent(city.trim());
      const geocodeResponse = await fetch(geocodeUrl, { headers: { Accept: 'application/json' } });
      if (!geocodeResponse.ok) throw new Error('O serviço de localização está temporariamente indisponível.');
      const locations = await geocodeResponse.json() as Array<{ lat: string; lon: string; display_name: string }>;
      const location = locations[0];
      if (!location) throw new Error('Não encontrei essa cidade ou região. Tente informar também o estado.');
      const query = '[out:json][timeout:25];nwr(around:' + radius + ',' + location.lat + ',' + location.lon + ')["name"];out center tags 250;';
      let payload: { elements?: SearchElement[] } | null = null;
      let lastError: unknown = null;
      for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: query,
          });
          if (!response.ok) throw new Error('A base de empresas está ocupada. Tente novamente em instantes.');
          payload = await response.json() as { elements?: SearchElement[] };
          break;
        } catch (cause) {
          lastError = cause;
        }
      }
      if (!payload) throw lastError instanceof Error ? lastError : new Error('Não foi possível consultar a base aberta de mapas.');
      const mapped = (payload.elements ?? []).map(mapOSMElement).filter((item): item is ProspectResult => item !== null);
      const unique = Array.from(new Map(mapped.map((item) => [item.id, item])).values());
      const matching = segment.trim()
        ? unique.filter((item) => {
            const raw = (payload?.elements ?? []).find((element) => element.type + '/' + element.id === item.id);
            return matchesProspectingSegment(item, segment, raw?.tags ?? {});
          })
        : unique;
      const ordered = matching;
      const { data: existing, error: existingError } = await supabase.from('leads')
        .select('id,name,phone,contact_company').eq('company_id', workspace.companyId).limit(500);
      if (existingError) throw new Error('A busca encontrou empresas, mas não foi possível conferir duplicados no seu CRM.');
      setExistingLeads((existing ?? []) as ExistingLead[]);
      setResults(ordered);
      setSearchLabel(location.display_name);
      if (ordered.length === 0) {
        setNotice('A base aberta não retornou estabelecimentos nomeados nessa região. Tente aumentar o raio ou outra localidade.');
      } else if (segment.trim() && matching.length === 0) {
        setNotice('Nenhum estabelecimento correspondeu ao segmento informado. Os resultados de outros segmentos foram ocultados para evitar contatos sem relação com sua pesquisa.');
      } else {
        setNotice('Busca de estabelecimentos concluída. Confira os dados disponíveis e selecione as empresas que deseja importar.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a pesquisa.');
    } finally {
      setSearching(false);
    }
  }

  async function saveIntentLead() {
    if (!supabase || !workspace || savingIntent) return;
    if (!intentAuthor.trim() || !intentPostUrl.trim()) {
      setError('Informe o nome ou perfil público da pessoa e o link da publicação.');
      return;
    }
    if (!intentVerified) {
      setError('Confirme que a publicação mostra alguém procurando comprar ou contratar, e não oferecendo o serviço.');
      return;
    }
    if (!/^https?:\/\//i.test(intentPostUrl.trim())) {
      setError('O link da publicação precisa começar com http:// ou https://.');
      return;
    }
    if (!stages[0]) {
      setError('O funil ainda não possui uma etapa inicial configurada.');
      return;
    }
    setSavingIntent(true);
    setError('');
    setNotice('');
    try {
      const { data: existing, error: existingError } = await supabase.from('leads')
        .select('id,name,phone,contact_company').eq('company_id', workspace.companyId).limit(1000);
      if (existingError) throw existingError;
      const candidate: ProspectResult = {
        id: 'public-intent/' + intentPostUrl.trim(),
        name: intentAuthor.trim(), category: intentService.trim(), phone: intentPhone.trim(),
        email: '', website: '', whatsapp: '', mobile: '', instagram: '', facebook: '',
        linkedin: '', openingHours: '', description: '', brand: '', operator: '',
        address: intentLocation.trim(), osmUrl: intentPostUrl.trim(),
      };
      if (isDuplicateProspect(candidate, (existing ?? []) as ExistingLead[])) {
        setNotice('Este contato parece já existir no funil desta empresa. Confira os leads antes de cadastrar novamente.');
        return;
      }
      const { error: insertError } = await supabase.from('leads').insert({
        company_id: workspace.companyId,
        stage_id: stages[0].id,
        name: intentAuthor.trim(),
        phone: intentPhone.trim() || null,
        source: 'Pesquisa pública assistida',
        notes: [
          'Tipo de oportunidade: possível cliente procurando contratar ou comprar.',
          intentService.trim() ? 'Produto / serviço procurado: ' + intentService.trim() : '',
          intentLocation.trim() ? 'Localização mencionada: ' + intentLocation.trim() : '',
          'Publicação original: ' + intentPostUrl.trim(),
          intentText.trim() ? 'Trecho da publicação: ' + intentText.trim() : '',
          'Contato informado manualmente a partir de fonte pública; validar interesse antes da abordagem.',
        ].filter(Boolean).join('\n'),
        updated_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
      setNotice('Oportunidade registrada no funil de ' + workspace.companyName + '. A publicação original foi salva nas observações.');
      setIntentAuthor('');
      setIntentPostUrl('');
      setIntentText('');
      setIntentPhone('');
      setIntentVerified(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a oportunidade.');
    } finally {
      setSavingIntent(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAll() {
    const available = results.filter((item) => !duplicateIds.has(item.id)).map((item) => item.id);
    setSelected((current) => current.length === available.length ? [] : available);
  }

  async function importSelected() {
    if (!supabase || !workspace || saving || selectedNewCount === 0) return;
    if (!stages[0]) {
      setError('O funil ainda não possui uma etapa inicial configurada.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const toImport = results.filter((item) => selected.includes(item.id) && !duplicateIds.has(item.id));
    const rows = toImport.map((item) => ({
      company_id: workspace.companyId,
      stage_id: stages[0].id,
      name: item.name,
      contact_company: item.name,
      phone: item.phone || null,
      email: item.email || null,
      source: 'OpenStreetMap',
      notes: [
        item.category ? 'Categoria: ' + item.category : '',
        item.address ? 'Endereço: ' + item.address : '',
        item.website ? 'Site: ' + item.website : '',
        item.whatsapp ? 'WhatsApp: ' + item.whatsapp : '',
        item.mobile ? 'Celular: ' + item.mobile : '',
        item.instagram ? 'Instagram: ' + item.instagram : '',
        item.facebook ? 'Facebook: ' + item.facebook : '',
        item.linkedin ? 'LinkedIn: ' + item.linkedin : '',
        item.openingHours ? 'Horário de funcionamento: ' + item.openingHours : '',
        item.description ? 'Descrição: ' + item.description : '',
        item.brand ? 'Marca: ' + item.brand : '',
        item.operator ? 'Responsável / operador: ' + item.operator : '',
        'Fonte pública: ' + item.osmUrl,
        'Importado pela prospecção do LeadFesta.',
      ].filter(Boolean).join('\\n'),
      updated_at: new Date().toISOString(),
    }));
    const { error: insertError } = await supabase.from('leads').insert(rows);
    if (insertError) {
      setError('Não foi possível importar as empresas. Nenhum sucesso foi confirmado; revise o CRM antes de tentar novamente.');
    } else {
      setNotice(rows.length + ' empresa(s) importada(s) para o funil de ' + workspace.companyName + '.');
      setSelected([]);
      const { data } = await supabase.from('leads').select('id,name,phone,contact_company')
        .eq('company_id', workspace.companyId).limit(500);
      if (data) setExistingLeads(data as ExistingLead[]);
    }
    setSaving(false);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc]"><p role="status" className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm text-gray-600">Verificando acesso...</p></main>;
  if (error && !workspace) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5"><section className="w-full max-w-lg rounded-2xl border border-purple-100 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#8054d8]">LeadFesta • Prospecção</p><h1 className="mt-2 text-2xl font-bold">Acesso não disponível</h1><p role="alert" className="mt-3 text-sm leading-6 text-gray-600">{error}</p><a href={(process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/app/leads/'} className="mt-5 inline-flex rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-semibold text-white">Voltar ao LeadFesta</a></section></main>;

  return <AppShell companyName={workspace?.companyName ?? ''} email={workspace?.email ?? ''} role={workspace?.role} companyId={workspace?.companyId} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''} signingOut={false} onSignOut={() => { void supabase?.auth.signOut().then(() => window.location.assign((process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/login/')); }}>
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#8054d8]">LeadFesta • captação de oportunidades</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Encontrar clientes interessados</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">Pesquise manifestações públicas de pessoas procurando produtos ou serviços e registre oportunidades no funil da empresa ativa.</p></div>
        <a href={(process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/app/leads/'} className={secondary}>← Voltar ao CRM</a>
      </div>

      {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {workspace?.role === 'platform_owner' && companies.length > 1 && <label className="block max-w-md text-sm font-semibold">Empresa ativa
        <select className={field} value={workspace.companyId} onChange={(event) => { void changeCompany(event.target.value); }}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select>
      </label>}

      <section className={panel}>
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-emerald-100 text-xl">⌕</span><div><h2 className="text-lg font-bold">Encontrar clientes procurando contratar</h2><p className="text-sm text-gray-500">Pesquisa assistida em fontes públicas, para qualquer produto ou serviço.</p></div></div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold">Produto ou serviço procurado
            <input className={field} value={intentService} onChange={(event) => setIntentService(event.target.value)} placeholder="Ex.: buffet, limpeza, fotografia, locação de brinquedos" maxLength={120} />
          </label>
          <label className="text-sm font-semibold">Cidade, bairro ou região (opcional)
            <input className={field} value={intentLocation} onChange={(event) => setIntentLocation(event.target.value)} placeholder="Ex.: Contagem, MG" maxLength={120} />
          </label>
          <label className="text-sm font-semibold">Período das publicações
            <select className={field} value={intentPeriod} onChange={(event) => setIntentPeriod(event.target.value as 'any' | 'day' | 'week' | 'month' | 'year')}>
              <option value="day">Últimas 24 horas</option>
              <option value="week">Últimos 7 dias</option>
              <option value="month">Últimos 30 dias</option>
              <option value="year">Último ano</option>
              <option value="any">Qualquer período</option>
            </select>
          </label>
        </div>
        {intentLinks.length > 0 && <div className="mt-4"><p className="text-sm font-semibold text-gray-800">Pesquisas prontas por fonte</p><p className="mt-1 text-xs leading-5 text-gray-500">As pesquisas procuram expressões de intenção, como “procuro”, “preciso”, “alguém indica” e “quero contratar”. O período é aplicado automaticamente nas pesquisas do Google e DuckDuckGo; no Bing, ajuste o filtro de data após abrir. Abra uma fonte, confira a publicação original e confirme que a pessoa está procurando o serviço — não oferecendo.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">
          {intentLinks.map((link) => <a key={link.source} href={link.url} target="_blank" rel="noreferrer" className="rounded-xl border border-gray-200 p-3 transition hover:border-purple-300 hover:bg-purple-50"><span className="block text-sm font-semibold text-[#6840bd]">{link.source} ↗</span><span className="mt-1 block text-xs text-gray-500">{link.description}</span></a>)}
        </div></div>}
        <div className="mt-5 border-t border-gray-100 pt-5"><h3 className="text-sm font-bold">Registrar uma oportunidade encontrada</h3><p className="mt-1 text-xs text-gray-500">Depois de verificar a publicação, registre somente informações públicas e necessárias. O cadastro ficará na empresa ativa.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold">Nome ou perfil público da pessoa *
              <input className={field} value={intentAuthor} onChange={(event) => setIntentAuthor(event.target.value)} placeholder="Nome ou @perfil" maxLength={120} />
            </label>
            <label className="text-sm font-semibold">Link da publicação original *
              <input className={field} value={intentPostUrl} onChange={(event) => setIntentPostUrl(event.target.value)} placeholder="https://..." maxLength={1000} />
            </label>
            <label className="text-sm font-semibold">Telefone público (se informado)
              <input className={field} value={intentPhone} onChange={(event) => setIntentPhone(event.target.value)} placeholder="(31) 99999-9999" maxLength={40} />
            </label>
            <label className="text-sm font-semibold">Trecho da publicação
              <textarea className={field + ' min-h-20'} value={intentText} onChange={(event) => setIntentText(event.target.value)} placeholder="Cole apenas o trecho necessário que demonstra interesse..." maxLength={1000} />
            <span className={'mt-2 block rounded-lg p-3 text-xs leading-5 ' + (intentSignal.classification === 'buyer' ? 'bg-emerald-50 text-emerald-800' : intentSignal.classification === 'vendor' ? 'bg-amber-50 text-amber-900' : 'bg-gray-50 text-gray-600')}>
              <strong>{intentSignal.classification === 'buyer' ? 'Sinal de possível cliente' : intentSignal.classification === 'vendor' ? 'Sinal de possível oferta' : 'Intenção não identificada'}</strong>
              {intentSignal.classification !== 'vendor' && <span className="mt-1 block font-semibold">Força dos sinais: {intentSignal.score}/100 · {intentSignal.priority === 'high' ? 'Alta' : intentSignal.priority === 'medium' ? 'Média' : 'Baixa'}</span>}
              {intentSignal.signals.length > 0 && <ul className="mt-1 list-disc pl-4">{intentSignal.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul>}
              <span className="mt-1 block">{intentSignal.reason} A pontuação é uma triagem heurística, não uma probabilidade de conversão. Confira manualmente o contexto antes de registrar.</span>
            </span>
            </label>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm text-gray-700"><input type="checkbox" className="mt-1 size-4 accent-[#8054d8]" checked={intentVerified} onChange={(event) => setIntentVerified(event.target.checked)} /><span>Confirmei que a publicação mostra uma pessoa procurando comprar ou contratar este produto/serviço — não alguém anunciando ou oferecendo.</span></label>
          <button type="button" className={primary + ' mt-3'} onClick={() => { void saveIntentLead(); }} disabled={savingIntent || !intentAuthor.trim() || !intentPostUrl.trim() || !intentVerified}>{savingIntent ? 'Registrando...' : 'Registrar oportunidade no funil'}</button>
        </div>
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Importante: esta versão abre pesquisas públicas nos buscadores; não acessa contas privadas nem extrai automaticamente dados das redes. Algumas plataformas restringem o uso comercial de suas APIs. A pessoa deve ter manifestado interesse publicamente e o contato deve respeitar a legislação aplicável.</p>
      </section>

      <details className={panel}>
        <summary className="cursor-pointer text-base font-bold">Pesquisa complementar de estabelecimentos (não identifica clientes interessados)</summary>
        <p className="mb-4 mt-2 text-xs leading-5 text-gray-500">Esta ferramenta antiga localiza empresas e pontos comerciais no OpenStreetMap. Use-a apenas quando seu objetivo for encontrar estabelecimentos, não pessoas procurando contratar.</p>
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-purple-100 text-xl">⌕</span><div><h2 className="text-lg font-bold">Buscar estabelecimentos</h2><p className="text-sm text-gray-500">A pesquisa usa dados públicos do OpenStreetMap, sem chave ou API paga.</p></div></div>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_180px_auto] md:items-end">
          <label className="text-sm font-semibold">Segmento / tipo de negócio
            <input className={field} value={segment} onChange={(event) => setSegment(event.target.value)} placeholder="Ex.: escolas, clínicas, oficinas, buffets" maxLength={100} />
          </label>
          <label className="text-sm font-semibold">Cidade ou região
            <input className={field} value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ex.: Contagem, MG" maxLength={120} />
          </label>
          <label className="text-sm font-semibold">Raio da busca
            <select className={field} value={radius} onChange={(event) => setRadius(event.target.value)}><option value="5000">5 km</option><option value="10000">10 km</option><option value="20000">20 km</option></select>
          </label>
          <button type="button" className={primary} onClick={() => { void searchBusinesses(); }} disabled={searching || !city.trim()}>{searching ? 'Pesquisando...' : 'Buscar empresas'}</button>
        </div>
        <p className="mt-3 text-xs leading-5 text-gray-500">A base aberta tem cobertura variável e nem sempre informa telefone, e-mail ou site. Quando nenhum resultado corresponde ao segmento informado, não exibimos estabelecimentos de outras categorias. Esta base identifica locais e empresas, não clientes com intenção de contratação.</p>

      {results.length > 0 && <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold">Resultados encontrados</h2><p className="text-sm text-gray-500">{results.length} estabelecimento(s) • {searchLabel}</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" className={secondary} onClick={toggleAll}>{selected.length === results.filter((item) => !duplicateIds.has(item.id)).length ? 'Desmarcar todos' : 'Selecionar disponíveis'}</button><button type="button" className={primary} onClick={() => { void importSelected(); }} disabled={saving || selectedNewCount === 0}>{saving ? 'Importando...' : 'Importar ' + selectedNewCount + ' selecionada(s)'}</button></div>
        </div>
        <div className="mt-4 space-y-3">
          {results.slice(page * pageSize, (page + 1) * pageSize).map((item) => {
            const duplicate = duplicateIds.has(item.id);
            return <label key={item.id} className={'flex cursor-pointer gap-3 rounded-xl border p-4 transition ' + (duplicate ? 'border-gray-100 bg-gray-50 opacity-70' : selected.includes(item.id) ? 'border-purple-300 bg-purple-50/60' : 'border-gray-200 hover:border-purple-200')}>
              <input type="checkbox" className="mt-1 size-4 accent-[#8054d8]" checked={selected.includes(item.id)} disabled={duplicate || saving} onChange={() => toggleSelected(item.id)} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-gray-900">{item.name}</strong>{duplicate && <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">Possível duplicado</span>}</span>
                <span className="mt-1 block text-xs text-gray-500">{item.category}{item.address ? ' • ' + item.address : ''}</span>
                <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">{item.phone && <span>Tel.: {item.phone}</span>}{item.mobile && <span>Celular: {item.mobile}</span>}{item.whatsapp && <span>WhatsApp: {item.whatsapp}</span>}{item.email && <span>{item.email}</span>}{item.website && <span>{item.website}</span>}</span>
                <span className="mt-2 block space-y-1 text-xs text-gray-600">{item.openingHours && <span className="block">Funcionamento: {item.openingHours}</span>}{item.brand && <span className="block">Marca: {item.brand}</span>}{item.operator && <span className="block">Responsável: {item.operator}</span>}{item.description && <span className="block">{item.description}</span>}</span><span className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-[#6840bd]">{item.instagram && <span>Instagram: {item.instagram}</span>}{item.facebook && <span>Facebook: {item.facebook}</span>}{item.linkedin && <span>LinkedIn: {item.linkedin}</span>}</span><span className="mt-2 inline-block text-xs font-semibold text-[#6840bd]" onClick={(event) => event.stopPropagation()}><a href={item.osmUrl} target="_blank" rel="noreferrer">Ver no OpenStreetMap ↗</a></span>
              </span>
            </label>;
          })}
        </div>
        <Pagination totalCount={results.length} page={page} pageSize={pageSize} onPageChange={setPage}/>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4"><p className="text-xs text-gray-500">{duplicateIds.size} possível(is) duplicado(s) bloqueado(s) • {selectedNewCount} selecionada(s) para importar</p><button type="button" className={primary} onClick={() => { void importSelected(); }} disabled={saving || selectedNewCount === 0}>{saving ? 'Importando...' : 'Importar selecionadas para o funil'}</button></div>
      </section>}
      </details>

      <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4"><p className="text-sm font-bold text-blue-950">Sobre os dados e a privacidade</p><p className="mt-1 text-sm leading-6 text-blue-900/80">A pesquisa por intenção abre resultados públicos nos buscadores; os dados só são registrados após revisão manual. A pesquisa complementar de estabelecimentos consulta o OpenStreetMap. Oportunidades e contatos ficam isolados no CRM da empresa ativa; nenhuma busca ou importação mistura dados entre empresas. Não são acessados perfis ou mensagens privadas.</p><p className="mt-2 text-xs text-blue-900/70">Dados cartográficos © contribuidores do OpenStreetMap.</p></section>
    </div>
  </AppShell>;
}
