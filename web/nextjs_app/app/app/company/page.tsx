'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AuthShell, fieldClass, primaryButtonClass } from '../../../components/auth-shell';
import { isValidCompanySlug, slugifyCompanyName } from '../../../lib/company';
import { supabase } from '../../../lib/supabase';

export default function CompanySetupPage() {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) {
        if (active) { setMessage('Supabase ainda não está configurado neste ambiente.'); setBusy(false); }
        return;
      }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login/`);
        return;
      }
      if (!active) return;
      setEmail(user.email ?? '');
      const { data: memberships, error } = await supabase
        .from('company_users')
        .select('company_id, companies(name)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1);
      if (error) {
        setMessage('Não foi possível consultar a empresa. O banco precisa estar atualizado com a migration da Fundação do KidsLoc antes de habilitar o cadastro.');
      } else if (memberships?.length) {
        window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/`);
      }
      if (active) setBusy(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  function updateName(value: string) {
    setName(value);
    setSlug(slugifyCompanyName(value));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!supabase || !isValidCompanySlug(slug)) {
      setMessage('Confira o nome e o identificador da empresa.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('create_company', { p_name: name.trim(), p_slug: slug });
    setSaving(false);
    if (error) {
      setMessage(error.message.includes('duplicate') || error.code === '23505'
        ? 'Esse identificador já está em uso. Escolha outro.'
        : 'Não foi possível cadastrar a empresa. Verifique se a migration da Fundação foi aplicada ao banco de desenvolvimento.');
      return;
    }
    window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/`);
  }

  return (
    <AuthShell title="Cadastre sua empresa" description="Essas informações serão usadas para organizar seus clientes, brinquedos, serviços e reservas.">
      {busy ? <p className="text-sm text-gray-500">Verificando sua conta...</p> : (
        <form onSubmit={submit} className="space-y-4">
          <p className="rounded-xl bg-purple-50 p-3 text-xs text-purple-800">Conta: {email}</p>
          <label className="block text-sm font-medium">Nome da empresa
            <input className={fieldClass} required minLength={2} maxLength={160} value={name} onChange={e => updateName(e.target.value)} placeholder="Ex.: Minha Locadora" />
          </label>
          <label className="block text-sm font-medium">Identificador
            <input className={fieldClass} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={60} value={slug} onChange={e => setSlug(slugifyCompanyName(e.target.value))} />
            <span className="mt-1 block text-xs text-gray-500">Usado internamente para identificar sua empresa.</span>
          </label>
          {message && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm leading-5 text-red-700">{message}</p>}
          <button className={primaryButtonClass} disabled={saving || !name.trim() || !isValidCompanySlug(slug)}>{saving ? 'Salvando...' : 'Cadastrar empresa'}</button>
        </form>
      )}
    </AuthShell>
  );
}
