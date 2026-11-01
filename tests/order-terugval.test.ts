import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as order } from "@/app/api/zipchat/order/route";
import { POST as verify } from "@/app/api/zipchat/verify/route";
import { store } from "@/db";

const SECRET = "test-geheim-van-minstens-16";
const LINK = "https://portaal.example/retour/abc";
const TRACK = "https://track.example/3S123";

type Bestelling = { number: string; zip: string; housenumber: string; status: string };
const BESTELLING: Bestelling = { number: "EX100200", zip: "1234 AB", housenumber: "12", status: "betaald" };

/**
 * Nep-halo.json met de eigenaardigheden uit de README. Net als de echte geeft
 * hij de portaallink op alleen het nummer: de test bewijst dus dat de bridge
 * hem niet opvraagt, niet dat de API hem weigert.
 */
let bestellingen: Bestelling[];
let leegAntwoord: string;
let calls: URL[];
let storing: boolean;

const nepFetch = vi.fn(async (input: string | URL | Request) => {
  const url = new URL(String(input));
  calls.push(url);
  const q = url.searchParams;
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  if (storing) return new Response("kapot", { status: 500 });
  if (url.pathname === "/robin") {
    return json({ details_view: [{ data: { "Levering 1": `<a href="${TRACK}">3S123</a>` } }] });
  }
  if (!q.get("conversationid")) return new Response("", { status: 200 });
  if (!q.has("email")) return json({});
  if (q.get("agent")) return json({ link: LINK, order: q.get("orderid") });
  if (q.get("email")) return json({ orders: bestellingen });
  const hit = bestellingen.some(
    (b) => b.number === q.get("ordernumber") && b.zip === q.get("zip") && b.housenumber === q.get("housenumber"),
  );
  return hit ? json({ orders: bestellingen }) : new Response(leegAntwoord, { status: 200 });
});

function post(handler: (r: Request) => Promise<Response>, body: unknown, secret: string | null = SECRET) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["X-Bridge-Secret"] = secret;
  return handler(new Request("https://bridge.test/api", { method: "POST", headers, body: JSON.stringify(body) }));
}

const zoek = (over: Record<string, unknown> = {}) =>
  post(order, { ordernumber: "EX100200", zip: "1234 AB", housenumber: "12", info: "retour", ...over }).then((r) => r.json());

const portaalAanroepen = () => calls.filter((u) => u.searchParams.has("agent"));
const trackingAanroepen = () => calls.filter((u) => u.pathname === "/robin");

beforeEach(async () => {
  for (const key of [...((store as unknown as { settings: Map<string, string> }).settings.keys())]) {
    await store.deleteSetting(key);
  }
  bestellingen = [BESTELLING];
  leegAntwoord = "";
  calls = [];
  storing = false;
  vi.stubGlobal("fetch", nepFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("terugvalroute: controle op de bridge", () => {
  it("weigert zonder het geheim, zonder iets op te vragen", async () => {
    const res = await post(order, { ordernumber: "EX100200", zip: "1234 AB", housenumber: "12", info: "retour" }, null);
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["verkeerde postcode", { zip: "9999 ZZ" }],
    ["verkeerd huisnummer", { housenumber: "13" }],
    ["verkeerd bestelnummer", { ordernumber: "EX999999" }],
  ])("%s levert geen link op", async (_naam, over) => {
    const body = await zoek(over);
    expect(body).toMatchObject({ ok: false, verified: false, reason: "geen bestelling" });
    expect(JSON.stringify(body)).not.toContain(LINK);
    expect(portaalAanroepen()).toHaveLength(0);
  });

  it("verkeerde combinatie levert ook geen tracking op", async () => {
    const body = await zoek({ zip: "9999 ZZ", info: "tracking" });
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain(TRACK);
    expect(trackingAanroepen()).toHaveLength(0);
  });

  it.each(["", "{}", '{"orders":[]}'])("telt %j als niets gevonden", async (leeg) => {
    leegAntwoord = leeg;
    const body = await zoek({ zip: "9999 ZZ" });
    expect(body).toMatchObject({ ok: false, reason: "geen bestelling" });
    expect(portaalAanroepen()).toHaveLength(0);
  });

  it("geeft niets als er alleen een andere bestelling terugkomt", async () => {
    nepFetch.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ orders: [{ number: "EX777777", status: "betaald" }] }), { status: 200 }),
    );
    const body = await zoek();
    expect(body).toMatchObject({ ok: false, reason: "geen bestelling" });
    expect(portaalAanroepen()).toHaveLength(0);
  });

  it("geeft niets als het antwoord een onbekende vorm heeft", async () => {
    nepFetch.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ error: "EX100200" }), { status: 200 }),
    );
    const body = await zoek();
    expect(body).toMatchObject({ ok: false, reason: "geen bestelling" });
    expect(portaalAanroepen()).toHaveLength(0);
  });

  it("vraagt om wat ontbreekt, zonder aanroep en zonder poging", async () => {
    const body = await zoek({ housenumber: "" });
    expect(body).toMatchObject({ ok: false, verified: false });
    expect(calls).toHaveLength(0);
    expect(await zoek({ info: undefined })).toMatchObject({ ok: false, verified: false });
    expect(calls).toHaveLength(0);
  });

  it("goede combinatie geeft de portaallink", async () => {
    const body = await zoek();
    expect(body).toMatchObject({ ok: true, verified: true, order_id: "EX100200" });
    expect(body.result.link).toBe(LINK);
    expect(portaalAanroepen()[0].searchParams.get("orderid")).toBe("EX100200");
    expect(portaalAanroepen()[0].searchParams.get("agent")).toBe("retour");
  });

  it("goede combinatie geeft tracking en de status", async () => {
    const body = await zoek({ info: "tracking" });
    expect(body).toMatchObject({ ok: true, verified: true, tracking_number: "3S123", tracking_url: TRACK });
    expect(body.order.status).toBe("betaald");
  });

  it("geeft alleen de gevraagde bestelling terug", async () => {
    const buur = { number: "EX555555", zip: "1234 AB", housenumber: "12", status: "afgerond" };
    bestellingen = [buur, BESTELLING];
    const body = await zoek({ info: "tracking" });
    expect(body.order.number).toBe("EX100200");
    expect(JSON.stringify(body)).not.toContain("EX555555");
  });

  it("stuurt de URL zoals halo.json hem wil", async () => {
    await zoek();
    const url = calls[0];
    expect(url.searchParams.has("email")).toBe(true);
    expect(url.searchParams.get("email")).toBe("");
    expect(url.searchParams.get("conversationid")).toBe("onbekend");
    expect(url.search).toContain("zip=1234%20AB");
  });

  it("geeft het gesprek-id door als het er is", async () => {
    await zoek({ conversation_id: "abc-1" });
    expect(calls[0].searchParams.get("conversationid")).toBe("abc-1");
  });
});

