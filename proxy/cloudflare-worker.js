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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "X-Riot-Token",
    ...extra,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env) });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: cors(env) });
    }

    const url = new URL(request.url);
    const [, host, ...rest] = url.pathname.split("/");
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
