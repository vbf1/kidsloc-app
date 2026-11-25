'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { supabase } from '../../../lib/supabase';
import { clearWorkspaceSessionCache, getWorkspaceSessionCache, setWorkspaceSessionCache } from '../../../lib/workspace-session-cache';
import { LANGUAGE_OPTIONS, LANGUAGE_STORAGE_KEY, LANGUAGE_EVENT, normalizeLanguage, type AppLanguage } from '../../../lib/i18n';

type ThemeChoice = 'light' | 'dark' | 'system';
type UiScale = 'small' | 'medium' | 'large';
const THEME_KEY = 'kidsloc-theme';
const UI_SCALE_KEY = 'kidsloc-ui-scale';
function currentUiScale(): UiScale {
  if (typeof window === 'undefined') return 'medium';
  const value = window.localStorage.getItem(UI_SCALE_KEY);
  return value === 'small' || value === 'large' ? value : 'medium';
}
function applyUiScale(value: UiScale) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(UI_SCALE_KEY, value);
  document.documentElement.dataset.uiScale = value;
  window.dispatchEvent(new CustomEvent('kidsloc:ui-scale-change', { detail: value }));
}
function currentTheme(): ThemeChoice {
  if (typeof window === 'undefined') return 'system';
  const value = window.localStorage.getItem(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}
function applyTheme(value: ThemeChoice) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_KEY, value);
  if (value === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = value;
  window.dispatchEvent(new CustomEvent('kidsloc:theme-change', { detail: value }));
}

