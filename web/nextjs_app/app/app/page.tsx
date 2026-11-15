'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { getWorkspaceCompanyName } from '../../lib/workspace';
import { supabase } from '../../lib/supabase';

type Workspace = {
  email: string;
  companyName: string;
};

export default function AppHomePage() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const loadWorkspace = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);

    // Wait for the asynchronous request before updating the loading feedback.
    await Promise.resolve();
    setMessage('');

    try {
      if (!supabase) {
        setMessage('O acesso ainda não está configurado. Tente novamente mais tarde.');
        return;
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) {
        setMessage('Não foi possível validar sua sessão agora. Confira sua conexão e tente novamente.');
        return;
      }
      if (!user) {
        router.replace('/login/');
        return;
      }

      const { data: isPlatformOwner, error: ownerError } = await supabase.rpc('is_platform_owner_for_company');
      if (ownerError) {
        setMessage('Não foi possível confirmar as permissões da conta. Tente novamente.');
        return;
      }
      if (isPlatformOwner === true) {
        router.replace('/app/admin/');
        return;
      }

      const { data, error } = await supabase
        .from('company_members')
        .select('companies(name)')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        setMessage('Não foi possível carregar os dados da empresa. Tente novamente.');
        return;
      }

      if (!data) {
        router.replace('/app/company/');
        return;
      }

      const companyName = getWorkspaceCompanyName(data.companies);
      if (!companyName) {
        setMessage('Não foi possível identificar a empresa vinculada à sua conta.');
        return;
      }

      setWorkspace({
        email: user.email ?? 'E-mail não informado',
        companyName,
      });
    } catch {
      setMessage('Ocorreu um erro ao carregar sua área de trabalho. Confira sua conexão.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // This effect starts an asynchronous Supabase read; state updates happen after it yields.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkspace(false);
  }, [loadWorkspace]);

  async function signOut() {
    if (!supabase || signingOut) return;

    setSigningOut(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setMessage('Não foi possível encerrar sua sessão. Tente novamente.');
        return;
      }
      router.push('/login/');
    } catch {
      setMessage('Não foi possível encerrar sua sessão. Tente novamente.');
    } finally {
      setSigningOut(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5">
        <p role="status" className="rounded-2xl border border-purple-100 bg-white px-6 py-5 text-sm font-medium text-gray-600 shadow-sm">
          Carregando sua área de trabalho...
        </p>
      </main>
    );
  }

  if (!workspace) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8f7fc] px-5">
        <section className="w-full max-w-md rounded-2xl border border-purple-100 bg-white p-6 shadow-sm">
          <div className="mb-4 grid size-11 place-items-center rounded-2xl bg-[#8054d8] text-xl font-black text-white">K</div>
          <h1 className="text-xl font-bold">Não foi possível abrir o KidsLoc</h1>
          <p role="alert" className="mt-3 text-sm leading-6 text-gray-600">
            {message || 'Não foi possível carregar os dados da sua conta.'}
          </p>
          <button
            type="button"
            onClick={() => void loadWorkspace()}
            className="mt-5 rounded-xl bg-[#8054d8] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#6e43c4]"
          >
            Tentar novamente
          </button>
        </section>
      </main>
    );
  }

  return (
    <AppShell
      companyName={workspace.companyName}
      email={workspace.email}
      basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''}
      signingOut={signingOut}
      onSignOut={signOut}
    >
      <section aria-labelledby="workspace-title">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8054d8]">Área da empresa</p>
          <h1 id="workspace-title" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Visão geral
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Bem-vindo ao espaço de gestão da {workspace.companyName}.
          </p>
        </div>

        <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Sua empresa</p>
              <h2 className="mt-1 text-xl font-bold">{workspace.companyName}</h2>
              <p className="mt-2 break-all text-sm text-gray-500">{workspace.email}</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
              <span aria-hidden="true" className="size-2 rounded-full bg-green-500" />
              Acesso ativo
            </span>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-dashed border-purple-200 bg-white/70 p-6 sm:p-8">
          <div className="grid size-12 place-items-center rounded-2xl bg-purple-50 text-2xl" aria-hidden="true">
            ✨
          </div>
          <h2 className="mt-4 text-lg font-bold">Sua área de trabalho está pronta</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            A estrutura inicial da sua empresa está configurada. Os recursos de gestão serão disponibilizados gradualmente, após a implementação e validação de cada módulo.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
