import { config } from "./config";
import { requestJson } from "./http";
import type { MailResult } from "./notify";

let tokenCache: { token: string; expiresAt: number } | undefined;

/** App-token via client credentials; een uur geldig, dus we bewaren hem. */
async function graphToken(): Promise<{ token?: string; error?: string }> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return { token: tokenCache.token };

  const { tenantId, clientId, clientSecret } = config.graph;
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

  tokenCache = { token, expiresAt: Date.now() + Number(res.data?.expires_in ?? 3600) * 1000 };
  return { token };
}

/**
 * Verstuurt een platte-tekstmail uit de mailbox van MS_GRAPH_SENDER. Graph
 * antwoordt met een lege 202; alleen die telt als verstuurd.
 */
export async function sendGraphMail(params: {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string | null;
}): Promise<MailResult> {
  if (!config.graph.configured) {
    return { ok: false, via: "graph", error: "MS_GRAPH_* niet ingesteld — er is geen mail verstuurd" };
  }
  const { token, error } = await graphToken();
  if (!token) return { ok: false, via: "graph", error };

  const res = await requestJson(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.graph.sender ?? "")}/sendMail`,
    {
      method: "POST",
      timeoutMs: 30_000,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: params.subject,
          body: { contentType: "Text", content: params.text },
          toRecipients: params.to.map((address) => ({ emailAddress: { address } })),
          ...(params.replyTo ? { replyTo: [{ emailAddress: { address: params.replyTo } }] } : {}),
        },
        saveToSentItems: false,
      }),
    },
  );
  return { ok: res.ok, via: "graph", error: res.ok ? undefined : res.error };
}
