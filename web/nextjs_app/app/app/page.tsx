'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AppHomePage() {
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('Carregando sua área de trabalho...');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) {
        setMessage('Supabase ainda não está configurado neste ambiente.');
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login/`);
        return;
      }
      const { data, error } = await supabase
        .from('company_members')
        .select('companies(name)')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (!active) return;
      setEmail(user.email ?? '');
      if (error || !data) {
        window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/company/`);
        return;
      }
      const companyValue = data.companies as unknown as { name: string } | null;
      setCompany(companyValue?.name ?? 'Sua empresa');
      setMessage('');
    }
    void load();
    return () => { active = false; };
  }, []);

  async function signOut() {
    await supabase?.auth.signOut();
    window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login/`);
  }

  return (
    <main className="min-h-screen px-5 py-8 md:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-[#8054d8] text-xl font-black text-white">K</span><span className="text-xl font-bold">KidsLoc <span className="text-[#8054d8]">App</span></span></div>
          <button onClick={signOut} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold">Sair</button>
        </header>
        <section className="mt-12">
          <p className="text-sm font-semibold text-[#8054d8]">ÁREA DA EMPRESA</p>
          <h1 className="mt-2 text-3xl font-bold">{company || 'Bem-vindo ao KidsLoc'}</h1>
          <p className="mt-2 text-sm text-gray-500">{email}</p>
          {message && <p role="status" className="mt-6 rounded-xl bg-purple-50 p-4 text-sm text-purple-800">{message}</p>}
          {!message && <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {['Clientes', 'Brinquedos e serviços', 'Agenda e reservas', 'Financeiro'].map(item => <div key={item} className="rounded-2xl border border-purple-100 bg-white p-5"><p className="font-semibold">{item}</p><p className="mt-2 text-sm text-gray-500">Disponível nas próximas etapas do MVP.</p></div>)}
          </div>}
        </section>
      </div>
    </main>
  );
}
