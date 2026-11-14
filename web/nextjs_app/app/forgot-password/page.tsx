'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { AuthShell, fieldClass, primaryButtonClass } from '../../components/auth-shell';
import { FieldFeedback, FormFeedback } from '../../components/form-feedback';
import { getAuthErrorMessage } from '../../lib/auth-error-message';
import { validateEmail } from '../../lib/form-validation';
import { supabase } from '../../lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [fieldError, setFieldError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const validationError = validateEmail(email);
    setFieldError(validationError ?? '');
    if (validationError) return;
    if (!supabase) {
      setMessage('O acesso ainda não está configurado. Tente novamente mais tarde.');
      return;
    }
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/reset-password/`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) {
        setMessage(getAuthErrorMessage(error, 'recovery'));
        return;
      }
      setSuccess(true);
      setMessage('Se o endereço estiver cadastrado, você receberá um link para redefinir sua senha.');
    } catch (error) {
      setMessage(getAuthErrorMessage(error, 'recovery'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Recuperar senha" description="Informe o e-mail da sua conta para receber um link de redefinição.">
      <form noValidate onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium">E-mail
          <input id="recovery-email" className={fieldClass} type="email" autoComplete="email" aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'recovery-email-error' : undefined} value={email} onChange={e => setEmail(e.target.value)} />
          {fieldError && <FieldFeedback id="recovery-email-error">{fieldError}</FieldFeedback>}
        </label>
        {message && <FormFeedback variant={success ? 'success' : 'error'}>{message}</FormFeedback>}
        <button className={primaryButtonClass} disabled={busy}>{busy ? 'Enviando...' : 'Enviar link'}</button>
      </form>
      <p className="mt-5 text-center text-sm"><Link href="/login/" className="font-semibold text-[#8054d8]">Voltar ao login</Link></p>
    </AuthShell>
  );
}
