'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AppHomePage() {
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('Carregando sua área de trabalho...');
  const [signingOut, setSigningOut] = useState(false);

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

        if (authError) {
          setMessage('Não foi possível validar sua sessão. Tente novamente.');
          return;
        }

        if (!user) {
          window.location.replace(
            `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login/`,
          );
          return;
        }

        const { data, error } = await supabase
          .from('company_members')
          .select('companies(name)')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (!active) return;

        if (error) {
          setMessage(
            'Não foi possível carregar os dados da empresa. Tente novamente.',
          );
          return;
        }

        if (!data) {
          window.location.replace(
            `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/company/`,
          );
          return;
        }

        const companyValue = data.companies as unknown as
          | { name: string }
          | null;
        setEmail(user.email ?? '');
        setCompany(companyValue?.name ?? 'Empresa vinculada');
        setMessage('');
      } catch {
        if (active) {
          setMessage(
            'Ocorreu um erro ao carregar sua área de trabalho. Confira sua conexão.',
          );
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    if (!supabase) return;

    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setMessage('Não foi possível encerrar sua sessão. Tente novamente.');
        return;
      }
      window.location.assign(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/login/`,
      );
    } catch {
      setMessage('Não foi possível encerrar sua sessão. Tente novamente.');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 md:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#8054d8] text-xl font-black text-white">
              K
            </span>
            <span className="text-xl font-bold">
              KidsLoc <span className="text-[#8054d8]">App</span>
            </span>
          </div>
          <button
            onClick={signOut}
            disabled={signingOut}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {signingOut ? 'Saindo...' : 'Sair'}
          </button>
        </header>

        <section className="mt-12">
          <p className="text-sm font-semibold text-[#8054d8]">
            ÁREA DA EMPRESA
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            {company || 'Bem-vindo ao KidsLoc'}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{email}</p>

          {message ? (
            <div
              role="status"
              className="mt-6 max-w-2xl rounded-xl bg-purple-50 p-4 text-sm text-purple-800"
            >
              {message}
              <button
                onClick={() => window.location.reload()}
                className="ml-2 font-semibold underline"
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            <div className="mt-8 max-w-2xl rounded-2xl border border-purple-100 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-green-700">
                ACESSO ATIVO
              </p>
              <h2 className="mt-2 text-xl font-bold">
                Cadastro da empresa concluído
              </h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Sua conta está autenticada e vinculada à empresa acima. A
                configuração inicial do KidsLoc foi concluída.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
