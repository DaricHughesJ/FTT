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

## Optional hardening

Add a plain-text variable `ALLOWED_ORIGIN` set to your GitHub Pages origin
(e.g. `https://<user>.github.io`) so only your app can use the worker.
