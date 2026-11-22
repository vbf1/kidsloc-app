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
async function contactFingerprint(phoneNumber: string): Promise<string> {
  const secret = Deno.env.get("WHATSAPP_CONTACT_HASH_KEY") || "";
  if (!secret) throw new Error("WHATSAPP_CONTACT_HASH_KEY is not configured.");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(phoneNumber))));
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
      for (const [changeIndex, change] of (Array.isArray(entry.changes) ? entry.changes : []).entries()) {
        const field = String(change.field || "unknown");
        const value = change.value || {};
        // account_update uses the partner business ID in entry.id and carries
        // the customer's Messaging account ID inside value.waba_info.waba_id.
        const wabaId = String(value.waba_info?.waba_id || entryId);
        const { data: connection } = await admin.from("whatsapp_connections")
          .select("company_id,status").eq("waba_id", wabaId).maybeSingle();
        const companyId = connection?.company_id || null;
        const eventType = field === "account_update" ? String(value.event || field) : field;
        // Build the idempotency key only from delivery metadata. Never hash the
        // webhook payload itself: it may contain message bodies, history or contact PII.
        const eventKey = await digest(JSON.stringify({
          wabaId,
          field,
          entryTime: entry.time || null,
          changeIndex,
          event: value.event || null,
          requestId: value.request_id || null,
          phoneNumberId: value.metadata?.phone_number_id || null,
        }));
        const historyErrors = Array.isArray(value.history)
          ? value.history.flatMap((item: Record<string, unknown>) =>
            Array.isArray(item.errors) ? item.errors.map((error: Record<string, unknown>) => Number(error.code)) : [])
          : [];
        const summary = {
          field,
          event: eventType,
          statuses_count: Array.isArray(value.statuses) ? value.statuses.length : 0,
          messages_count: Array.isArray(value.messages) ? value.messages.length : 0,
          contacts_count: Array.isArray(value.state_sync) ? value.state_sync.filter((item: Record<string, unknown>) => item.type === "contact").length : 0,
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
            const stateSync = Array.isArray(value.state_sync) ? value.state_sync : null;
            if (stateSync) {
              let failed = false;
              for (const item of stateSync as Record<string, unknown>[]) {
                if (item.type !== "contact") continue;
                const contact = item.contact && typeof item.contact === "object"
                  ? item.contact as Record<string, unknown>
                  : {};
                const phoneNumber = String(contact.phone_number || "").replace(/[^0-9]/g, "");
                const action = String(item.action || "").toLowerCase();
                if (!/^[0-9]{8,20}$/.test(phoneNumber) || (action !== "add" && action !== "remove")) {
                  failed = true;
                  continue;
                }
                const rawTimestamp = item.metadata && typeof item.metadata === "object"
                  ? (item.metadata as Record<string, unknown>).timestamp
                  : null;
                const timestampSeconds = Number(rawTimestamp);
                const changedAt = Number.isFinite(timestampSeconds) && timestampSeconds > 0
                  ? new Date(timestampSeconds * 1000).toISOString()
                  : new Date().toISOString();

                const { data: existing, error: lookupError } = await admin
                  .from("whatsapp_synced_contacts")
                  .select("last_change_at")
                  .eq("company_id", companyId)
                  .eq("contact_key", await contactFingerprint(phoneNumber))
                  .maybeSingle();
                if (lookupError) {
                  failed = true;
                  console.error("WhatsApp contact lookup failed:", lookupError.code || "DB_ERROR");
                  continue;
                }
                if (existing?.last_change_at && new Date(existing.last_change_at).getTime() > new Date(changedAt).getTime()) {
                  continue;
                }

                const fullName = typeof contact.full_name === "string"
                  ? contact.full_name.trim().slice(0, 160)
                  : typeof contact.first_name === "string"
                    ? contact.first_name.trim().slice(0, 160)
                    : null;
                const { error: saveError } = await admin.from("whatsapp_synced_contacts").upsert({
                  company_id: companyId,
                  contact_key: await contactFingerprint(phoneNumber),
                  phone_number: action === "remove" ? null : phoneNumber,
                  display_name: action === "remove" ? null : (fullName || null),
                  is_deleted: action === "remove",
                  last_change_at: changedAt,
                  synced_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }, { onConflict: "company_id,contact_key" });
                if (saveError) {
                  failed = true;
                  console.error("WhatsApp contact persistence failed:", saveError.code || "DB_ERROR");
                }
              }
              contactsSyncStatus = failed ? "failed" : "received";
            } else {
              contactsSyncStatus = "failed";
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
