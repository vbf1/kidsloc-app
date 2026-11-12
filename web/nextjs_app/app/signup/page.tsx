'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { AuthShell, fieldClass, primaryButtonClass } from '../../components/auth-shell';
import { FieldFeedback, FormFeedback } from '../../components/form-feedback';
import { getAuthErrorMessage } from '../../lib/auth-error-message';
import { validateEmail, validateName, validatePassword } from '../../lib/form-validation';
import { supabase } from '../../lib/supabase';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const errors = {
      name: validateName(name),
      email: validateEmail(email),
      password: validatePassword(password),
    };
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
      const redirectTo = \`\${window.location.origin}\${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/company/\`;
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: redirectTo },
      });
      if (error) {
        setMessage(getAuthErrorMessage(error, 'signup'));
        return;
      }
      if (data.session) {
        window.location.assign(\`\${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/company/\`);
        return;
      }
      setSuccess(true);
      setMessage('Enviamos um link de confirmação para seu e-mail. Confirme o endereço antes de entrar.');
    } catch (error) {
      setMessage(getAuthErrorMessage(error, 'signup'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Criar sua conta" description="Comece cadastrando o responsável pela locadora. Os dados da empresa serão configurados em seguida.">
      {success ? <FormFeedback variant="success">{message}<p className="mt-3"><Link href="/login/" className="font-semibold underline">Ir para o login</Link></p></FormFeedback> : (
        <form noValidate onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium">Seu nome
            <input id="signup-name" className={fieldClass} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? 'signup-name-error' : undefined} autoComplete="name" maxLength={100} value={name} onChange={e => setName(e.target.value)} />
            {fieldErrors.name && <FieldFeedback id="signup-name-error">{fieldErrors.name}</FieldFeedback>}
          </label>
          <label className="block text-sm font-medium">E-mail
            <input id="signup-email" className={fieldClass} type="email" autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined} value={email} onChange={e => setEmail(e.target.value)} />
            {fieldErrors.email && <FieldFeedback id="signup-email-error">{fieldErrors.email}</FieldFeedback>}
          </label>
          <label className="block text-sm font-medium">Senha
            <input id="signup-password" className={fieldClass} type="password" autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? 'signup-password-error' : undefined} value={password} onChange={e => setPassword(e.target.value)} />
            {fieldErrors.password && <FieldFeedback id="signup-password-error">{fieldErrors.password}</FieldFeedback>}
            <span className="mt-1 block text-xs text-gray-500">Use pelo menos 8 caracteres.</span>
          </label>
          {message && <FormFeedback>{message}</FormFeedback>}
          <button className={primaryButtonClass} disabled={busy}>{busy ? 'Criando conta...' : 'Criar conta'}</button>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-gray-500">Já tem uma conta? <Link className="font-semibold text-[#8054d8]" href="/login/">Entrar</Link></p>
    </AuthShell>
  );
}
