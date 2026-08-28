import { NextResponse } from "next/server";
import { escalate, handleAgentReply, pollOnce, closeSession } from "@/lib/bridge";
import { store } from "@/db";
import { config } from "@/lib/config";
import * as zipchat from "@/lib/zipchat";
import * as cm from "@/lib/cm";

export const dynamic = "force-dynamic";

type TestBody = {
  action: string;
  sessionId?: number;
  conversationId?: string;
  text?: string;
  name?: string;
  email?: string;
};

/** Alle knoppen van het testpaneel komen hier binnen. */
export async function POST(req: Request) {
  let body: TestBody;
  try {
    body = (await req.json()) as TestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Ongeldige JSON" }, { status: 400 });
  }

  switch (body.action) {
    /* -------- Verbindingen -------- */
    case "ping": {
      const [zc, cmRes] = await Promise.all([zipchat.ping(), cm.ping()]);
      await store.logEvent({
        direction: "internal",
        kind: "test.ping",
        ok: zc.ok && cmRes.ok,
        summary: `Zipchat: ${zc.ok ? "OK" : zc.error} | CM: ${cmRes.ok ? "OK" : cmRes.error}`,
      });
      return NextResponse.json({
        ok: true,
        mockMode: config.mockMode,
        zipchat: { ok: zc.ok, status: zc.status, error: zc.error, mocked: zc.mocked },
        cm: { ok: cmRes.ok, status: cmRes.status, error: cmRes.error, mocked: cmRes.mocked },
      });
    }

    /* -------- Inkomende chat simuleren -------- */
    case "incoming_chat": {
      const conversationId = body.conversationId?.trim() || `test-${Date.now()}`;
      const result = await escalate({
        conversationId,
        name: body.name || "Testklant",
        email: body.email || "test@example.com",
        reason: "Testescalatie vanuit het dashboard",
        channel: "webchat",
      });
      return NextResponse.json({ ...result, conversationId });
    }

    /* -------- Inkomende e-mail simuleren -------- */
    case "incoming_email": {
      const conversationId = body.conversationId?.trim() || `test-mail-${Date.now()}`;
      const result = await escalate({
        conversationId,
        name: body.name || "Testklant e-mail",
        email: body.email || "test@example.com",
        reason: "Testescalatie via e-mailkanaal",
        channel: "email",
      });
      return NextResponse.json({ ...result, conversationId });
    }

    /* -------- Agent antwoordt vanuit MSC -------- */
    case "agent_reply": {
      if (!body.sessionId) return NextResponse.json({ ok: false, error: "Kies eerst een sessie." }, { status: 400 });
      const session = await store.getSessionById(body.sessionId);
      if (!session) return NextResponse.json({ ok: false, error: "Sessie niet gevonden." }, { status: 404 });

      const payload: cm.TwoWayPayload = {
        chat: cm.buildChat({
          conversationClientId: session.cmConversationClientId ?? `zipchat:${session.zipchatConversationId}`,
          clientName: session.customerName,
          chatId: session.cmChatId ?? undefined,
        }),
        conversationMessages: [
          cm.textMessage(body.text?.trim() || "Hallo, je spreekt met de klantenservice. Waarmee kan ik je helpen?", "ClientTerminated"),
        ],
      };
      const result = await handleAgentReply(payload);
      return NextResponse.json(result);
    }

    /* -------- Klant antwoordt in de widget -------- */
    case "poll": {
      const result = await pollOnce();
      await store.logEvent({
        direction: "internal",
        kind: "test.poll",
        summary: `Poll: ${result.checked} sessie(s), ${result.forwarded} doorgestuurd, ${result.closed} gesloten`,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    /* -------- Sessie sluiten -------- */
    case "close": {
      if (!body.sessionId) return NextResponse.json({ ok: false, error: "Kies eerst een sessie." }, { status: 400 });
      const result = await closeSession(body.sessionId, true);
      return NextResponse.json(result);
    }

    /* -------- Testdata wissen -------- */
    case "reset": {
      await store.reset();
      return NextResponse.json({ ok: true, message: "Testdata gewist." });
    }

    default:
      return NextResponse.json({ ok: false, error: `Onbekende actie: ${body.action}` }, { status: 400 });
  }
}
