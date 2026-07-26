// Exercises the deployed Worker code against a mock KV namespace.
import worker from "../proxy/cloudflare-worker.js";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

function mockKV() {
  const store = new Map();
  return {
    store,
    async put(key, value, opts = {}) { store.set(key, { value, metadata: opts.metadata }); },
    async get(key) { const e = store.get(key); return e ? e.value : null; },
    async getWithMetadata(key) {
      const e = store.get(key);
      return e ? { value: e.value, metadata: e.metadata } : { value: null, metadata: null };
    },
  };
}

const call = (url, init, env) => worker.fetch(new Request(url, init), env);
const BASE = "https://w.example.dev";
const IMG = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);

console.log("\n— CORS preflight —");
{
  const res = await call(`${BASE}/relay/abc`, { method: "OPTIONS" }, { SHOTS: mockKV() });
  check("preflight returns 204", res.status === 204, `got ${res.status}`);
  check("POST is allowed", /POST/.test(res.headers.get("Access-Control-Allow-Methods") || ""));
  check("X-Shot-Ts is exposed to the page",
    /X-Shot-Ts/.test(res.headers.get("Access-Control-Expose-Headers") || ""));
}

console.log("\n— Relay upload and fetch —");
{
  const env = { SHOTS: mockKV() };
  const post = await call(`${BASE}/relay/mykey`, {
    method: "POST", body: IMG, headers: { "Content-Type": "image/png" },
  }, env);
  const body = await post.json();
  check("POST accepted", post.status === 200 && body.ok === true, JSON.stringify(body));
  check("POST reports byte count", body.bytes === IMG.length, `got ${body.bytes}`);
  const ts = Number(body.ts);
  check("POST returns a timestamp", Number.isFinite(ts) && ts > 0);

  const get = await call(`${BASE}/relay/mykey`, {}, env);
  check("GET returns the image", get.status === 200, `got ${get.status}`);
  check("GET preserves content type", get.headers.get("Content-Type") === "image/png");
  check("GET echoes the timestamp", Number(get.headers.get("X-Shot-Ts")) === ts);
  const bytes = new Uint8Array(await get.arrayBuffer());
  check("bytes round-trip intact", bytes.length === IMG.length && bytes[0] === 137);

  const stale = await call(`${BASE}/relay/mykey?since=${ts}`, {}, env);
  check("since=ts returns 204 (no duplicate reloads)", stale.status === 204, `got ${stale.status}`);
  const older = await call(`${BASE}/relay/mykey?since=${ts - 1000}`, {}, env);
  check("an older since still returns the image", older.status === 200);

  const otherKey = await call(`${BASE}/relay/someoneelse`, {}, env);
  check("a different key sees nothing", otherKey.status === 204, `got ${otherKey.status}`);
}

console.log("\n— Relay error handling —");
{
  const noKv = await call(`${BASE}/relay/k`, {}, {});
  check("missing KV binding explains itself", noKv.status === 501 && /SHOTS/.test(await noKv.text()));

  const env = { SHOTS: mockKV() };
  const empty = await call(`${BASE}/relay/k`, { method: "POST", body: new Uint8Array(0) }, env);
  check("empty upload rejected", empty.status === 400, `got ${empty.status}`);

  const big = await call(`${BASE}/relay/k`, { method: "POST", body: new Uint8Array(9 * 1024 * 1024) }, env);
  check("oversized upload rejected with guidance",
    big.status === 413 && /resize/i.test(await big.text()), `got ${big.status}`);

  const noKey = await call(`${BASE}/relay/`, {}, env);
  check("missing relay key rejected", noKey.status === 400, `got ${noKey.status}`);

  const badMethod = await call(`${BASE}/relay/k`, { method: "DELETE" }, env);
  check("unsupported method rejected", badMethod.status === 405, `got ${badMethod.status}`);
}

console.log("\n— Riot proxy still works —");
{
  const realFetch = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, init) => {
    seen = { url: String(url), token: init?.headers?.["X-Riot-Token"] };
    return new Response('{"puuid":"x"}', { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const env = { SHOTS: mockKV(), RIOT_API_KEY: "RGAPI-test" };
  const res = await call(`${BASE}/americas/tft/match/v1/matches/NA1_1?count=5`, {}, env);
  check("forwards to the right Riot host",
    seen?.url === "https://americas.api.riotgames.com/tft/match/v1/matches/NA1_1?count=5", seen?.url);
  check("attaches the stored API key", seen?.token === "RGAPI-test");
  check("proxies the response", res.status === 200);

  const bad = await call(`${BASE}/notahost/tft/x`, {}, env);
  check("unknown region rejected", bad.status === 400, `got ${bad.status}`);

  const noAuth = await call(`${BASE}/americas/tft/x`, {}, { SHOTS: mockKV() });
  check("no API key anywhere returns 401", noAuth.status === 401, `got ${noAuth.status}`);
  globalThis.fetch = realFetch;
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
