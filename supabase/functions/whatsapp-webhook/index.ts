import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});
const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}
async function validSignature(rawBody: Uint8Array, signature: string, appSecret: string): Promise<boolean> {
  if (!signature.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(appSecret), {
    name: "HMAC",
    hash: "SHA-256",
  }, false, ["sign"]);
  const bodyBuffer = rawBody.buffer.slice(rawBody.byteOffset, rawBody.byteOffset + rawBody.byteLength) as ArrayBuffer;
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, bodyBuffer));
  return constantTimeEqual(signature.slice(7), toHex(digest));
}
async function digest(value: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

Deno.serve(async (req) => {
  const verifyToken = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN") || "";
  const appSecret = Deno.env.get("WHATSAPP_META_APP_SECRET") || "";

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!appSecret) return json({ error: "Webhook not configured" }, 503);

  try {
    const rawBody = new Uint8Array(await req.arrayBuffer());
    const signature = req.headers.get("X-Hub-Signature-256") || "";
    if (!await validSignature(rawBody, signature, appSecret)) {
      return json({ error: "Invalid signature" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Server configuration missing" }, 503);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const payload = JSON.parse(new TextDecoder().decode(rawBody));
    if (payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) {
      return json({ received: true });
    }

    for (const entry of payload.entry) {
      const entryId = String(entry.id || "");
      for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
        const field = String(change.field || "unknown");
        const value = change.value || {};
        // account_update uses the partner business ID in entry.id and carries
        // the customer's Messaging account ID inside value.waba_info.waba_id.
        const wabaId = String(value.waba_info?.waba_id || entryId);
        const { data: connection } = await admin.from("whatsapp_connections")
          .select("company_id,status").eq("waba_id", wabaId).maybeSingle();
        const companyId = connection?.company_id || null;
        const eventType = field === "account_update" ? String(value.event || field) : field;
        const eventKey = await digest(JSON.stringify({ wabaId, entryTime: entry.time || null, change }));
        const historyErrors = Array.isArray(value.history)
          ? value.history.flatMap((item: Record<string, unknown>) =>
            Array.isArray(item.errors) ? item.errors.map((error: Record<string, unknown>) => Number(error.code)) : [])
          : [];
        const summary = {
          field,
          event: eventType,
          statuses_count: Array.isArray(value.statuses) ? value.statuses.length : 0,
          messages_count: Array.isArray(value.messages) ? value.messages.length : 0,
          contacts_count: Array.isArray(value.contacts) ? value.contacts.length : 0,
          history_batches_count: Array.isArray(value.history) ? value.history.length : 0,
          history_error_codes: historyErrors,
        };
        await admin.from("whatsapp_webhook_events").upsert({
          company_id: companyId,
          waba_id: wabaId || null,
          event_key: eventKey,
          event_type: eventType,
          payload_summary: summary,
          processed_at: new Date().toISOString(),
        }, { onConflict: "event_key", ignoreDuplicates: true });

        if (companyId) {
          let contactsSyncStatus: "received" | "failed" | undefined;
          if (field === "smb_app_state_sync") {
            const contacts = Array.isArray(value.contacts) ? value.contacts : [];
            const rows = contacts.flatMap((contact: Record<string, unknown>) => {
              const waId = String(contact.wa_id || "").replace(/[^0-9]/g, "");
              if (!/^[0-9]{8,20}$/.test(waId)) return [];
              const profile = contact.profile && typeof contact.profile === "object"
                ? contact.profile as Record<string, unknown>
                : {};
              const displayName = typeof profile.name === "string"
                ? profile.name.trim().slice(0, 160)
                : null;
              return [{
                company_id: companyId,
                wa_id: waId,
                display_name: displayName || null,
                synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }];
            });
            if (rows.length > 0) {
              const { error: contactsError } = await admin.from("whatsapp_synced_contacts")
                .upsert(rows, { onConflict: "company_id,wa_id" });
              if (contactsError) {
                console.error("WhatsApp contacts persistence failed:", contactsError.code || "DB_ERROR");
                contactsSyncStatus = "failed";
              } else {
                contactsSyncStatus = "received";
              }
            } else {
              // A valid empty contacts array is a completed sync; missing data is not.
              contactsSyncStatus = Array.isArray(value.contacts) ? "received" : "failed";
            }
          }

          await admin.from("whatsapp_connections").update({
            last_webhook_at: new Date().toISOString(),
            ...(field === "account_update" && ["PARTNER_REMOVED", "ACCOUNT_OFFBOARDED"].includes(eventType)
              ? { status: "disconnected", is_on_biz_app: false }
              : {}),
            ...(contactsSyncStatus ? { contacts_sync_status: contactsSyncStatus } : {}),
            ...(field === "history" && historyErrors.includes(2593109)
              ? { history_sync_status: "declined" }
              : {}),
            ...(field === "history" && historyErrors.length === 0
              ? { history_sync_status: "unexpected_data_ignored" }
              : {}),
          }).eq("company_id", companyId);

          if (field === "messages" && Array.isArray(value.statuses)) {
            for (const item of value.statuses) {
              const status = String(item.status || "");
              if (!["sent", "delivered", "read", "failed"].includes(status) || !item.id) continue;
              const at = item.timestamp
                ? new Date(Number(item.timestamp) * 1000).toISOString()
                : new Date().toISOString();
              const patch: Record<string, unknown> = { status };
              if (status === "sent") patch.sent_at = at;
              if (status === "delivered") patch.delivered_at = at;
              if (status === "read") patch.read_at = at;
              if (status === "failed") {
                patch.failed_at = at;
                patch.error_code = String(item.errors?.[0]?.code || "");
                patch.error_message = String(item.errors?.[0]?.title || "Falha no envio");
              }
              await admin.from("whatsapp_message_outbox").update(patch)
                .eq("company_id", companyId).eq("meta_message_id", String(item.id));
              await admin.from("whatsapp_message_logs").update(patch)
                .eq("company_id", companyId).eq("meta_message_id", String(item.id));
            }
          }
        }
      }
    }
    return json({ received: true });
  } catch (error) {
    console.error("whatsapp-webhook:", error);
    return json({ error: "Webhook processing failed" }, 500);
  }
});
