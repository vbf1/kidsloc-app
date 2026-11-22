'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/app-shell';
import { supabase } from '../../../lib/supabase';

type Connection = {
  status: 'connected' | 'disconnected' | 'needs_attention';
  display_phone_number: string | null;
  verified_name: string | null;
  is_on_biz_app: boolean;
  platform_type: string | null;
  connected_at: string | null;
  last_error_message: string | null;
};
type SignupSession = {
  type: 'WA_EMBEDDED_SIGNUP';
  event: string;
  data?: {
    waba_id?: string;
    phone_number_id?: string;
    business_id?: string;
    current_step?: string;
    error_message?: string;
  };
};
type FacebookLoginResponse = { authResponse?: { code?: string } };

declare global {
  interface Window {
    FB?: {
      init: (options: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
      login: (callback: (response: FacebookLoginResponse) => void, options: {
        config_id: string;
        response_type: 'code';
        override_default_response_type: boolean;
        extras: { setup: Record<string, never>; featureType: string; sessionInfoVersion: string };
      }) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const metaAppId = process.env.NEXT_PUBLIC_META_APP_ID ?? '';
const metaConfigId = process.env.NEXT_PUBLIC_META_CONFIG_ID ?? '';

export default function WhatsAppPage() {
  const router = useRouter();
  const pendingSignup = useRef<{ code: string; session: SignupSession | null; processing: boolean }>({
    code: '', session: null, processing: false,
  });
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('Empresa');
  const [email, setEmail] = useState('');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadConnection = useCallback(async (cid: string) => {
    if (!supabase) return;
    const { data, error: queryError } = await supabase.from('whatsapp_connections')
      .select('status,display_phone_number,verified_name,is_on_biz_app,platform_type,connected_at,last_error_message')
      .eq('company_id', cid).maybeSingle();
    if (queryError) throw queryError;
    setConnection(data as Connection | null);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!supabase) {
        setError('O acesso ao banco de dados não está configurado.');
        setLoading(false);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login/');
        return;
      }
      const { data: member, error: memberError } = await supabase.from('company_members')
        .select('company_id,role').eq('user_id', user.id).limit(1).maybeSingle();
      if (!active) return;
      if (memberError || !member) {
        setError('Não foi possível identificar a empresa vinculada à sua conta.');
        setLoading(false);
        return;
      }
      if (member.role !== 'admin') {
        setError('A configuração do WhatsApp está disponível apenas para o administrador da empresa.');
        setLoading(false);
        return;
      }
      const { data: company } = await supabase.from('companies').select('name')
        .eq('id', member.company_id).maybeSingle();
      if (!active) return;
      setCompanyId(member.company_id);
      setCompanyName(company?.name ?? 'Empresa');
      setEmail(user.email ?? '');
      try {
        await loadConnection(member.company_id);
      } catch {
        setError('Não foi possível consultar o estado da integração.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [router, loadConnection]);

  const finishSignup = useCallback(async () => {
    const pending = pendingSignup.current;
    if (!pending.code || !pending.session || pending.processing || !companyId || !supabase) return;
    pending.processing = true;
    setConnecting(true);
    setError('');
    setNotice('');
    try {
      const session = pending.session;
      if (session.event !== 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
        throw new Error('A Meta não confirmou o fluxo de coexistência. Nenhuma migração do número foi solicitada.');
      }
      const { data, error: invokeError } = await supabase.functions.invoke('whatsapp-connect', {
        body: {
          company_id: companyId,
          code: pending.code,
          event: session.event,
          waba_id: session.data?.waba_id,
          phone_number_id: session.data?.phone_number_id,
          business_id: session.data?.business_id,
        },
      });
      if (invokeError) throw invokeError;
      if (data?.status === 'needs_attention') {
        setNotice(data.message || 'A Meta recebeu a autorização, mas a conexão ainda precisa de uma verificação.');
      } else {
        setNotice('WhatsApp conectado. O número permanece no WhatsApp Business do celular.');
      }
      await loadConnection(companyId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a conexão.');
    } finally {
      pendingSignup.current = { code: '', session: null, processing: false };
      setConnecting(false);
    }
  }, [companyId, loadConnection]);

  useEffect(() => {
    if (!metaAppId || !metaConfigId) return;
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: metaAppId, autoLogAppEvents: true, xfbml: true, version: 'v27.0' });
    };
    if (window.FB) window.fbAsyncInit();
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://www.facebook.com' && !event.origin.endsWith('.facebook.com')) return;
      if (typeof event.data !== 'string') return;
      try {
        const data = JSON.parse(event.data) as SignupSession;
        if (data.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (data.event === 'CANCEL') {
          setNotice('A conexão foi cancelada antes da conclusão. Seu WhatsApp Business continua funcionando normalmente.');
          return;
        }
        if (data.event === 'ERROR') {
          setError(data.data?.error_message || 'A Meta informou um erro no processo de conexão.');
          return;
        }
        pendingSignup.current.session = data;
        void finishSignup();
      } catch {
        // Ignore unrelated messages from the Facebook SDK.
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      delete window.fbAsyncInit;
    };
  }, [finishSignup]);

  function connectWhatsApp() {
    setError('');
    setNotice('');
    if (!metaAppId || !metaConfigId) {
      setError('A configuração do aplicativo Meta ainda não foi concluída. O botão será liberado depois que o App ID e o Configuration ID forem cadastrados.');
      return;
    }
    if (!window.FB) {
      setError('O serviço de login da Meta ainda está carregando. Aguarde alguns segundos e tente novamente.');
      return;
    }
    pendingSignup.current = { code: '', session: null, processing: false };
    window.FB.login((response) => {
      const code = response.authResponse?.code;
      if (!code) {
        setNotice('O login da Meta não foi concluído. Você pode tentar novamente quando quiser.');
        return;
      }
      pendingSignup.current.code = code;
      void finishSignup();
    }, {
      config_id: metaConfigId,
      response_type: 'code',
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: 'whatsapp_business_app_onboarding',
        sessionInfoVersion: '3',
      },
    });
  }

  if (loading) return <main className="grid min-h-screen place-items-center">Carregando configuração do WhatsApp...</main>;

  return (
    <AppShell companyName={companyName} email={email} role="admin" companyId={companyId}
      basePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''} signingOut={false}
      onSignOut={async () => { if (supabase) { await supabase.auth.signOut(); router.push('/login/'); } }}>
      {metaAppId && metaConfigId && <Script src="https://connect.facebook.net/en_US/sdk.js" strategy="afterInteractive" />}
      <section className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-widest text-[#8054d8]">Integrações</p>
        <h1 className="mt-2 text-3xl font-bold">WhatsApp Business</h1>
        <p className="mt-2 text-sm text-gray-500">Conecte o WhatsApp da {companyName} ao KidsLoc usando a integração oficial da Meta.</p>

        <article className="mt-6 rounded-2xl border border-purple-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Conexão da conta</h2>
              <p className="mt-1 text-sm text-gray-500">WhatsApp Business App + Cloud API (Coexistence)</p>
            </div>
            <span className={connection?.status === 'connected'
              ? 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700'
              : 'rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700'}>
              {connection?.status === 'connected' ? 'Conectado' : connection?.status === 'needs_attention' ? 'Atenção necessária' : 'Não conectado'}
            </span>
          </div>

          {connection?.display_phone_number && (
            <div className="mt-5 rounded-xl bg-gray-50 p-4">
              <p className="text-xs text-gray-500">Número conectado</p>
              <p className="mt-1 text-lg font-bold">{connection.display_phone_number}</p>
              {connection.verified_name && <p className="mt-1 text-sm text-gray-500">{connection.verified_name}</p>}
              <p className="mt-2 text-xs text-gray-500">
                {connection.is_on_biz_app && connection.platform_type === 'CLOUD_API'
                  ? 'A Meta confirmou o uso simultâneo no aplicativo e na API.'
                  : 'A Meta ainda não confirmou o uso simultâneo no aplicativo e na API.'}
              </p>
            </div>
          )}

          {connection?.last_error_message && connection.status !== 'connected' && (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{connection.last_error_message}</p>
          )}

          <div className="mt-5 space-y-3 text-sm leading-6 text-gray-600">
            <p>• Você continuará usando o mesmo número no WhatsApp Business do celular.</p>
            <p>• O KidsLoc usará a API oficial da Meta para automações autorizadas.</p>
            <p>• A conexão não solicita o registro tradicional que substituiria o aplicativo móvel.</p>
          </div>

          {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {notice && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}

          <button type="button" onClick={connectWhatsApp} disabled={connecting || connection?.status === 'connected'}
            className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#8054d8] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#6840bd] disabled:cursor-not-allowed disabled:opacity-60">
            {connecting ? 'Conectando...' : connection?.status === 'connected' ? 'WhatsApp conectado' : 'Conectar WhatsApp Business'}
          </button>
          {!metaAppId || !metaConfigId ? (
            <p className="mt-3 text-xs leading-5 text-amber-700">
              O botão depende da configuração do aplicativo Meta. O App ID e o Configuration ID ainda não foram definidos no ambiente do KidsLoc.
            </p>
          ) : null}
        </article>

        <article className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 className="font-bold">Antes de liberar as automações</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-gray-600">
            <li>A Meta precisa aprovar o KidsLoc como Tech Provider e liberar as permissões avançadas.</li>
            <li>Os modelos de mensagem precisam ser aprovados pela Meta.</li>
            <li>Os clientes precisam autorizar o recebimento de mensagens da empresa.</li>
            <li>Mensagens enviadas pela Cloud API podem gerar cobrança da Meta.</li>
          </ul>
          <p className="mt-4 text-xs leading-5 text-gray-400">
            Nenhuma mensagem automática é enviada nesta etapa. As automações só serão ativadas depois da conexão, da aprovação dos modelos e da configuração do consentimento dos clientes.
          </p>
        </article>
      </section>
    </AppShell>
  );
}
