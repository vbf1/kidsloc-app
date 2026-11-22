import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}
async function encryptToken(token: string, secret: string) {
  const rawKey = decodeBase64(secret);
  if (rawKey.length !== 32) throw new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY precisa conter 32 bytes em Base64.");
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));
  return { token_ciphertext: encodeBase64(new Uint8Array(ciphertext)), token_iv: encodeBase64(iv) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const anonKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appId = Deno.env.get("WHATSAPP_META_APP_ID");
    const appSecret = Deno.env.get("WHATSAPP_META_APP_SECRET");
    const encryptionKey = Deno.env.get("WHATSAPP_TOKEN_ENCRYPTION_KEY");
    if (!url || !anonKey || !serviceKey || !appId || !appSecret || !encryptionKey) {
      return reply({ error: "Integração ainda não configurada no servidor. Nenhum número foi alterado." }, 503);
    }

    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!bearer) return reply({ error: "Sessão não identificada. Entre novamente." }, 401);
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(bearer);
    if (authError || !authData.user) return reply({ error: "Sua sessão expirou. Entre novamente." }, 401);

    const body = await req.json();
    const companyId = String(body.company_id || "");
    const code = String(body.code || "");
    const wabaId = String(body.waba_id || "");
    const phoneNumberId = String(body.phone_number_id || "");
    const businessId = String(body.business_id || "");
    const event = String(body.event || "");
    if (!companyId || !code || !wabaId || !phoneNumberId || !businessId) {
      return reply({ error: "A Meta não retornou todos os dados necessários para concluir a conexão." }, 400);
    }
    if (event !== "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
      return reply({ error: "O fluxo concluído não confirmou a modalidade WhatsApp Business App (Coexistence). A conexão foi interrompida sem registrar o número." }, 409);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: membership, error: membershipError } = await admin.from("company_members")
      .select("role").eq("company_id", companyId).eq("user_id", authData.user.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (membership?.role !== "admin") return reply({ error: "Somente o administrador da empresa pode conectar o WhatsApp." }, 403);

    // Embedded Signup exchange codes expire quickly; exchange immediately on the server.
    const exchangeUrl = new URL("https://graph.facebook.com/v27.0/oauth/access_token");
    exchangeUrl.search = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      code,
    }).toString();
    const exchangeResponse = await fetch(exchangeUrl);
    const exchangeBody = await exchangeResponse.json();
    if (!exchangeResponse.ok || !exchangeBody.access_token) {
      console.error("WhatsApp token exchange failed:", exchangeBody.error?.code || exchangeResponse.status);
      return reply({ error: "A Meta não autorizou a conexão. Confira a configuração do aplicativo e tente novamente." }, 502);
    }

    const businessToken = String(exchangeBody.access_token);
    const subscribeResponse = await fetch(`https://graph.facebook.com/v27.0/${encodeURIComponent(wabaId)}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${businessToken}` },
    });
    const subscribeBody = await subscribeResponse.json();
    const phoneResponse = await fetch(
      `https://graph.facebook.com/v27.0/${encodeURIComponent(phoneNumberId)}?fields=is_on_biz_app,platform_type,display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${businessToken}` } },
    );
    const phoneBody = await phoneResponse.json();
    const coexistenceConfirmed = phoneResponse.ok && phoneBody.is_on_biz_app === true && phoneBody.platform_type === "CLOUD_API";
    const connected = subscribeResponse.ok && coexistenceConfirmed;
    const encrypted = await encryptToken(businessToken, encryptionKey);
    const expiresIn = Number(exchangeBody.expires_in || 0);
    const now = new Date().toISOString();
    const { error: connectionError } = await admin.from("whatsapp_connections").upsert({
      company_id: companyId,
      provider: "meta",
      status: connected ? "connected" : "needs_attention",
      business_id: businessId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      display_phone_number: phoneBody.display_phone_number || null,
      verified_name: phoneBody.verified_name || null,
      is_on_biz_app: coexistenceConfirmed,
      platform_type: phoneBody.platform_type || null,
      connected_at: connected ? now : null,
      last_error_code: !subscribeResponse.ok ? String(subscribeBody.error?.code || "WEBHOOK_SUBSCRIPTION_FAILED") : (!coexistenceConfirmed ? "COEXISTENCE_NOT_CONFIRMED" : null),
      last_error_message: !subscribeResponse.ok
        ? "Não foi possível ativar a assinatura de webhooks."
        : (!coexistenceConfirmed ? "A Meta ainda não confirmou que o número está ativo simultaneamente no WhatsApp Business App e na Cloud API." : null),
      updated_by: authData.user.id,
      updated_at: now,
    }, { onConflict: "company_id" });
    if (connectionError) throw connectionError;

    const { error: secretError } = await admin.from("whatsapp_connection_secrets").upsert({
      company_id: companyId,
      ...encrypted,
      token_expires_at: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      encryption_key_version: "v1",
      updated_at: now,
    }, { onConflict: "company_id" });
    if (secretError) throw secretError;

    if (!connected) {
      return reply({
        status: "needs_attention",
        message: "A autorização foi recebida, mas a Meta ainda não confirmou a conexão coexistente. O KidsLoc não registrou nem migrou o número.",
      }, 202);
    }
    return reply({
      status: "connected",
      display_phone_number: phoneBody.display_phone_number || null,
      verified_name: phoneBody.verified_name || null,
      is_on_biz_app: true,
      platform_type: "CLOUD_API",
    });
  } catch (error) {
    console.error("whatsapp-connect:", error);
    return reply({ error: "Não foi possível concluir a conexão com o WhatsApp. Tente novamente ou verifique a configuração da Meta." }, 500);
  }
});
