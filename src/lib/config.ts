/**
 * Alle configuratie op één plek. Niets hier is een secret in de code zelf —
 * alles komt uit env vars (Vercel: Project Settings > Environment Variables).
 */

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export const config = {
  /**
   * Mock per systeem, niet globaal: zodra één kant credentials heeft kun je
   * die helft al echt testen terwijl de andere nog simuleert.
   */
  get mockZipchat(): boolean {
    const f = opt("BRIDGE_MOCK_MODE");
    if (f === "true") return true;
    if (f === "false") return false;
    return !this.zipchat.token;
  },

  get mockCm(): boolean {
    const f = opt("BRIDGE_MOCK_MODE");
    if (f === "true") return true;
    if (f === "false") return false;
    return !this.cm.productToken;
  },

  /** Draait er nog iets in mock? Alleen voor de weergave in het dashboard. */
  get mockMode(): boolean {
    return this.mockZipchat || this.mockCm;
  },

  /** Beschermt /api/zipchat/escalate en /api/poll tegen willekeurige aanroepen. */
  bridgeSecret: opt("BRIDGE_SHARED_SECRET"),

  zipchat: {
    baseUrl: opt("ZIPCHAT_BASE_URL") ?? "https://app.zipchat.ai/api/integrations/backend_api/v1",
    token: opt("ZIPCHAT_API_TOKEN"),
    chatId: opt("ZIPCHAT_CHAT_ID"),
    /** Zipchat-gebruiker waaronder MSC-antwoorden in de widget verschijnen. */
    senderId: opt("ZIPCHAT_SENDER_ID"),
  },

  cm: {
    twowayBaseUrl: opt("CM_TWOWAY_BASE_URL") ?? "https://api.conversational.cm.com/conversational/twoway/v2",
    routerControlBaseUrl: opt("CM_ROUTER_CONTROL_BASE_URL") ?? "https://api.cm.com/router/control/v1",
    /** technicalLinkId in de TwoWay-URL. */
    accountId: opt("CM_ACCOUNT_ID"),
    /** LogicalAccountId voor routing control (vaak gelijk aan accountId). */
    logicalAccountId: opt("CM_LOGICAL_ACCOUNT_ID") ?? opt("CM_ACCOUNT_ID"),
    adapterId: opt("CM_ADAPTER_ID"),
    productToken: opt("CM_PRODUCT_TOKEN"),
    /** Kanaalnaam die CM in het chat-object verwacht. */
    channel: opt("CM_CHANNEL") ?? "CXWebConversations",
    /** stateNameId van de agent-state in de router (handover naar mens). */
    agentStateNameId: opt("CM_AGENT_STATE_NAME_ID"),
    /** stateNameId om terug te zetten naar de bot, indien gebruikt. */
    botStateNameId: opt("CM_BOT_STATE_NAME_ID"),
    /** Verifieert inkomende CM-webhooks (header X-Bridge-Token). */
    webhookSecret: opt("CM_WEBHOOK_SECRET"),
    /**
     * Alleen als dit expliciet aan staat melden we de klant dat er is
     * doorverbonden — en dan nog uitsluitend bij een bevestigde toewijzing.
     * Standaard uit: een voorbarige "je bent verbonden" bij een handover die
     * niemand oppakt is erger dan geen melding.
     */
    notifyCustomerOnHandover: opt("CM_HANDOVER_NOTIFY_CUSTOMER") === "true",
  },

  poll: {
    /** Hoe lang één cron-invocatie doorloopt (ms). Onder Vercel maxDuration blijven. */
    windowMs: Number(opt("POLL_WINDOW_MS") ?? 50_000),
    /** Interval binnen die window (ms). */
    intervalMs: Number(opt("POLL_INTERVAL_MS") ?? 5_000),
    /** Sessie automatisch sluiten na zoveel minuten stilte. */
    idleTimeoutMin: Number(opt("POLL_IDLE_TIMEOUT_MIN") ?? 60),
  },

  /** Notificatie per e-mail, los van de CM-routing. */
  mail: {
    /** Waar de escalaties heen gaan. */
    to: opt("ESCALATION_EMAIL_TO"),
    from: opt("ESCALATION_EMAIL_FROM"),
    /** Resend heeft de voorkeur: puur HTTP, geen verbinding om open te houden. */
    resendApiKey: opt("RESEND_API_KEY"),
    /** Alternatief: smtp://gebruiker:wachtwoord@host:587 */
    smtpUrl: opt("SMTP_URL"),
    get configured(): boolean {
      return !!this.to && (!!this.resendApiKey || !!this.smtpUrl);
    },
  },

  databaseUrl: opt("DATABASE_URL"),
} as const;

export type Channel = "webchat" | "email" | "sms" | "whatsapp";
export type SessionStatus = "escalating" | "active" | "closed" | "error";
