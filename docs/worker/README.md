# Riot API proxy (Cloudflare Worker)

Riot's API doesn't allow direct browser calls (no CORS), so the app's
**Stats** tab needs this tiny proxy. It's free and takes ~5 minutes.

## Deploy

1. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Workers & Pages → Create → Worker**, give it any name, deploy the
   hello-world, then **Edit code** and replace the contents with
   `cloudflare-worker.js` from this folder. **Deploy**.
3. Get a Riot API key at
   [developer.riotgames.com](https://developer.riotgames.com) (sign in with
   your Riot account → the development key on the dashboard works fine;
   note it expires every 24h — apply for a personal key for a permanent one).
4. Store the key on the worker so you never type it in the app:
   **Worker → Settings → Variables and Secrets → Add** — type *Secret*,
   name `RIOT_API_KEY`, value your key.
   (Alternative: skip this and paste the key into the app's settings —
   it will be sent per-request via the `X-Riot-Token` header.)
5. Copy the worker URL (`https://<name>.<account>.workers.dev`) and paste it
   into the app's **Stats → Proxy URL** field.

## Automatic screenshot capture (the Action Button flow)

iOS gives a web app **no** access to your photo library and **no** Share
Sheet target, so the app can never go looking for your screenshots. The way
around it is to push the screenshot *to* the app: an iOS Shortcut uploads it
to this worker, and the app pulls it the instant you switch back — no taps
inside the app.

### 1. Give the worker somewhere to put screenshots

1. Cloudflare dashboard → **Storage & databases → Workers KV → Create a namespace**.
   Name it anything (e.g. `ftt-shots`).
2. Your worker → **Settings → Bindings → Add → KV namespace**.
   Variable name **must** be `SHOTS`; select the namespace. **Deploy**.

Screenshots expire automatically after 10 minutes — this is a hand-off
buffer, not storage.

### 2. Point the app at it

In the app: **Scan → Automatic capture**. Paste your worker URL, tap
**Generate** for a relay key, and tick *Auto-load*. The app then shows you
the exact URL to paste into the Shortcut.

### 3. Build the Shortcut (3 actions)

Shortcuts app → **+** → add, in order:

1. **Take Screenshot**
2. **Resize Image** — width `1400` (keeps the upload small and fast)
3. **Get Contents of URL** — expand *Show More*:
   - URL: `https://<your-worker>.workers.dev/relay/<your-key>`
   - Method: **POST**
   - Request Body: **File**, and pass in the resized image

Name it something like *TFT Scan*. Then **Settings → Action Button →
Shortcut** and pick it.

Now: press the Action Button mid-game, swipe over to TFT Tactician, and the
shop is already read.

> The relay key is a shared secret in the URL — anyone who has it could read
> your last screenshot for 10 minutes. Use the generated key rather than
> something guessable, and set `ALLOWED_ORIGIN` below.

**No Cloudflare account?** Skip all of this. Make the Shortcut's second
action **Copy to Clipboard** instead of the upload, then tap **Paste
screenshot** in the app. iOS shows a paste confirmation each time, so it's
two taps rather than none — but there's nothing to set up.

## Optional hardening

Add a plain-text variable `ALLOWED_ORIGIN` set to your GitHub Pages origin
(e.g. `https://<user>.github.io`) so only your app can use the worker.
