// Automatic screenshot intake.
//
// iOS gives a web app no access to the photo library and no Share Sheet
// target, so the app can never go and find your screenshots itself. Both
// paths here invert that: something outside the app pushes the image in.
//
//  1. RELAY  — an iOS Shortcut (bound to the Action Button) POSTs the
//     screenshot to your Cloudflare Worker; the app pulls it the moment you
//     switch back. Zero taps inside the app.
//  2. PASTE  — the Shortcut copies the screenshot instead; you tap Paste.
//     No server setup, but iOS shows its paste confirmation each time.

const RELAY_KEY = "ftt-relay";

export function loadRelay() {
  try {
    const saved = JSON.parse(localStorage.getItem(RELAY_KEY));
    if (saved && typeof saved === "object") return saved;
  } catch { /* fall through */ }
  return { url: "", key: "", lastTs: 0, enabled: false };
}

export function saveRelay(cfg) {
  localStorage.setItem(RELAY_KEY, JSON.stringify(cfg));
}

export function makeRelayKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return [...bytes].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
}

export function relayEndpoint(cfg) {
  if (!cfg.url || !cfg.key) return null;
  return `${cfg.url.replace(/\/+$/, "")}/relay/${encodeURIComponent(cfg.key)}`;
}

/**
 * Ask the relay for a screenshot newer than `since`.
 * Resolves to { file, ts } or null when there's nothing new.
 */
export async function fetchLatestShot(cfg, { signal } = {}) {
  const endpoint = relayEndpoint(cfg);
  if (!endpoint) throw new Error("Relay isn't configured yet.");
  const res = await fetch(`${endpoint}?since=${cfg.lastTs || 0}`, { signal, cache: "no-store" });
  if (res.status === 204) return null;
  if (!res.ok) {
    const detail = res.status === 501
      ? "The worker has no KV namespace bound — see proxy/README.md."
      : `Relay returned HTTP ${res.status}.`;
    throw new Error(detail);
  }
  const blob = await res.blob();
  if (!blob.size) return null;
  const ts = Number(res.headers.get("X-Shot-Ts")) || Date.now();
  const type = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  return { file: new File([blob], "screenshot.jpg", { type }), ts };
}

/** True when the browser can read an image out of the clipboard on demand. */
export function canReadClipboard() {
  return typeof navigator !== "undefined" && !!navigator.clipboard?.read;
}

/**
 * Pull an image from the clipboard. Must be called from a tap — iOS shows a
 * paste confirmation and rejects otherwise.
 */
export async function imageFromClipboard() {
  if (!canReadClipboard()) {
    throw new Error("This browser can't read the clipboard — use Choose a screenshot instead.");
  }
  let items;
  try {
    items = await navigator.clipboard.read();
  } catch {
    // Denied, dismissed, or called without a gesture.
    throw new Error("Clipboard read wasn't allowed. Tap Paste again and confirm, or pick the file instead.");
  }
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (type) {
      const blob = await item.getType(type);
      return new File([blob], "pasted.png", { type });
    }
  }
  throw new Error("No image on the clipboard — take a screenshot and copy it first.");
}
