'use client';
import Link from 'next/link';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';

type Entitlement = {
  company_id: string;
  company_name: string;
  enabled: boolean;
  updated_at: string | null;
  updated_by: string | null;
};

const panel = 'rounded-[22px] border border-[#ebe6f3] bg-white p-4 shadow-[0_8px_28px_rgba(39,24,70,0.045)] sm:p-6';
const button = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-purple-200 bg-white px-3 py-2 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50';

export default function LeadFestaAdminPage() {
  const [rows, setRows] = useState<Entitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    if (!supabase) {
      setError('Supabase não está configurado.');
      setLoading(false);
      return;
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      window.location.replace((process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/login/');
      return;
    }
    const { data: isOwner, error: ownerError } = await supabase.rpc('is_platform_owner_for_company');
    if (ownerError || isOwner !== true) {
      setError('Acesso restrito ao proprietário da plataforma.');
      setLoading(false);
      return;
    }
    const { data, error: queryError } = await supabase.rpc('get_leadfesta_entitlements');
    if (queryError) setError('Não foi possível carregar as ativações do LeadFesta.');
    else setRows((data ?? []) as Entitlement[]);
    setLoading(false);
  }

  useEffect(() => {
    // Load remote entitlement state after the admin page mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  async function toggle(row: Entitlement) {
    if (!supabase || savingId) return;
    setSavingId(row.company_id);
    setError('');
    setNotice('');
    const { error: updateError } = await supabase.rpc('set_leadfesta_entitlement', {
      p_company_id: row.company_id,
      p_enabled: !row.enabled,
    });
    if (updateError) setError('Não foi possível alterar a ativação. Tente novamente.');
    else {
      setNotice('Acesso ao LeadFesta ' + (!row.enabled ? 'ativado' : 'suspenso') + ' para ' + row.company_name + '.');
      await load();
    }
    setSavingId('');
  }

  return (
    <main className="min-h-screen bg-[#f8f7fc] text-gray-900">
      <header className="border-b border-purple-100 bg-white">
        <div className="kl-admin-header-inner mx-auto max-w-7xl px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <Link href="/app/admin/" className="kl-admin-brand rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8054d8]">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#8054d8] text-lg font-black text-white sm:size-11 sm:rounded-2xl sm:text-xl">K</span>
            <span className="kl-admin-brand-copy">
              <span className="block whitespace-nowrap text-base font-bold sm:text-xl">KidsLoc <span className="text-[#8054d8]">Admin</span></span>
              <span className="block text-[11px] text-gray-500 sm:text-xs">Proprietário da plataforma</span>
            </span>
          </Link>
          <Link href="/app/admin/" className="kl-admin-back-link rounded-xl border border-purple-200 px-3 py-2 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50">Voltar ao painel</Link>
        </div>
      </header>

      <div className="kl-workspace-refresh kl-platform-admin mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <section className="kl-admin-hero">
          <div className="relative z-10 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="kl-admin-eyebrow">CENTRAL DE CONTROLE · KIDSLOC</p>
              <h1 className="mt-2 text-[clamp(1.45rem,6vw,2.15rem)] font-extrabold leading-tight tracking-tight text-white">Acesso ao LeadFesta</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">Gerencie a liberação do módulo adicional para cada empresa. A suspensão bloqueia o acesso, mas preserva os leads e históricos.</p>
            </div>
            <button type="button" className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#6840bd] shadow-sm transition hover:bg-purple-50 disabled:opacity-60" onClick={() => { setLoading(true); void load(); }} disabled={loading || Boolean(savingId)}> {loading ? 'Atualizando...' : 'Atualizar lista'}</button>
          </div>
          <div className="kl-admin-hero-orb" aria-hidden="true" />
        </section>

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f0edf5] pb-4">
            <div>
              <h2 className="text-lg font-bold text-[#29213b]">Empresas cadastradas</h2>
              <p className="mt-1 text-sm text-gray-500">{rows.length} empresa(s) na plataforma</p>
            </div>
            <span className="rounded-full bg-purple-50 px-3 py-1.5 text-xs font-semibold text-[#6840bd]">Gestão de acesso</span>
          </div>

          <div className="mt-2 divide-y divide-[#f0edf5]">
            {loading ? <p className="py-6 text-sm text-gray-500">Carregando ativações...</p> : rows.length ? rows.map((row) => (
              <article key={row.company_id} className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-[#29213b] sm:text-base">{row.company_name}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{row.updated_at ? 'Última alteração: ' + new Date(row.updated_at).toLocaleString('pt-BR') : 'O módulo ainda não foi ativado'}</p>
                </div>
                <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
                  <span className={'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ' + (row.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600')}>
                    <span className={'size-1.5 rounded-full ' + (row.enabled ? 'bg-emerald-500' : 'bg-gray-400')} aria-hidden="true" />
                    {row.enabled ? 'Ativo' : 'Inativo'}
                  </span>
                  <button type="button" className={button} onClick={() => void toggle(row)} disabled={Boolean(savingId)}>
                    {savingId === row.company_id ? 'Salvando...' : row.enabled ? 'Suspender acesso' : 'Ativar módulo'}
                  </button>
                </div>
              </article>
            )) : <p className="py-8 text-center text-sm text-gray-500">Nenhuma empresa cadastrada.</p>}
          </div>
        </section>

        <section className="rounded-[22px] border border-amber-200 bg-amber-50/80 p-4 text-sm leading-6 text-amber-900 sm:p-5">
          <p className="font-bold">Informação importante</p>
          <p className="mt-1">A ativação é manual e representa a liberação comercial do adicional. Este painel não processa pagamentos automaticamente. Suspender o acesso não exclui nem modifica os dados já cadastrados.</p>
        </section>
      </div>
    </main>
  );
}
