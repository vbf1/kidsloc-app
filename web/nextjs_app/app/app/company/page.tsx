'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AuthShell, fieldClass, primaryButtonClass } from '../../../components/auth-shell';
import { isValidCompanyName, normalizeCompanyName } from '../../../lib/company';
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
      try {
        if (!supabase) {
          setMessage('Supabase ainda não está configurado neste ambiente.');
          return;
        }

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          window.location.replace(
            `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login/`,
          );
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
          setMessage(
            'Não foi possível consultar o vínculo da empresa. Tente novamente.',
          );
          return;
        }

        if (memberships?.length) {
          window.location.replace(
            `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/`,
          );
        }
      } catch {
        if (active) {
          setMessage(
            'Não foi possível verificar sua conta. Confira sua conexão e tente novamente.',
          );
        }
      } finally {
        if (active) setBusy(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    if (!supabase) {
      setMessage('Supabase ainda não está configurado neste ambiente.');
      return;
    }

    const normalizedName = normalizeCompanyName(name);
    if (!isValidCompanyName(normalizedName)) {
      setMessage('Informe um nome de empresa entre 2 e 160 caracteres.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc('create_company', {
        p_name: normalizedName,
      });

      if (error) {
        setMessage(
          error.code === '23505'
            ? 'Esta conta já está vinculada a uma empresa.'
            : 'Não foi possível cadastrar a empresa. Confira os dados e tente novamente.',
        );
        return;
      }

      window.location.assign(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/`,
      );
    } catch {
      setMessage(
        'Não foi possível concluir o cadastro. Confira sua conexão e tente novamente.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell
      title="Cadastre sua empresa"
      description="Informe o nome da locadora para concluir a configuração inicial da sua conta."
    >
      {busy ? (
        <p role="status" className="text-sm text-gray-500">
          Verificando sua conta...
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="rounded-xl bg-purple-50 p-3 text-xs text-purple-800">
            Conta: {email}
          </p>
          <label className="block text-sm font-medium">
            Nome da empresa
            <input
              className={fieldClass}
              required
              minLength={2}
              maxLength={160}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Minha Locadora"
            />
          </label>
          {message && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 p-3 text-sm leading-5 text-red-700"
            >
              {message}
            </p>
          )}
          <button
            className={primaryButtonClass}
            disabled={saving || !isValidCompanyName(name)}
          >
            {saving ? 'Salvando...' : 'Cadastrar empresa'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
