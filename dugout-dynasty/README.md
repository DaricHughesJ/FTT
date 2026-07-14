# ⚾ Dugout Dynasty

An idle arcade baseball franchise game — a much simpler, snackable take on
OOTP-style management. Your team plays continuously; you earn cash from wins,
develop minor-league prospects, fleece rivals in trades, climb ten leagues,
and prestige into a dynasty.

Built with TypeScript + Vite, wrapped for Android/iOS with Capacitor.

## Play it now

```bash
cd dugout-dynasty
npm install
npm run dev
```

Open the printed URL on your phone (same Wi-Fi) or in a desktop browser —
the layout is mobile-first at 390px and scales up.

## What's in the game

- **Live ballpark view** — canvas diamond with base runners and play-by-play
- **20-game seasons** across 8-team leagues; finish top 2 to get promoted
  through 10 leagues (Backyard → Galaxy)
- **Roster of 12** (9 batters, 3 pitchers) with Bat/Arm/Spd stats and
  cash training upgrades
- **Farm system** — up to 6 prospects (C/B/A/S potential) develop in real
  time, then get called up to replace starters
- **Trades** — target any AI player, offer a player + prospects + cash;
  transparent trade-value margin; AI teams also send you offers
- **Scout packs** — gacha-lite prospect draws for Diamonds, odds published
- **One-time deals** — starter/champion/dynasty bundles on 48h timers
- **Prestige** — win a championship, then start a new franchise for
  permanent legacy multipliers
- **Offline progress** — up to 8h of games sim while you're away
- **Leaderboards** — Team Rating / Worth / Career HR / Championships;
  local rivals out of the box, global via Firebase (see below)

## Monetization (all stubbed until store setup)

| Surface | What it does |
| --- | --- |
| Rewarded ads | 2× income 4h · sim 10 games · +6 💎 (5/day) |
| Interstitials | Only at season end, ≥3 min apart, none in first 10 min |
| Diamond IAP packs | 4 price points |
| One-time deals | Triggered by promotion/championship/prestige |

In dev builds ads are a fake 3s overlay and purchases are a "Simulate
purchase" dialog — the entire economy is playable end-to-end. Wiring real
AdMob/billing is documented in [PUBLISHING.md](./PUBLISHING.md).

## Commands

```bash
npm run dev        # dev server
npm test           # 48 unit tests (sim, economy, trades, packs, offers…)
npm run build      # typecheck + production bundle in dist/
npm run cap:add:android   # once you're ready for a real Android app
```

## Enabling global leaderboards

Create a free Firebase project, then paste its web config into
`src/online/firebase-config.ts` and `npm install firebase`. No config
present = local leaderboard automatically. Details in PUBLISHING.md.

## Project layout

```
src/core/          pure game logic, no DOM (unit-tested)
src/monetization/  AdService / StoreService interfaces + stub & AdMob impls
src/online/        LeaderboardService: local stub + Firebase impl
src/ui/            screens, live-game canvas, DOM helpers
test/              vitest suites
```