export default function SettingsPage() {
  const router = useRouter();
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [uiScale, setUiScale] = useState<UiScale>('medium');
  const [language, setLanguage] = useState<AppLanguage>('pt-BR');
  const [languageSaving, setLanguageSaving] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState('30');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canManage = role === 'admin' || role === 'owner';

  useEffect(() => {
    const themeTimer = window.setTimeout(() => { setTheme(currentTheme()); setUiScale(currentUiScale()); }, 0);
    let active = true;
    async function load() {
      if (!supabase) { setError('Banco não configurado.'); setLoading(false); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { clearWorkspaceSessionCache(); router.replace('/login/'); return; }
      if (!active) return;
      setEmail(user.email ?? '');
      const preferredLanguage = normalizeLanguage(user.user_metadata?.preferred_language ?? window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
      setLanguage(preferredLanguage);
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, preferredLanguage);
      const cached = getWorkspaceSessionCache();
      let id = '';
      let name = '';
      let memberRole = '';
      if (cached?.userId === user.id) {
        id = cached.companyId; name = cached.companyName; memberRole = cached.role;
      } else {
        const { data, error: memberError } = await supabase.from('company_members')
          .select('company_id,role,companies(name)').eq('user_id', user.id).limit(1).maybeSingle();
        if (memberError || !data) { setError('Não foi possível identificar sua empresa.'); setLoading(false); return; }
        const company = Array.isArray(data.companies) ? data.companies[0] : data.companies;
        id = data.company_id; name = company?.name ?? 'Empresa'; memberRole = data.role;
        setWorkspaceSessionCache({ userId: user.id, email: user.email ?? '', companyName: name, companyId: id, role: memberRole as 'admin' | 'staff' });
      }
      if (!active) return;
      setCompanyId(id); setCompanyName(name); setRole(memberRole);
      const { data: settings, error: settingsError } = await supabase.rpc('get_company_settings', { p_company_id: id });
      if (!active) return;
      if (settingsError) setError('Não foi possível carregar as configurações da empresa.');
      else setDepositPercentage(String(settings?.default_deposit_percentage ?? 30));
      setLoading(false);
    }
    void load();
    return () => { active = false; window.clearTimeout(themeTimer); };
  }, [router]);

  async function saveLanguage(nextLanguage: AppLanguage) {
    if (!supabase || languageSaving) return;
    setLanguage(nextLanguage);
    setLanguageSaving(true);
    setError(''); setNotice('');
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    document.documentElement.lang = nextLanguage;
    window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: nextLanguage }));
    const { error: languageError } = await supabase.auth.updateUser({ data: { preferred_language: nextLanguage } });
    if (languageError) setError('Não foi possível salvar o idioma na sua conta. A preferência ficará salva neste dispositivo.');
    else setNotice('Idioma atualizado com sucesso.');
    setLanguageSaving(false);
  }

  async function saveSettings() {
    if (!supabase || !companyId || !canManage || saving) return;
    const value = Number(depositPercentage.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      setError('Informe um percentual entre 0 e 100.'); return;
    }
    setSaving(true); setError(''); setNotice('');
    const { data, error: saveError } = await supabase.rpc('update_company_settings', {
      p_company_id: companyId, p_default_deposit_percentage: value,
    });
    if (saveError) setError(saveError.message);
    else {
      setDepositPercentage(String(data?.default_deposit_percentage ?? value));
      setNotice('Configurações salvas. O percentual será usado nas novas locações.');
    }
    setSaving(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut(); router.push('/login/');
  }

  return <AppShell companyName={companyName} email={email} role={role as 'admin' | 'staff'} companyId={companyId} basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''} signingOut={false} onSignOut={signOut}>
    <section className="mx-auto w-full max-w-4xl space-y-6 pb-10">
      <header><p className="text-xs font-bold uppercase tracking-[.16em] text-[#8054d8]">Preferências</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Configurações do app</h1><p className="mt-2 text-sm text-slate-500">Personalize a aparência e os padrões usados pela sua empresa.</p></header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {loading ? <p role="status" className="rounded-xl border bg-white p-4 text-sm text-slate-500">Carregando configurações...</p> : <>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-50 text-xl">🌐</span><div><h2 className="font-bold text-slate-900">Idioma</h2><p className="mt-1 text-sm text-slate-500">Escolha o idioma de todo o aplicativo. A preferência será salva na sua conta.</p></div></div>
          <label className="mt-5 block max-w-md text-sm font-semibold text-slate-700">Idioma do aplicativo
            <select value={language} disabled={languageSaving} onChange={event=>void saveLanguage(normalizeLanguage(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-base disabled:opacity-60">
              {LANGUAGE_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {languageSaving && <p className="mt-2 text-xs text-slate-500">Salvando idioma...</p>}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-violet-50 text-xl">Aa</span><div><h2 className="font-bold text-slate-900">Tamanho da interface</h2><p className="mt-1 text-sm text-slate-500">Ajuste o tamanho das letras, espaços e componentes para caber mais conteúdo na tela.</p></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {([{value:'small',label:'Pequeno',description:'Mais compacto'},{value:'medium',label:'Médio',description:'Equilíbrio entre espaço e leitura'},{value:'large',label:'Grande',description:'Elementos maiores'}] as const).map(option => <button key={option.value} type="button" aria-pressed={uiScale===option.value} onClick={()=>{setUiScale(option.value);applyUiScale(option.value);}} className={`rounded-xl border p-4 text-left transition ${uiScale===option.value?'border-purple-400 bg-purple-50 ring-2 ring-purple-100':'border-slate-200 hover:border-purple-200'}`}><span className="block text-sm font-bold text-slate-900">{option.label}</span><span className="mt-1 block text-xs text-slate-500">{option.description}</span></button>)}
          </div>
          <p className="mt-3 text-xs text-slate-500">A preferência fica salva neste dispositivo e é aplicada em todas as telas do app.</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-purple-50 text-xl">🌙</span><div><h2 className="font-bold text-slate-900">Aparência</h2><p className="mt-1 text-sm text-slate-500">Escolha como o KidsLoc será exibido neste dispositivo.</p></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {([{value:'light',label:'Claro',description:'Fundo claro'},{value:'dark',label:'Escuro',description:'Confortável à noite'},{value:'system',label:'Automático',description:'Segue o dispositivo'}] as const).map(option => <button key={option.value} type="button" aria-pressed={theme===option.value} onClick={()=>{setTheme(option.value);applyTheme(option.value);}} className={`rounded-xl border p-4 text-left transition ${theme===option.value?'border-purple-400 bg-purple-50 ring-2 ring-purple-100':'border-slate-200 hover:border-purple-200'}`}><span className="block text-sm font-bold text-slate-900">{option.label}</span><span className="mt-1 block text-xs text-slate-500">{option.description}</span></button>)}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-xl">💰</span><div><h2 className="font-bold text-slate-900">Padrão de sinal</h2><p className="mt-1 text-sm text-slate-500">Percentual sugerido automaticamente ao criar novas locações.</p></div></div>
          <label className="mt-5 block max-w-sm text-sm font-semibold text-slate-700">Percentual padrão (%)<input type="number" min="0" max="100" step="0.5" value={depositPercentage} onChange={event=>setDepositPercentage(event.target.value)} disabled={!canManage} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-base disabled:opacity-60"/></label>
          <p className="mt-2 text-xs leading-5 text-slate-500">O padrão inicial é 30%. Você ainda poderá alterar o valor ou percentual individualmente em cada locação. Alterar esta configuração não modifica locações antigas.</p>
          {!canManage && <p className="mt-2 text-xs text-amber-700">Somente administradores podem alterar esta configuração.</p>}
          {canManage && <button type="button" onClick={saveSettings} disabled={saving} className="mt-4 rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving?'Salvando...':'Salvar configurações'}</button>}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="font-bold text-slate-900">Sobre o aplicativo</h2><p className="mt-2 text-sm text-slate-500">KidsLoc App · Gestão de locações, clientes e financeiro.</p><p className="mt-1 text-xs text-slate-400">As preferências de aparência são salvas neste dispositivo; o percentual de sinal é compartilhado com a empresa.</p></section>
      </>}
    </section>
  </AppShell>;
}