describe("terugvalroute: pogingenlimiet", () => {
  it("stopt na 5 fouten op een bestelnummer, ook bij de goede combinatie", async () => {
    for (let i = 0; i < 5; i++) {
      const body = await zoek({ housenumber: String(100 + i) });
      expect(body).toMatchObject({ ok: false, reason: "geen bestelling", attempts_left: 4 - i });
    }
    calls = [];
    const body = await zoek();
    expect(body).toMatchObject({ ok: false, verified: false, reason: "te vaak fout" });
    expect(JSON.stringify(body)).not.toContain(LINK);
    expect(calls).toHaveLength(0);
  });

  it("stopt na 5 fouten op een adres, ook met andere bestelnummers", async () => {
    for (let i = 0; i < 5; i++) await zoek({ ordernumber: `EX90000${i}` });
    calls = [];
    expect(await zoek()).toMatchObject({ reason: "te vaak fout" });
    expect(calls).toHaveLength(0);
  });

  it("schrijfwijze omzeilt de limiet niet", async () => {
    const vormen = ["9999 ZZ", "9999zz", "9999-ZZ", " 9999 zz ", "9999ZZ"];
    for (const zip of vormen) await zoek({ ordernumber: "EX300300", zip, housenumber: "1" });
    expect(await zoek({ ordernumber: "ex-300300", zip: "9999ZZ", housenumber: "1" })).toMatchObject({ reason: "te vaak fout" });
  });

  it("telt gelijktijdige gokken allemaal mee", async () => {
    const replies = await Promise.all(Array.from({ length: 12 }, (_, i) => zoek({ housenumber: String(200 + i) })));
    expect(calls.length).toBeLessThanOrEqual(5);
    expect(replies.filter((r) => r.reason === "te vaak fout").length).toBeGreaterThanOrEqual(7);
  });

  it("een goede combinatie zet de teller terug", async () => {
    for (let i = 0; i < 4; i++) await zoek({ housenumber: String(100 + i) });
    expect((await zoek()).ok).toBe(true);
    for (let i = 0; i < 4; i++) await zoek({ housenumber: String(100 + i) });
    expect((await zoek()).ok).toBe(true);
  });

  it("een klant die vaak terugkomt loopt niet tegen de limiet", async () => {
    for (let i = 0; i < 8; i++) expect((await zoek()).ok).toBe(true);
  });

  it("een storing bij de order-API telt niet als poging", async () => {
    storing = true;
    for (let i = 0; i < 8; i++) expect(await zoek()).toMatchObject({ ok: false, reason: "storing" });
    storing = false;
    expect((await zoek()).ok).toBe(true);
  });

  it("de limiet vervalt na 24 uur", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-01T12:00:00Z") });
    for (let i = 0; i < 5; i++) await zoek({ housenumber: String(100 + i) });
    expect(await zoek()).toMatchObject({ reason: "te vaak fout" });
    vi.setSystemTime(new Date("2026-11-02T12:00:01Z"));
    expect((await zoek()).ok).toBe(true);
  });
});

describe("e-mailroute: leeg gesprek-id", () => {
  const EMAIL = "klant@example.com";
  const CODE = "123456";

  beforeEach(async () => {
    const hash = createHmac("sha256", SECRET).update(`${EMAIL}:${CODE}`).digest("hex");
    await store.setSetting(`otp:${EMAIL}`, JSON.stringify({ hash, until: Date.now() + 60_000, attempts: 0 }));
  });

  it("geeft een klant met een goede code zijn bestellingen, ook zonder id", async () => {
    const res = await post(verify, { action: "check", email: EMAIL, code: CODE, conversation_id: "" });
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, verified: true });
    expect(body.orders.orders[0].number).toBe("EX100200");
    expect(calls[0].searchParams.get("conversationid")).toBe("onbekend");
  });

  it('ziet {"orders":[]} als geen bestellingen', async () => {
    bestellingen = [];
    const res = await post(verify, { action: "check", email: EMAIL, code: CODE });
    expect((await res.json()).orders).toEqual([]);
  });

  it("portaallink met e-mailcode werkt nog en blijft op eigen bestellingen", async () => {
    const mine = await post(order, { email: EMAIL, code: CODE, order_id: "EX100200", info: "retour" }).then((r) => r.json());
    expect(mine.result.link).toBe(LINK);
    const niet = await post(order, { email: EMAIL, code: CODE, order_id: "EX999999", info: "retour" }).then((r) => r.json());
    expect(niet.ok).toBe(false);
    expect(JSON.stringify(niet)).not.toContain(LINK);
  });
});
