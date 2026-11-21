'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Props = { companyId: string; basePath: string };
type NoticeState = 'checking' | 'needed' | 'subscribed' | 'blocked' | 'unsupported';

function decodeVapidKey(value: string): Uint8Array {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function WebPushControl({ companyId, basePath }: Props) {
  const [noticeState, setNoticeState] = useState<NoticeState>('checking');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) ||
      !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNoticeState('unsupported');
      return;
    }
    let active = true;
    void navigator.serviceWorker.getRegistration(`${basePath}/`).then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      if (!active) return;
      if (subscription) setNoticeState('subscribed');
      else if (Notification.permission === 'denied') setNoticeState('blocked');
      else setNoticeState('needed');
    }).catch(() => {
      if (active) setNoticeState(Notification.permission === 'denied' ? 'blocked' : 'needed');
    });
    return () => { active = false; };
  }, [basePath]);

  async function enable() {
    if (!supabase || busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (!window.isSecureContext) throw new Error('As notificações exigem uma conexão segura HTTPS.');
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNoticeState(permission === 'denied' ? 'blocked' : 'needed');
        throw new Error('Permissão de notificação não concedida no navegador.');
      }

      const registration = await navigator.serviceWorker.register(`${basePath}/sw.js`, {
        scope: `${basePath}/`,
      });
      await navigator.serviceWorker.ready;
      const { data: keyData, error: keyError } = await supabase.functions.invoke('send-employee-push', {
        body: { action: 'public_key', company_id: companyId },
      });
      if (keyError) throw keyError;
      if (!keyData?.publicKey) throw new Error('Não foi possível obter a chave de notificações.');

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(keyData.publicKey) as BufferSource,
        });
      }
      const { error: saveError } = await supabase.functions.invoke('send-employee-push', {
        body: { action: 'subscribe', company_id: companyId, subscription: subscription.toJSON() },
      });
      if (saveError) throw saveError;
      setNoticeState('subscribed');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível ativar as notificações.');
    } finally {
      setBusy(false);
    }
  }

  if (noticeState === 'checking' || noticeState === 'subscribed' || noticeState === 'unsupported') return null;

  return (
    <section aria-label="Ativar notificações" className="mb-5 flex flex-col gap-3 rounded-2xl border border-purple-200 bg-purple-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-semibold text-[#58339d]">Ative as notificações do KidsLoc</p>
        <p className="mt-1 text-sm leading-5 text-purple-900/80">
          {noticeState === 'blocked'
            ? 'As notificações estão bloqueadas no navegador. Para recebê-las, permita notificações nas configurações do site.'
            : 'Receba avisos importantes sobre eventos e atividades da sua empresa, mesmo quando não estiver com o aplicativo aberto.'}
        </p>
        {message && <p role="status" className="mt-2 text-xs text-red-700">{message}</p>}
      </div>
      {noticeState === 'needed' && (
        <button type="button" onClick={() => void enable()} disabled={busy}
          className="shrink-0 rounded-xl bg-[#7046c4] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5e37aa] disabled:cursor-wait disabled:opacity-60">
          {busy ? 'Ativando...' : 'Ativar notificações'}
        </button>
      )}
    </section>
  );
}
