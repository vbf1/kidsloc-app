'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Props = { companyId: string; basePath: string };

function decodeVapidKey(value: string): Uint8Array {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function WebPushControl({ companyId, basePath }: Props) {
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) ||
      !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    let active = true;
    void navigator.serviceWorker.getRegistration(`${basePath}/`).then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      if (active) setSubscribed(Boolean(subscription));
    }).catch(() => {
      if (active) setSubscribed(false);
    });
    return () => { active = false; };
  }, [basePath]);

  async function enable() {
    if (!supabase || busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Este navegador não oferece suporte a notificações push.');
      }
      if (!window.isSecureContext) throw new Error('As notificações exigem uma conexão segura HTTPS.');
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Permissão de notificação não concedida no navegador.');

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
      setSubscribed(true);
      setMessage('Notificações ativadas neste navegador.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível ativar as notificações.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!supabase || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const registration = await navigator.serviceWorker.getRegistration(`${basePath}/`);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const { error } = await supabase.functions.invoke('send-employee-push', {
          body: { action: 'unsubscribe', company_id: companyId, endpoint: subscription.endpoint },
        });
        if (error) throw error;
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage('Notificações desativadas neste navegador.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível desativar as notificações.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <button type="button" onClick={() => void (subscribed ? disable() : enable())} disabled={busy}
        aria-pressed={subscribed}
        className="rounded-xl border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-[#7046c4] transition hover:bg-purple-50 disabled:cursor-wait disabled:opacity-60 sm:px-4 sm:text-sm">
        {busy ? 'Aguarde...' : subscribed ? 'Notificações ativadas' : 'Ativar notificações'}
      </button>
      {message && <p role="status" className="max-w-[220px] text-right text-[11px] leading-4 text-gray-500">{message}</p>}
    </div>
  );
}
