// Rafiki – msaidizi wa AI wa Kiswahili
// A small web server with no dependencies: it serves the chat page and
// forwards messages to the Claude API, streaming the answer back.
// Run with:  node server.js   (Node 18 or newer)

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- Settings (from environment variables or a .env file) ----------
loadDotEnv(path.join(__dirname, ".env"));

const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const API_URL = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "") + "/v1/messages";
const MODEL = process.env.MODEL || "claude-haiku-4-5-20251001";
const PORT = Number(process.env.PORT) || 3000;
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 20;            // messages per person per day
const GLOBAL_DAILY_LIMIT = Number(process.env.GLOBAL_DAILY_LIMIT) || 1000; // messages for the whole site per day
const MAX_TOKENS = Number(process.env.MAX_TOKENS) || 1500;            // longest answer allowed
const TIME_ZONE = process.env.TIME_ZONE || "Africa/Dar_es_Salaam";

const SYSTEM_PROMPT = `Wewe ni "Rafiki", msaidizi wa akili bandia (AI) anayezungumza Kiswahili.

Maelekezo:
- Jibu kila mara kwa Kiswahili sanifu, safi na cha kawaida (kama kinavyotumika Tanzania na Kenya), hata kama mtumiaji ameandika kwa Kiingereza au Sheng — isipokuwa akiomba waziwazi lugha nyingine au tafsiri.
- Kuwa mchangamfu, mwenye heshima, na msaada wa kweli. Toa majibu kamili lakini yasiyorefuka bila sababu.
- Neno la kitaalamu lisilo na tafsiri inayojulikana sana, liandike kwa Kiswahili kisha weka la Kiingereza kwenye mabano.
- Tumia mifano inayoeleweka Afrika Mashariki (shilingi, M-Pesa, daladala, n.k.) inapofaa.
- Ukiwa huna uhakika na jambo, sema hivyo kwa uwazi. Usibuni ukweli.
- Kwa masuala ya afya, sheria au fedha, toa taarifa za jumla na ushauri wa kumwona mtaalamu.
- Unaweza kutumia **herufi nzito** na orodha (- au 1.) kupanga majibu. Usitumie majedwali.`;

if (!API_KEY) {
  console.warn("\n⚠  ANTHROPIC_API_KEY haijawekwa. The chat will not answer until you set it (see README).\n");
}

// ---------- Daily limits (kept in memory; they reset when the day changes or the server restarts) ----------
const usage = new Map();
let usageDay = today();
let globalCount = 0;

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}
function rollDay() {
  const d = today();
  if (d !== usageDay) { usageDay = d; usage.clear(); globalCount = 0; }
}
function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}
function remainingFor(ip) {
  rollDay();
  return Math.max(0, DAILY_LIMIT - (usage.get(ip) || 0));
}

// ---------- Input checks ----------
const MAX_TURNS = 20;           // only the last 20 turns are sent to Claude
const MAX_MESSAGE_CHARS = 4000; // longest single message
const MAX_TOTAL_CHARS = 24000;  // longest conversation sent

function cleanMessages(raw) {
  if (!Array.isArray(raw)) return null;
  let msgs = raw
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map(m => ({ role: m.role, content: m.content.trim().slice(0, MAX_MESSAGE_CHARS) }))
    .filter(m => m.content);

  // merge back-to-back turns from the same side
  const merged = [];
  for (const m of msgs) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content;
    else merged.push({ ...m });
  }
  msgs = merged.slice(-MAX_TURNS);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  while (msgs.length && JSON.stringify(msgs).length > MAX_TOTAL_CHARS) msgs.splice(0, 2);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

