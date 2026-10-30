// A contact form backend for a static site on Cloudflare Workers.
//
// Only POST /send runs this script (`run_worker_first` in wrangler.jsonc); every other request is a
// static file from ./public. The message is sent as an email through Cloudflare Email Routing and
// nothing is stored.
import { EmailMessage } from "cloudflare:email";

// Maximum length of each field, in characters.
const LIMITS = { name: 120, contact: 160, company: 200, topic: 80, message: 4000 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/send") return env.ASSETS.fetch(request);
    if (request.method !== "POST") return reply(405, "Method not allowed.");
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
      return reply(415, "Expected JSON.");
    }
    // Only from this site: a copy of the form on another domain can't post here.
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).hostname !== url.hostname) return reply(403, "Origin not allowed.");

    let data;
    try {
      data = await request.json();
    } catch {
      return reply(400, "Invalid JSON.");
    }

    const f = {};
    for (const [field, max] of Object.entries(LIMITS)) {
      f[field] = String(data[field] ?? "").trim().slice(0, max);
    }

    // Two cheap bot traps instead of a CAPTCHA: a hidden field people never fill in, and a form
    // submitted less than 3 seconds after the page opened. Bots get a fake "ok" so they don't retry.
    const openFor = Date.now() - Number(data.opened ?? 0);
    if (String(data.website ?? "") !== "" || !(openFor > 3000)) return reply(200, "ok");

    if (!f.name || !f.contact) return reply(422, "Please fill in your name and a phone or email.");
    if ((f.message.match(/https?:\/\//g) ?? []).length > 3) return reply(422, "Too many links in the message.");

    const text = [
      `Name: ${f.name}`,
      `Contact: ${f.contact}`,
      f.company ? `Company / website: ${f.company}` : null,
      `Topic: ${f.topic || "-"}`,
      "",
      f.message || "(no message)",
    ]
      .filter((line) => line !== null)
      .join("\n");

    // When the visitor leaves an email address, answering is just pressing Reply.
    const visitorEmail = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(f.contact) ? f.contact : null;
    const host = url.hostname;
    const mime = [
      `From: =?UTF-8?B?${b64(`Form on ${host}`)}?= <${env.SENDER}>`,
      `To: <${env.SHOWN_TO ?? env.RECIPIENT}>`,
      visitorEmail ? `Reply-To: <${visitorEmail}>` : null,
      `Subject: =?UTF-8?B?${b64(`New request: ${f.topic || "contact"} – ${f.name}`)}?=`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@${host}>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      b64(text).replace(/.{76}/g, "$&\r\n"),
    ]
      .filter((line) => line !== null)
      .join("\r\n");

    try {
      await env.EMAIL.send(new EmailMessage(env.SENDER, env.RECIPIENT, mime));
    } catch (e) {
      console.error("Sending failed:", e?.message ?? e);
      return reply(502, "Could not send the message.");
    }
    return reply(200, "ok");
  },
};

function reply(status, message) {
  return new Response(JSON.stringify({ ok: status === 200, message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// Base64 for UTF-8 text (btoa alone only handles Latin-1).
function b64(s) {
  let bin = "";
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
}
