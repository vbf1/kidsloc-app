'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AuthShell, fieldClass, primaryButtonClass } from '../../components/auth-shell';
import { FieldFeedback, FormFeedback } from '../../components/form-feedback';
import { getAuthErrorMessage } from '../../lib/auth-error-message';
import { validateEmail, validatePassword } from '../../lib/form-validation';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        if (supabase) {
          const { data, error } = await supabase.auth.getSession();
          if (active && !error && data.session?.user) {
            window.location.replace((process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/app/');
            return;
          }
        }
      } catch {
        // Keep the login available when session lookup fails temporarily.
      }
      if (active) setCheckingSession(false);
    }
    void checkSession();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const errors = { email: validateEmail(email), password: validatePassword(password, 6) };
    setFieldErrors(Object.entries(errors).reduce<Record<string, string>>((result, [field, error]) => {
      if (error) result[field] = error;
      return result;
    }, {}));
    if (Object.values(errors).some(Boolean)) return;
    if (!supabase) {
      setMessage('O acesso ainda não está configurado. Tente novamente mais tarde.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setMessage(getAuthErrorMessage(error, 'login'));
        return;
      }
      // The workspace router detects platform owners and company members separately.
      window.location.assign((process.env.NEXT_PUBLIC_BASE_PATH ?? '') + '/app/');
    } catch (error) {
      setMessage(getAuthErrorMessage(error, 'login'));
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) return <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5"><p role="status" className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">Verificando sua sessão...</p></main>;

  return (
    <AuthShell title="Entrar na sua conta" description="Acesse o KidsLoc para organizar sua locadora e seus eventos.">
      <form noValidate onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium">E-mail
          <input id="login-email" className={fieldClass} type="email" autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'login-email-error' : undefined} value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com" />
          {fieldErrors.email && <FieldFeedback id="login-email-error">{fieldErrors.email}</FieldFeedback>}
        </label>
        <label className="block text-sm font-medium">Senha
          <input id="login-password" className={fieldClass} type="password" autoComplete="current-password" aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? 'login-password-error' : undefined} value={password} onChange={e => setPassword(e.target.value)} placeholder="Sua senha" />
          {fieldErrors.password && <FieldFeedback id="login-password-error">{fieldErrors.password}</FieldFeedback>}
        </label>
        {message && <FormFeedback>{message}</FormFeedback>}
        <button className={primaryButtonClass} disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
        <Link className="font-medium text-[#8054d8] hover:underline" href="/forgot-password/">Esqueci minha senha</Link>
        <Link className="font-medium text-[#8054d8] hover:underline" href="/signup/">Criar conta</Link>
      </div>
    </AuthShell>
  );
}
