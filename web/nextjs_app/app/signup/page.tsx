'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { AuthShell, fieldClass, primaryButtonClass } from '../../components/auth-shell';
import { supabase } from '../../lib/supabase';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!supabase) {
      setMessage('O acesso ainda não está configurado. Informe a URL e a chave pública do Supabase no ambiente de implantação.');
      return;
    }
    setBusy(true);
    const redirectTo = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/company/`;
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: redirectTo },
    });
    setBusy(false);
    if (error) {
      setMessage('Não foi possível criar a conta. Verifique o e-mail e tente novamente.');
      return;
    }
    if (data.session) {
      window.location.assign(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/company/`);
      return;
    }
    setSuccess(true);
    setMessage('Enviamos um link de confirmação para seu e-mail. Confirme o endereço antes de entrar.');
  }

  return (
    <AuthShell title="Criar sua conta" description="Comece cadastrando o responsável pela locadora. Os dados da empresa serão configurados em seguida.">
      {success ? <div className="rounded-xl bg-green-50 p-4 text-sm leading-6 text-green-800">{message}<p className="mt-3"><Link href="/login/" className="font-semibold underline">Ir para o login</Link></p></div> : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium">Seu nome
            <input className={fieldClass} required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">E-mail
            <input className={fieldClass} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">Senha
            <input className={fieldClass} type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
            <span className="mt-1 block text-xs text-gray-500">Use pelo menos 8 caracteres.</span>
          </label>
          {message && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}
          <button className={primaryButtonClass} disabled={busy}>{busy ? 'Criando conta...' : 'Criar conta'}</button>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-gray-500">Já tem uma conta? <Link className="font-semibold text-[#8054d8]" href="/login/">Entrar</Link></p>
    </AuthShell>
  );
}
