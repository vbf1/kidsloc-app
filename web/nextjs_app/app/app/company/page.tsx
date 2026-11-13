'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AuthShell, fieldClass, primaryButtonClass } from '../../../components/auth-shell';
import { FieldFeedback, FormFeedback } from '../../../components/form-feedback';
import { getAuthErrorMessage } from '../../../lib/auth-error-message';
import { isValidCompanyName, normalizeCompanyName } from '../../../lib/company';
import { validateCompanyName } from '../../../lib/form-validation';
import { supabase } from '../../../lib/supabase';

export default function CompanySetupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!supabase) {
          setMessage('O acesso ainda não está configurado. Tente novamente mais tarde.');
          return;
        }
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          setMessage('Não foi possível validar sua sessão agora. Confira sua conexão e tente novamente.');
          return;
        }
        if (!user) {
          window.location.replace(\`\${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login/\`);
          return;
        }
        if (!active) return;
        setEmail(user.email ?? '');

        const { data: isPlatformOwner, error: ownerError } = await supabase.rpc('is_platform_owner_for_company');
        if (!active) return;
        if (ownerError) {
          setMessage('Não foi possível confirmar as permissões da conta. Tente novamente.');
          return;
        }
        if (isPlatformOwner === true) {
          window.location.replace(\`\${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/admin/\`);
          return;
        }

        const { data: memberships, error } = await supabase.from('company_members')
          .select('company_id').eq('user_id', user.id).limit(1);
        if (!active) return;
        if (error) {
          setMessage('Não foi possível consultar o vínculo da empresa. Tente novamente.');
          return;
        }
        if (memberships?.length) window.location.replace(\`\${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/\`);
      } catch (error) {
        if (active) setMessage(getAuthErrorMessage(error, 'company'));
      } finally {
        if (active) setBusy(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const validationError = validateCompanyName(name);
    setNameError(validationError ?? '');
    if (validationError) return;
    if (!supabase) {
      setMessage('O acesso ainda não está configurado. Tente novamente mais tarde.');
      return;
    }
    const normalizedName = normalizeCompanyName(name);
    if (!isValidCompanyName(normalizedName)) {
      setNameError('O nome da empresa deve ter entre 2 e 160 caracteres.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('create_company', { p_name: normalizedName });
      if (error) {
        setMessage(error.code === '23505' ? 'Esta conta já está vinculada a uma empresa.' : getAuthErrorMessage(error, 'company'));
        return;
      }
      window.location.assign(\`\${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/\`);
    } catch (error) {
      setMessage(getAuthErrorMessage(error, 'company'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell title="Cadastre sua empresa" description="Informe o nome da locadora para concluir a configuração inicial da sua conta.">
      {busy ? <p role="status" className="text-sm text-gray-500">Verificando sua conta...</p> : (
        <form noValidate onSubmit={submit} className="space-y-4">
          <p className="rounded-xl bg-purple-50 p-3 text-xs text-purple-800">Conta: {email}</p>
          <label className="block text-sm font-medium">Nome da empresa
            <input id="company-name" className={fieldClass} maxLength={160} aria-invalid={Boolean(nameError)} aria-describedby={nameError ? 'company-name-error' : undefined} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Minha Locadora" />
            {nameError && <FieldFeedback id="company-name-error">{nameError}</FieldFeedback>}
          </label>
          {message && <FormFeedback>{message}</FormFeedback>}
          <button className={primaryButtonClass} disabled={saving || !isValidCompanyName(name)}>{saving ? 'Salvando...' : 'Cadastrar empresa'}</button>
        </form>
      )}
    </AuthShell>
  );
}
