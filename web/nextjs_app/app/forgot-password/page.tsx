'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { AuthShell, fieldClass, primaryButtonClass } from '../../components/auth-shell';
import { supabase } from '../../lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!supabase) {
      setMessage('O acesso ainda não está configurado no ambiente.');
      return;
    }
    setBusy(true);
    const redirectTo = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/reset-password/`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setBusy(false);
    setMessage(error ? 'Não foi possível solicitar a recuperação. Confira o e-mail e tente novamente.' : 'Se o endereço estiver cadastrado, você receberá um link para redefinir sua senha.');
  }

  return (
    <AuthShell title="Recuperar senha" description="Informe o e-mail da sua conta para receber um link de redefinição.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium">E-mail
          <input className={fieldClass} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        {message && <p role="status" className="rounded-xl bg-purple-50 p-3 text-sm text-purple-800">{message}</p>}
        <button className={primaryButtonClass} disabled={busy}>{busy ? 'Enviando...' : 'Enviar link'}</button>
      </form>
      <p className="mt-5 text-center text-sm"><Link href="/login/" className="font-semibold text-[#8054d8]">Voltar ao login</Link></p>
    </AuthShell>
  );
}