// ---------- Chat endpoint ----------
async function handleChat(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req, 200_000)); }
  catch { return sendJson(res, 400, { error: "Ombi si sahihi." }); }

  const messages = cleanMessages(body.messages);
  if (!messages) return sendJson(res, 400, { error: "Ujumbe hauko sahihi. Andika swali lako tena." });

  if (!API_KEY) return sendJson(res, 503, { error: "Rafiki bado hajawekwa tayari (API key haipo)." });

  const ip = clientIp(req);
  rollDay();
  if (globalCount >= GLOBAL_DAILY_LIMIT) {
    return sendJson(res, 429, { error: "Rafiki amepokea maswali mengi sana leo. Tafadhali rudi kesho." });
  }
  if (remainingFor(ip) <= 0) {
    return sendJson(res, 429, { error: `Umefikia kikomo cha ujumbe ${DAILY_LIMIT} kwa leo. Rudi kesho!` });
  }

  const upstream = new AbortController();
  res.on("close", () => upstream.abort());

  let apiRes;
  try {
    apiRes = await fetch(API_URL, {
      method: "POST",
      signal: upstream.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
        stream: true,
      }),
    });
  } catch (e) {
    if (upstream.signal.aborted) return;
    console.error("Network error:", e.message);
    return sendJson(res, 502, { error: "Imeshindikana kumfikia Rafiki. Jaribu tena baada ya muda mfupi." });
  }

  if (!apiRes.ok) {
    const detail = await apiRes.text().catch(() => "");
    console.error(`Claude API error ${apiRes.status}: ${detail.slice(0, 500)}`);
    const msg = apiRes.status === 429 || apiRes.status === 529
      ? "Rafiki ana shughuli nyingi sasa hivi. Jaribu tena baada ya dakika moja."
      : "Kuna tatizo upande wa seva. Jaribu tena baadaye.";
    return sendJson(res, 502, { error: msg });
  }

  // Count the message only once Claude has accepted it.
  usage.set(ip, (usage.get(ip) || 0) + 1);
  globalCount++;

  res.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-accel-buffering": "no",
    "x-remaining": String(remainingFor(ip)),
  });

  // Read the server-sent events and pass only the answer text on to the browser.
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for await (const chunk of apiRes.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        let evt;
        try { evt = JSON.parse(line.slice(5)); } catch { continue; }
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
          res.write(evt.delta.text);
        } else if (evt.type === "message_delta" && evt.delta?.stop_reason === "max_tokens") {
          res.write("\n\n[[KIMEKATIKA]]");
        } else if (evt.type === "error") {
          console.error("Stream error:", JSON.stringify(evt.error));
          res.write("\n\n[[HITILAFU]]");
        }
      }
    }
  } catch (e) {
    if (!upstream.signal.aborted) {
      console.error("Stream interrupted:", e.message);
      res.write("\n\n[[HITILAFU]]");
    }
  }
  res.end();
}

// ---------- Static files ----------
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};
const PUBLIC = path.join(__dirname, "public");

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(PUBLIC, urlPath));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("Haipatikani"); }
    const name = path.basename(file);
    const headers = { "content-type": MIME[path.extname(file)] || "application/octet-stream" };
    // The page, the service worker and the manifest must always be fresh so phones get updates.
    if (name === "sw.js" || name === "index.html" || name === "manifest.webmanifest") {
      headers["cache-control"] = "no-cache";
      if (name === "sw.js") headers["service-worker-allowed"] = "/";
    } else {
      headers["cache-control"] = "public, max-age=604800";
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/chat") return await handleChat(req, res);
    if (req.method === "GET" && req.url === "/api/limit") {
      return sendJson(res, 200, { remaining: remainingFor(clientIp(req)), limit: DAILY_LIMIT });
    }
    if (req.method === "GET" && req.url === "/healthz") return sendJson(res, 200, { ok: true });
    if (req.method === "GET") return serveStatic(req, res);
    res.writeHead(405); res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { error: "Hitilafu ya ndani." });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Rafiki yuko hewani: http://localhost:${PORT}  (model: ${MODEL}, limit: ${DAILY_LIMIT}/day per person)`);
});

// ---------- Helpers ----------
function sendJson(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const parts = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("too large")); req.destroy(); } else parts.push(c); });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", reject);
  });
}
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
