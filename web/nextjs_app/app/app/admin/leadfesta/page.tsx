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

const panel = 'rounded-2xl border border-purple-100 bg-white p-5 shadow-sm';
const button = 'rounded-xl border border-purple-200 px-3 py-2 text-sm font-semibold text-[#6840bd] transition hover:bg-purple-50 disabled:opacity-50';

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

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc]"><p role="status" className="rounded-xl border border-purple-100 bg-white px-5 py-4 text-sm text-gray-600">Carregando ativações...</p></main>;

  return <main className="min-h-screen bg-[#f8f7fc] px-4 py-6 text-gray-900 sm:px-6 lg:px-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/app/admin/" className="text-sm font-semibold text-[#6840bd]">← Painel do proprietário</Link>
      <header><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">Administração global</p><h1 className="mt-2 text-3xl font-bold">Acesso ao LeadFesta</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">Ative o adicional comercial para empresas que contrataram o módulo. A suspensão bloqueia o acesso, mas preserva todos os leads e históricos.</p></header>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Empresas cadastradas</h2><p className="mt-1 text-sm text-gray-500">{rows.length} empresa(s)</p></div><button type="button" className={button} onClick={() => { setLoading(true); void load(); }}>Atualizar</button></div>
        <div className="mt-4 divide-y divide-gray-100">
          {rows.length ? rows.map((row) => <div key={row.company_id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="min-w-0"><p className="font-semibold">{row.company_name}</p><p className="mt-1 text-xs text-gray-400">{row.updated_at ? 'Última alteração: ' + new Date(row.updated_at).toLocaleString('pt-BR') : 'Nunca ativado'}</p></div>
            <div className="flex items-center gap-3"><span className={'rounded-full px-3 py-1.5 text-xs font-bold ' + (row.enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600')}>{row.enabled ? 'Ativo' : 'Inativo'}</span><button type="button" className={button} onClick={() => void toggle(row)} disabled={Boolean(savingId)}>{savingId === row.company_id ? 'Salvando...' : row.enabled ? 'Suspender' : 'Ativar módulo'}</button></div>
          </div>) : <p className="py-6 text-sm text-gray-500">Nenhuma empresa cadastrada.</p>}
        </div>
      </section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Importante:</strong> a ativação é manual e representa a liberação comercial do adicional. Este painel não processa pagamentos automaticamente. A suspensão não exclui nem modifica os dados já cadastrados.</section>
    </div>
  </main>;
}
