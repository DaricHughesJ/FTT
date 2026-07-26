# Setup

Four phases. **Only Phase 1 is required** — the app is fully usable after
it. Phases 3 and 4 add convenience and stats whenever you feel like it.

| Phase | What you get | Time |
|---|---|---|
| 1. Host + install | The app on your home screen | ~3 min |
| 2. Calibrate | Screenshots read correctly on your device | ~1 min |
| 3. Auto-capture | Action Button → shop already read | ~10 min |
| 4. Match stats | Your real placements and comp history | ~3 min |

---

## Phase 1 — Get it on your phone (required)

### 1.1 Turn on GitHub Pages

On a computer or phone browser, signed in to GitHub:

1. Go to **github.com/DaricHughesJ/FTT → Settings** (top-right tab of the repo)
2. **Pages** in the left sidebar
3. Under *Build and deployment*:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`, folder: **`/docs`**
4. **Save**

Wait 1–2 minutes for the first build. The Pages panel will show a green
"Your site is live at…" banner when it's ready.

Your URL: **https://darichughesj.github.io/FTT/**

### 1.2 Add it to your home screen

On your iPhone, in **Safari** (this matters — other browsers won't install
it properly):

1. Open **https://darichughesj.github.io/FTT/**
2. Tap the **Share** button (square with an arrow, bottom centre)
3. Scroll down → **Add to Home Screen** → **Add**

It now launches fullscreen with its own icon, and everything except live
match-fetching works with no signal.

---

## Phase 2 — Calibrate once

1. Play or spectate a TFT game and take a normal screenshot
   (side button + volume up)
2. Open the app → **Scan** → **Choose a screenshot** → pick it
3. Look at the outlined gold box over the preview. It should sit on your
   five shop cards, with the divider lines falling between them.
   - **If it lines up** — done, nothing to do.
   - **If it doesn't** — tap **Adjust shop region**, drag the box over the
     cards, drag the corner handle to resize, then **Done adjusting**.

That's saved permanently. Every future screenshot uses it.

Sanity check: the cost chips (1-cost, 3-cost…) should match what was
actually in your shop. If a card reads the wrong cost, the box is probably
still slightly off.

---

## Phase 3 — Automatic capture (optional)

Press the Action Button mid-game; the shop is already read when you switch
to the app.

### 3.1 Create the Cloudflare Worker

1. Sign up free at **dash.cloudflare.com**
2. **Compute (Workers) → Create → Workers → Create Worker**
3. Name it (e.g. `ftt-proxy`) → **Deploy** the starter
4. **Edit code**, delete what's there, paste the entire contents of
   [`proxy/cloudflare-worker.js`](proxy/cloudflare-worker.js) → **Deploy**
5. Copy your worker URL — `https://ftt-proxy.<something>.workers.dev`

### 3.2 Give it somewhere to put screenshots

1. **Storage & Databases → KV → Create a namespace**, name it `ftt-shots`
2. Back in your worker → **Settings → Bindings → Add → KV namespace**
   (older dashboards: *Settings → Variables → KV Namespace Bindings*)
   - **Variable name**: `SHOTS` — exactly this, it's what the code looks for
   - **KV namespace**: `ftt-shots`
3. **Deploy**

Screenshots auto-delete after 10 minutes. This is a hand-off buffer, not storage.

### 3.3 Point the app at it

App → **Scan** → **Automatic capture**:

1. **Worker URL**: paste your `…workers.dev` URL
2. **Relay key**: tap **Generate**
3. Tick **Auto-load a waiting screenshot when I open the app**

A *Your Shortcut* panel appears with the exact URL for the next step —
long-press it to copy.

### 3.4 Build the Shortcut

Shortcuts app → **+** → add these three actions in order:

1. **Take Screenshot**
2. **Resize Image** — set **Width** to `1400`
   (keeps the upload small; it should already point at the screenshot)
3. **Get Contents of URL** — tap **Show More** to expand:
   - **URL**: the URL from step 3.3
   - **Method**: `POST`
   - **Request Body**: `File`
   - The file should be the **Resized Image** from step 2

Name it *TFT Scan*. Then **Settings app → Action Button** → swipe to
**Shortcut** → choose *TFT Scan*.

### Using it

Mid-game, press the Action Button. Swipe over to TFT Tactician — the
screenshot is already loaded and the shop read.

> **No Cloudflare account?** Skip 3.1–3.3 entirely. Make the Shortcut just
> **Take Screenshot** → **Copy to Clipboard**, then tap **Paste screenshot**
> in the app. iOS asks you to confirm the paste, so it's two taps instead of
> none — but nothing to set up.

---

## Phase 4 — Match stats (optional)

1. Go to **developer.riotgames.com**, sign in with your Riot account
2. Copy the **Development API Key** on the dashboard
   (it expires every 24 hours — for a permanent one, register a *Personal
   API Key*, which takes a few days to be approved)
3. Worker → **Settings → Variables and Secrets → Add**
   - Type: **Secret**
   - Name: `RIOT_API_KEY`
   - Value: your key
   - **Deploy**
4. App → **Stats** → enter your Riot ID (name and tag separately, no `#`),
   pick your region, paste the same worker URL → **Fetch my matches**

Leave the API key field in the app blank — the worker supplies it.

---

## Recommended hardening

Once it all works, lock the worker to your app so nobody else can use it:

Worker → **Settings → Variables and Secrets → Add** → type **Text**,
name `ALLOWED_ORIGIN`, value `https://darichughesj.github.io` → **Deploy**.

---

## If something's wrong

| Symptom | Cause |
|---|---|
| Pages URL 404s | Build not finished, or folder isn't set to `/docs` |
| No **Add to Home Screen** | You're not in Safari |
| Shop reads wrong costs | Region box is off — redo Phase 2 |
| "No KV namespace bound" | Binding isn't named exactly `SHOTS`, or not deployed |
| "Nothing waiting" after Action Button | Shortcut isn't POSTing — check Method is `POST` and Request Body is `File` |
| Stats: "API key missing or expired" | Dev keys die every 24h — regenerate and update the secret |
| App looks stale after an update | Force-quit and reopen; the service worker refreshes on next launch |
