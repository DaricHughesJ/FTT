/**
 * Riot API CORS proxy — deploy as a free Cloudflare Worker.
 *
 * Riot's API doesn't send CORS headers, so a browser app can't call it
 * directly. This worker forwards requests and adds CORS.
 *
 * URL shape the app sends:
 *   https://<your-worker>.workers.dev/<routing>/<riot-api-path>
 *   e.g. /americas/tft/match/v1/matches/NA1_1234567890
 * which is forwarded to:
 *   https://americas.api.riotgames.com/tft/match/v1/matches/NA1_1234567890
 *
 * API key resolution (first match wins):
 *   1. RIOT_API_KEY secret on the worker  (recommended:
 *      `wrangler secret put RIOT_API_KEY`)
 *   2. X-Riot-Token header sent by the client (the app's settings field)
 *
 * Optional hardening: set ALLOWED_ORIGIN (e.g. your GitHub Pages URL) to
 * restrict who may call the worker.
 */

const ALLOWED_HOSTS = new Set([
  "americas", "europe", "asia", "sea",
  "na1", "br1", "la1", "la2", "euw1", "eun1", "tr1", "ru", "me1",
  "kr", "jp1", "oc1", "ph2", "sg2", "th2", "tw2", "vn2",
]);

function cors(env, extra = {}) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "X-Riot-Token, Content-Type",
    "Access-Control-Expose-Headers": "X-Shot-Ts",
    ...extra,
  };
}

// Screenshots live briefly — long enough to hand off from the Shortcut to
// the app, not long enough to accumulate.
const SHOT_TTL_SECONDS = 600;
const MAX_SHOT_BYTES = 8 * 1024 * 1024;

/**
 * Screenshot relay: an iOS Shortcut POSTs a screenshot here, the app GETs
 * it. Needs a KV namespace bound as SHOTS (see README).
 *
 *   POST /relay/<key>        body = image bytes
 *   GET  /relay/<key>?since=<ms>   -> image, or 204 when nothing newer
 */
async function handleRelay(request, env, key) {
  if (!key) {
    return new Response("Missing relay key: use /relay/<your-key>", { status: 400, headers: cors(env) });
  }
  if (!env.SHOTS) {
    return new Response(
      "No KV namespace bound. Create one and bind it as SHOTS (see SETUP.md).",
      { status: 501, headers: cors(env) });
  }
  const imgKey = `img:${key}`, tsKey = `ts:${key}`;

  if (request.method === "POST") {
    const body = await request.arrayBuffer();
    if (!body.byteLength) {
      return new Response("Empty body", { status: 400, headers: cors(env) });
    }
    if (body.byteLength > MAX_SHOT_BYTES) {
      return new Response("Screenshot too large — resize it in the Shortcut first.",
        { status: 413, headers: cors(env) });
    }
    const ts = String(Date.now());
    const type = request.headers.get("Content-Type") || "image/jpeg";
    await env.SHOTS.put(imgKey, body, { expirationTtl: SHOT_TTL_SECONDS, metadata: { ts, type } });
    await env.SHOTS.put(tsKey, ts, { expirationTtl: SHOT_TTL_SECONDS });
    return new Response(JSON.stringify({ ok: true, ts, bytes: body.byteLength }), {
      status: 200, headers: cors(env, { "Content-Type": "application/json" }),
    });
  }

  const ts = await env.SHOTS.get(tsKey);
  if (!ts) return new Response(null, { status: 204, headers: cors(env) });
  const since = url_since(request);
  if (since && Number(ts) <= since) {
    return new Response(null, { status: 204, headers: cors(env) });
  }
  const { value, metadata } = await env.SHOTS.getWithMetadata(imgKey, { type: "arrayBuffer" });
  if (!value) return new Response(null, { status: 204, headers: cors(env) });
  return new Response(value, {
    status: 200,
    headers: cors(env, { "Content-Type": metadata?.type || "image/jpeg", "X-Shot-Ts": ts }),
  });
}

function url_since(request) {
  const raw = new URL(request.url).searchParams.get("since");
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }

    const url = new URL(request.url);
    const [, host, ...rest] = url.pathname.split("/");

    if (host === "relay") {
      if (request.method !== "GET" && request.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: cors(env) });
      }
      return handleRelay(request, env, rest.join("/"));
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: cors(env) });
    }
    if (!ALLOWED_HOSTS.has(host) || rest.length === 0) {
      return new Response("Bad path: expected /<region>/<riot-api-path>", {
        status: 400, headers: cors(env),
      });
    }

    const key = env.RIOT_API_KEY || request.headers.get("X-Riot-Token");
    if (!key) {
      return new Response("No API key: set RIOT_API_KEY on the worker or send X-Riot-Token", {
        status: 401, headers: cors(env),
      });
    }

    const target = `https://${host}.api.riotgames.com/${rest.join("/")}${url.search}`;
    const riotRes = await fetch(target, { headers: { "X-Riot-Token": key } });
    return new Response(riotRes.body, {
      status: riotRes.status,
      headers: cors(env, { "Content-Type": riotRes.headers.get("Content-Type") || "application/json" }),
    });
  },
};
