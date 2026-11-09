'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AuthShell, fieldClass, primaryButtonClass } from '../../../components/auth-shell';
import { supabase } from '../../../lib/supabase';

export default function CompanySetupPage() {
  const [name, setName] = useState('');
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
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .limit(1);
      if (error) {
        setMessage('Não foi possível consultar o vínculo da empresa. Tente novamente ou entre em contato com o suporte.');
      } else if (memberships?.length) {
        window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/`);
      }
      if (active) setBusy(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!supabase || name.trim().length < 2) {
      setMessage('Informe o nome da empresa com pelo menos 2 caracteres.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('create_company', { p_name: name.trim() });
    setSaving(false);
    if (error) {
      setMessage(error.code === '23505' || error.message.includes('já possui uma empresa')
        ? 'Esta conta já está vinculada a uma empresa.'
        : 'Não foi possível cadastrar a empresa. Confira os dados e tente novamente.');
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
            <input className={fieldClass} required minLength={2} maxLength={160} value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Minha Locadora" />
          </label>
          {message && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm leading-5 text-red-700">{message}</p>}
          <button className={primaryButtonClass} disabled={saving || name.trim().length < 2}>{saving ? 'Salvando...' : 'Cadastrar empresa'}</button>
        </form>
      )}
    </AuthShell>
  );
}
