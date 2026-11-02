import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { escalate, handleAgentReply, pollOnce, setMode } from "@/lib/bridge";
import { config } from "@/lib/config";
import { store } from "@/db";

// De config leest deze bij het importeren; zonder token draait alles in mock.
vi.hoisted(() => {
  process.env.ZIPCHAT_API_TOKEN = "test-token";
  process.env.CM_PRODUCT_TOKEN = "test-token";
  process.env.ZIPCHAT_SENDER_ID = "31118";
  process.env.CM_ACCOUNT_ID = "acc";
  process.env.CM_ADAPTER_ID = "eigen-adapter";
  process.env.CM_FOLLOWUP_ADAPTER_ID = "web-adapter";
  process.env.CM_RESET_WAIT_MS = "0";
});

/** Nep-Zipchat: onthoudt wie het gesprek heeft en weigert een bericht als de AI het heeft. */
let assignee: number | null;
let assignmentFails: boolean;
let sent: string[];
let routerBerichten: string[][];
let cmUrls: string[];
let berichten: Array<{ id: number; role: string; message: string; created_at: string }>;

const nepFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  if (url.hostname === "api.conversational.cm.com") {
    cmUrls.push(url.pathname);
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (body.conversationMessages) routerBerichten.push(body.conversationMessages.map((m: { text: string }) => m.text));
    return json({ chat: { id: body.chat?.id ?? "cm-chat" } }, 201);
  }
  if (url.pathname.endsWith("/assignment")) {
    if (assignmentFails) return new Response("kapot", { status: 500 });
    assignee = JSON.parse(String(init?.body)).assignee_id;
    return json({});
  }
  if (url.pathname.endsWith("/escalation")) return json({});
  if (url.pathname.endsWith("/messages")) {
    if (assignee === null) return json({ error: "AI heeft dit gesprek" }, 422);
    sent.push(JSON.parse(String(init?.body)).message);
    return json({});
  }
  return json({ conversation: { id: "100", messages: berichten } });
});

async function stilleLiveSessie(conversationId: string) {
  const session = await store.createSession({
    zipchatChatId: "22036",
    zipchatConversationId: conversationId,
    cmChatId: `cm-${conversationId}`,
    cmConversationClientId: `zipchat:${conversationId}`,
    customerName: "Testklant",
    customerEmail: "klant@voorbeeld.nl",
    channel: "webchat",
    mode: "livechat",
    status: "active",
  });
  const stil = new Date(Date.now() - (config.poll.idleTimeoutMin + 1) * 60_000);
  (session as { updatedAt: Date }).updatedAt = stil;
  return session;
}

beforeEach(() => {
  vi.stubGlobal("fetch", nepFetch);
  assignee = 31118;
  assignmentFails = false;
  sent = [];
  routerBerichten = [];
  cmUrls = [];
  berichten = [];
});

afterEach(async () => {
  for (const s of await store.listOpenSessions()) await store.updateSession(s.id, { status: "closed" });
  vi.unstubAllGlobals();
});

describe("live chat na stilte", () => {
  it("geeft het gesprek terug aan de AI als de sessie automatisch sluit", async () => {
    const session = await stilleLiveSessie("100");

    await pollOnce();

    expect(assignee).toBeNull();
    expect((await store.getSessionById(session.id))?.status).toBe("closed");
  });

  it("houdt de sessie open als teruggeven aan de AI mislukt", async () => {
    const session = await stilleLiveSessie("101");
    assignmentFails = true;

    await pollOnce();

    expect(assignee).toBe(31118);
    expect((await store.getSessionById(session.id))?.status).toBe("active");
  });

  it("zet de pauze terug als een medewerker later alsnog antwoordt", async () => {
    const session = await stilleLiveSessie("102");
    await pollOnce();
    expect(assignee).toBeNull();

    const res = await handleAgentReply({
      chat: {
        id: "cm-102",
        accountId: "acc",
        channel: "CXWebConversations",
        conversationClientId: "zipchat:102",
        conversationHostId: "host",
      },
      conversationMessages: [
        { $type: "text", direction: "ClientTerminated", createdOn: new Date().toISOString(), text: "<div>Hoi</div>" },
      ],
    });

    expect(res.delivered).toBe(1);
    expect(sent).toEqual(["Hoi"]);
    expect(assignee).toBe(31118);
    expect((await store.getSessionById(session.id))?.status).toBe("active");
  });
});

describe("tweede doorzetting in hetzelfde gesprek", () => {
  const bericht = (id: number, role: string, message: string) => ({
    id,
    role,
    message,
    created_at: new Date(Date.now() - 60_000 + id).toISOString(),
  });

  it("hergebruikt de gesloten sessie en stuurt alleen wat nieuw is", async () => {
    await setMode("livechat");
    const klant = { conversationId: "200", chatId: "22036", name: "Test Klant", email: "jan@voorbeeld.nl" };
    berichten = [bericht(1, "user", "eerste vraag"), bericht(2, "assistant", "eerste antwoord")];
    const eerste = await escalate(klant);
    await store.updateSession(eerste.sessionId!, { status: "closed" });

    routerBerichten = [];
    cmUrls = [];
    berichten.push(bericht(3, "user", "tweede vraag"));
    const tweede = await escalate(klant);

    const volgorde = cmUrls.map((u) => u.split("/").pop());
    expect(volgorde.slice(0, 3)).toEqual(["reset", "eigen-adapter", "mutationrequests"]);

    expect(tweede.ok).toBe(true);
    expect(eerste.sessionId).toBeDefined();
    expect(tweede.sessionId).toBe(eerste.sessionId);
    const verstuurd = routerBerichten.flat();
    expect(verstuurd).toContain("tweede vraag");
    expect(verstuurd).not.toContain("eerste vraag");
    expect(verstuurd).not.toContain("eerste antwoord");
  });
});

describe("vervolgbericht in een live chat", () => {
  it("gaat via de vervolg-adapter, de doorzetting zelf via de eigen adapter", async () => {
    await setMode("livechat");
    berichten = [
      { id: 1, role: "user", message: "eerste vraag", created_at: new Date(Date.now() - 5_000).toISOString() },
    ];
    await escalate({ conversationId: "300", chatId: "22036", name: "Test Klant", email: "jan@voorbeeld.nl" });
    expect(cmUrls.some((u) => u.endsWith("/adapters/eigen-adapter"))).toBe(true);

    cmUrls = [];
    berichten.push({ id: 2, role: "user", message: "nog een vraag", created_at: new Date().toISOString() });
    await pollOnce();

    expect(cmUrls).toEqual(["/conversational/twoway/v2/accounts/acc/adapters/web-adapter"]);
    expect(routerBerichten.flat()).toContain("nog een vraag");
  });
});
