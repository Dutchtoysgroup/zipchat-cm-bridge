import { config } from "./config";
import { requestJson } from "./http";
import type { MailResult } from "./notify";

/**
 * Een app-registratie in Entra. Er zijn er twee: die van het dataplatform
 * (MS_GRAPH_*, verstuurt uit marketing@) en die van de e-mailverificatie
 * (VERIFY_GRAPH_*, alleen uit noreply@exittoys.com).
 */
export type GraphAccount = {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  sender?: string;
  configured: boolean;
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** App-token via client credentials; een uur geldig, dus we bewaren hem per app. */
async function graphToken(account: GraphAccount): Promise<{ token?: string; error?: string }> {
  const { tenantId, clientId, clientSecret } = account;
  const cacheKey = `${tenantId}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 60_000) return { token: cached.token };

  const res = await requestJson<{ access_token?: string; expires_in?: number }>(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId ?? "")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId ?? "",
        client_secret: clientSecret ?? "",
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }).toString(),
    },
  );
  const token = res.data?.access_token;
  if (!res.ok || !token) return { error: `Graph-token geweigerd (${res.status || "geen verbinding"})` };

  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + Number(res.data?.expires_in ?? 3600) * 1000 });
  return { token };
}

/** Een afbeelding in de mail zelf, aangeroepen met <img src="cid:…">. */
export type InlineImage = { contentId: string; name: string; contentType: string; base64: string };

/**
 * Verstuurt een mail uit de mailbox van MS_GRAPH_SENDER (of `from`). Graph
 * antwoordt met een lege 202; alleen die telt als verstuurd. Met `html` gaat
 * de mail als HTML; `text` is dan niet nodig.
 */
export async function sendGraphMail(params: {
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  inlineImages?: InlineImage[];
  replyTo?: string | null;
  /** Andere mailbox dan MS_GRAPH_SENDER; de app moet daar in Exchange op mogen versturen. */
  from?: string;
  /** Andere app-registratie dan MS_GRAPH_*. */
  account?: GraphAccount;
  /** In Verzonden items van de afzender bewaren, zodat terug te vinden is wat de klant kreeg. */
  saveToSentItems?: boolean;
}): Promise<MailResult> {
  const account = params.account ?? config.graph;
  if (!account.configured) {
    return { ok: false, via: "graph", error: "Graph-app niet ingesteld — er is geen mail verstuurd" };
  }
  const { token, error } = await graphToken(account);
  if (!token) return { ok: false, via: "graph", error };

  const res = await requestJson(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(params.from ?? account.sender ?? "")}/sendMail`,
    {
      method: "POST",
      timeoutMs: 30_000,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: params.subject,
          body: params.html
            ? { contentType: "HTML", content: params.html }
            : { contentType: "Text", content: params.text ?? "" },
          toRecipients: params.to.map((address) => ({ emailAddress: { address } })),
          ...(params.replyTo ? { replyTo: [{ emailAddress: { address: params.replyTo } }] } : {}),
          ...(params.inlineImages?.length
            ? {
                attachments: params.inlineImages.map((img) => ({
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  name: img.name,
                  contentType: img.contentType,
                  contentBytes: img.base64,
                  contentId: img.contentId,
                  isInline: true,
                })),
              }
            : {}),
        },
        saveToSentItems: params.saveToSentItems ?? false,
      }),
    },
  );
  return { ok: res.ok, via: "graph", error: res.ok ? undefined : res.error };
}
