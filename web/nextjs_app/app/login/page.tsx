'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { AuthShell, fieldClass, primaryButtonClass } from '../../components/auth-shell';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!supabase) {
      setMessage('O acesso ainda não está configurado. Informe a URL e a chave pública do Supabase no ambiente de implantação.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setMessage(error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : 'Não foi possível entrar. Confira seus dados e tente novamente.');
      return;
    }
    window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/company/`);
  }

  return (
    <AuthShell title="Entrar na sua conta" description="Acesse o KidsLoc para organizar sua locadora e seus eventos.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium">E-mail
          <input className={fieldClass} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com" />
        </label>
        <label className="block text-sm font-medium">Senha
          <input className={fieldClass} type="password" autoComplete="current-password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Sua senha" />
        </label>
        {message && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <button className={primaryButtonClass} disabled={busy}>{busy ? 'Entrando...' : 'Entrar'}</button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
        <Link className="font-medium text-[#8054d8] hover:underline" href="/forgot-password/">Esqueci minha senha</Link>
        <Link className="font-medium text-[#8054d8] hover:underline" href="/signup/">Criar conta</Link>
      </div>
    </AuthShell>
  );
}
