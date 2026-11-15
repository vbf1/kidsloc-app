'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { AuthShell, fieldClass, primaryButtonClass } from '../../components/auth-shell';
import { FieldFeedback, FormFeedback } from '../../components/form-feedback';
import { getAuthErrorMessage } from '../../lib/auth-error-message';
import { validatePassword } from '../../lib/form-validation';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [fieldError, setFieldError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const validationError = validatePassword(password);
    setFieldError(validationError ?? '');
    if (validationError) return;
    if (!supabase) {
      setMessage('O acesso ainda não está configurado. Tente novamente mais tarde.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage(getAuthErrorMessage(error, 'password_update'));
        return;
      }
      setDone(true);
      setMessage('Senha atualizada com sucesso. Entre novamente com sua nova senha.');
    } catch (error) {
      setMessage(getAuthErrorMessage(error, 'password_update'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Definir nova senha" description="Escolha uma senha nova para sua conta KidsLoc.">
      {done ? (
        <div className="space-y-4">
          <FormFeedback variant="success">{message}</FormFeedback>
          <Link href="/login/" className="block text-center font-semibold text-[#8054d8]">Ir para o login</Link>
        </div>
      ) : (
        <form noValidate onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium">Nova senha
            <input id="reset-password" className={fieldClass} type="password" autoComplete="new-password" aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'reset-password-error' : undefined} value={password} onChange={e => setPassword(e.target.value)} />
            {fieldError && <FieldFeedback id="reset-password-error">{fieldError}</FieldFeedback>}
          </label>
          {message && <FormFeedback>{message}</FormFeedback>}
          <button className={primaryButtonClass} disabled={busy}>{busy ? 'Salvando...' : 'Salvar nova senha'}</button>
        </form>
      )}
    </AuthShell>
  );
}
