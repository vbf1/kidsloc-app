'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { AuthShell, fieldClass, primaryButtonClass } from '../../components/auth-shell';
import { getPasswordUpdateErrorMessage } from '../../lib/auth-error-message';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    if (!supabase) {
      setMessage('O acesso ainda não está configurado no ambiente.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage(getPasswordUpdateErrorMessage(error));
        return;
      }

      setDone(true);
      setMessage('Senha atualizada com sucesso. Entre novamente com sua nova senha.');
    } catch (error) {
      setMessage(getPasswordUpdateErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Definir nova senha" description="Escolha uma senha nova para sua conta KidsLoc.">
      {done ? <div className="space-y-4"><p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{message}</p><Link href="/login/" className="block text-center font-semibold text-[#8054d8]">Ir para o login</Link></div> : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium">Nova senha
            <input className={fieldClass} type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          {message && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}
          <button className={primaryButtonClass} disabled={busy}>{busy ? 'Salvando...' : 'Salvar nova senha'}</button>
        </form>
      )}
    </AuthShell>
  );
}
