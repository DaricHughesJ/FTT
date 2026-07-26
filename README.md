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
| 🎯 **Scan** | Load a screenshot of your game → it reads your shop, then computes the mathematically best play for your exact gold, level and target (see below) |
| 🎓 **Coach** | Stage selector (2-1, 3-2, 4-2, …) with econ, leveling, and focus advice for exactly where you are in the game, plus econ rules and augment strategy |
| ⚔️ **Comps** | Patch 17.7 meta comps with tier, carries, best items, game plan, and positioning |
| 🛠️ **Items** | Tap two components → see the completed item and when to build it; best-in-slot by carry archetype |
| ✨ **Traits** | Set 17 origins & classes with practical tips |
| 📊 **Stats** | Your last 20 matches from the Riot API: average placement, top-4 rate, placement trend and distribution charts, your best comps (demo data works out of the box) |

## The Scan tab

Screenshot your game, load it, and get a verdict like:

> **Best play — Spend all 80g (40 rolls)** · 86% to hit Nami
> *Rolling only to 50g gives just 37% — spending down is worth breaking
> interest for.*

It compares the real options (save · roll to the 50g interest breakpoint ·
spend everything · level first, then roll) using Set 17's actual shop odds,
pool sizes, and XP costs, and shows the numbers behind each one.

**What's automatic vs. what you confirm.** The app finds the shop bar and
reads each card's **cost** from its frame colour — that part is reliable
because TFT's cost colours are fixed. It does *not* try to recognise *which*
champion is on a card: that needs a model trained on champion art, and
generic OCR on the stylised name text is worse than useless when it's
confidently wrong. So the cost read narrows each slot to ~13 candidates and
you tap the right one. Everything else (gold, level, stage, health) you type
— it's five taps and it's never wrong.

**Calibrate once.** Screen geometry differs per device, so if the outlined
box doesn't sit on your 5 shop cards, tap **Adjust shop region**, drag it
into place, and it's remembered from then on.

**One iOS limitation:** iOS doesn't let a web app receive the system Share
sheet, so the flow is *open the app → Choose a screenshot → pick it from
Photos*, rather than sharing directly into it from the screenshot preview.

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

Two data files, no app logic to touch:

- [`docs/js/data.js`](docs/js/data.js) — comps, traits, stage guide, patch label
- [`docs/js/roster.js`](docs/js/roster.js) — champions by cost, shop odds, pool
  sizes, XP table

Then run the test suite, which checks the tables are internally consistent
(odds rows summing to 100, no champion listed at two costs, pool totals
matching) and that the recommendations still behave:

```
node tests/odds.test.mjs
```

Current snapshot: **Set 17 · Space Gods · patch 17.7** (July 2026). Set 18
*Enchanted Wilds* hits PBE July 28 — expect a data refresh when it goes live.

> **On the roster data:** the shop odds and pool sizes are well-attested for
> Set 17. The champion cost assignments were reconciled from community
> sources that disagreed on a handful of units, so if you spot a unit at the
> wrong cost, fix it in `roster.js` — it's a one-line edit.

## Repo layout

```
docs/               the PWA (GitHub Pages serves this)
  index.html        app shell
  css/app.css       dark mobile UI
  js/data.js        comps, traits, stage guide — edit each patch
  js/roster.js      champions by cost, shop odds, pool sizes, XP table
  js/odds.js        the decision engine (probability + roll/level/save)
  js/vision.js      screenshot reading (shop bar + cost-colour detection)
  js/scan.js        Scan tab UI
  js/app.js         tabs + rendering
  js/analysis.js    Riot API client + SVG charts
  sw.js             offline caching
  manifest.webmanifest, icons/
proxy/              Cloudflare Worker that adds CORS to Riot's API
tests/odds.test.mjs 44 checks on the math and the patch data
```

*(This repo previously held a Rocket League BakkesMod plugin — those files
remain at the root, untouched.)*

## Legal

TFT Tactician isn't endorsed by Riot Games. League of Legends and Teamfight
Tactics are trademarks of Riot Games, Inc. Match data via the official
[Riot Games API](https://developer.riotgames.com) under its terms.
