# TFT Tactician

A Teamfight Tactics coaching companion for your iPhone — Set 17 *Space Gods*
meta comps, an item builder, a stage-by-stage econ/leveling coach, and match
analysis powered by Riot's official TFT API.

Built as an installable **progressive web app** (PWA): no Mac, no Xcode, no
App Store needed. It installs to your home screen from Safari, runs
fullscreen like a native app, and works offline (except live match fetching).

> **Why not a bot that plays for you?** iOS sandboxing makes it technically
> impossible for one app to read or control another, and gameplay automation
> violates Riot's Terms of Service. This app instead puts the decisions a
> top player would make one glance away.

## What's inside

| Tab | What it does |
|---|---|
| 🎓 **Coach** | Stage selector (2-1, 3-2, 4-2, …) with econ, leveling, and focus advice for exactly where you are in the game, plus econ rules and augment strategy |
| ⚔️ **Comps** | Patch 17.7 meta comps with tier, carries, best items, game plan, and positioning |
| 🛠️ **Items** | Tap two components → see the completed item and when to build it; best-in-slot by carry archetype |
| ✨ **Traits** | Set 17 origins & classes with practical tips |
| 📊 **Stats** | Your last 20 matches from the Riot API: average placement, top-4 rate, placement trend and distribution charts, your best comps (demo data works out of the box) |

## Setup

### 1. Host the app (free, one-time)

The app is static files in [`docs/`](docs/). On GitHub:
**Settings → Pages → Source: Deploy from a branch → Branch: `main`, folder
`/docs` → Save.** Your app will be live at
`https://<your-username>.github.io/FTT/`.

(Any static host works — Netlify, Cloudflare Pages, etc.)

### 2. Install it on your iPhone

Open the URL in **Safari** → tap **Share** → **Add to Home Screen**.
It launches fullscreen with its own icon, and everything except live match
fetching works offline.

### 3. (Optional) Connect your Riot account

The Stats tab ships with demo data. For your real matches, deploy the
5-minute proxy in [`proxy/`](proxy/README.md) and paste its URL plus your
Riot ID into the app's Stats settings.

## Updating for new patches

All coaching content lives in one file: [`docs/js/data.js`](docs/js/data.js)
(comps, traits, stage guide, patch label). Edit it, push, and the app
updates on next launch. Current snapshot: **Set 17 · Space Gods · patch
17.7** (July 2026). Set 18 *Enchanted Wilds* hits PBE July 28 — expect a
data refresh when it goes live.

## Repo layout

```
docs/               the PWA (GitHub Pages serves this)
  index.html        app shell
  css/app.css       dark mobile UI
  js/data.js        ALL coaching data — edit this each patch
  js/app.js         tabs + rendering
  js/analysis.js    Riot API client + SVG charts
  sw.js             offline caching
  manifest.webmanifest, icons/
proxy/              Cloudflare Worker that adds CORS to Riot's API
```

*(This repo previously held a Rocket League BakkesMod plugin — those files
remain at the root, untouched.)*

## Legal

TFT Tactician isn't endorsed by Riot Games. League of Legends and Teamfight
Tactics are trademarks of Riot Games, Inc. Match data via the official
[Riot Games API](https://developer.riotgames.com) under its terms.
