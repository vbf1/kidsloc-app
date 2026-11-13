import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function HomePage() {
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        if (supabase) {
          const { data, error } = await supabase.auth.getSession();
          if (active && !error && data.session?.user) {
            window.location.replace(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/app/`);
            return;
          }
        }
      } catch {
        // A temporary connection issue must not be treated as a signed-out session.
      }
      if (active) setCheckingSession(false);
    }
    void checkSession();
    return () => { active = false; };
  }, []);

  if (checkingSession) {
    return <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5"><p role="status" className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">Verificando sua sessão...</p></main>;
  }

  return (
    <main className="min-h-screen px-5 py-10 md:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-[#8054d8] text-xl font-black text-white">
              K
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight">
                KidsLoc <span className="text-[#8054d8]">App</span>
              </p>
              <p className="text-xs text-gray-500">
                Gestão inteligente para locadoras
              </p>
            </div>
          </div>
          <Link
            href="/login/"
            className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white hover:bg-[#6d43c2]"
          >
            Entrar
          </Link>
        </header>

        <section className="mt-16 grid gap-10 md:grid-cols-[1.2fr_.8fr] md:items-center">
          <div>
            <span className="rounded-full bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-800">
              Bem-vindo ao KidsLoc
            </span>
            <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-tight md:text-6xl">
              Sua locadora organizada.{' '}
              <span className="text-[#8054d8]">Um passo de cada vez.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-gray-600">
              Comece criando sua conta e vinculando sua empresa. A plataforma
              está sendo construída e validada por etapas para proteger seus
              dados e garantir as regras de cada operação.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup/"
                className="rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-semibold text-white hover:bg-[#6d43c2]"
              >
                Criar minha conta
              </Link>
              <Link
                href="/login/"
                className="rounded-xl border border-purple-200 bg-white px-5 py-3 text-sm font-semibold text-[#8054d8]"
              >
                Já tenho conta
              </Link>
            </div>
            <p className="mt-8 text-sm text-gray-500">
              Fundação do produto · Ambiente de desenvolvimento
            </p>
          </div>

          <div className="rounded-3xl border border-purple-100 bg-white p-6 shadow-sm">
            <p className="font-semibold">Configuração inicial</p>
            <ol className="mt-6 space-y-5">
              <li className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-purple-100 text-sm font-bold text-purple-800">
                  1
                </span>
                <div>
                  <p className="font-semibold">Criar sua conta</p>
                  <p className="mt-1 text-sm leading-5 text-gray-500">
                    Cadastro com e-mail e confirmação de acesso.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-purple-100 text-sm font-bold text-purple-800">
                  2
                </span>
                <div>
                  <p className="font-semibold">Vincular sua empresa</p>
                  <p className="mt-1 text-sm leading-5 text-gray-500">
                    Uma empresa inicial vinculada à sua conta.
                  </p>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-purple-100 text-sm font-bold text-purple-800">
                  3
                </span>
                <div>
                  <p className="font-semibold">Acessar com segurança</p>
                  <p className="mt-1 text-sm leading-5 text-gray-500">
                    Acesso protegido pelas permissões do banco de dados.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>
      </div>
    </main>
  );
}
