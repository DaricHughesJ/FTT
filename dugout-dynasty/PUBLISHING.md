# Publishing & first-revenue checklist

The game is fully playable today in any browser. This file is the ordered
path from here to "it earns money". Costs: **$25 one-time** (Google Play)
and optionally **$99/year** (Apple). Everything else is free tier.

## Phase 0 — free soft launch (no accounts needed)

Ship the web build somewhere free (Netlify/Vercel/GitHub Pages/itch.io):

```bash
npm run build   # upload dist/
```

Share it, watch how far friends get, and tune balance in
`src/core/content.ts` before spending anything. Optional: submit the web
build to portals like CrazyGames/Poki — they have their own ad SDKs and
rev-share, which can be literal first dollars without a store account.

## Phase 1 — Android app (the $25 path)

1. **Google Play Console** account: https://play.google.com/console ($25 one-time).
2. Add the native project (already scripted):
   ```bash
   npm run cap:add:android
   npx cap open android   # or build with Android Studio / gradle CLI
   ```
3. App icon + splash: replace the generated assets in `android/app/src/main/res`
   (`@capacitor/assets` can generate all sizes from one 1024px image).
4. **Privacy policy** (required because of ads): a one-page URL. Generators
   like app-privacy-policy-generator.firebaseapp.com are fine. Host it
   anywhere public.
5. Play Console: create the app, fill Data Safety (ads → yes, ad-network
   data collection), content rating questionnaire (note: the game contains
   simulated gambling-adjacent loot boxes → answer the loot-box question
   yes; odds are already displayed in-game as required).
6. Internal testing track first, then production. First review usually
   takes a few days.

## Phase 2 — real ads (AdMob)

1. Create an AdMob account: https://apps.admob.com (needs the Play listing
   to link to, so do Phase 1 first).
2. Create one **Rewarded** and one **Interstitial** ad unit.
3. `npm install @capacitor-community/admob && npx cap sync`
4. Put your real unit IDs into `src/monetization/AdmobAds.ts` (it currently
   ships Google's official test IDs).
5. In `src/main.ts`, construct `AdmobAds` instead of `StubAds` when running
   natively:
   ```ts
   import { Capacitor } from '@capacitor/core';
   const ads = Capacitor.isNativePlatform()
     ? await (async () => { const a = new AdmobAds(adPolicy); await a.init(); return a; })()
     : new StubAds(adPolicy);
   ```
6. `app-ads.txt`: AdMob will ask you to host one on the domain listed in
   your Play listing.

Payout reality check: casual-game eCPMs mean ads earn roughly $5–20 per
1,000 daily active users per day. The first goal is hundreds of players,
not thousands of dollars.

## Phase 3 — real IAP (Diamonds + deals)

Recommended: **RevenueCat** (free until ~$2.5K/mo revenue) over raw store
APIs — it handles receipts and restores.

1. In Play Console, create in-app products with ids matching
   `src/monetization/StoreService.ts` (`dia_s/m/l/xl`) and
   `src/core/offers.ts` (`starter`, `champion`, `dynasty`).
2. `npm install @revenuecat/purchases-capacitor && npx cap sync`
3. Implement `StoreService` with RevenueCat calls (same two methods the
   stub implements) and construct it instead of `StubStore` on native.
4. Test with Play's license-tester accounts before going live.

## Phase 4 — global leaderboards (free, 5 minutes)

1. https://console.firebase.google.com → Add project → add a **Web app**.
2. Copy the config into `src/online/firebase-config.ts`, `npm install firebase`.
3. Create a **Firestore** database, and set rules that allow public
   score-shaped writes only:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /leaderboard/{playerId} {
         allow read: if true;
         allow write: if request.resource.data.keys().hasOnly(
             ['teamName','rating','worth','hr','championships','updatedAt'])
           && request.resource.data.teamName is string
           && request.resource.data.teamName.size() <= 24;
       }
     }
   }
   ```
4. Rebuild. The game auto-detects the config and goes online.

Note: scores are client-submitted and technically spoofable; fine for a
casual board. If it ever matters, swap in Google Play Games leaderboards
behind the same `LeaderboardService` interface.

## Phase 5 — iOS (when Android proves out)

- Apple Developer Program ($99/yr), a Mac with Xcode, then:
  `npm run cap:add:ios && npx cap open ios`
- Same AdMob/RevenueCat plugins work. App Review requires the odds
  disclosure for packs (already in the Shop UI) and a restore-purchases
  button (RevenueCat provides the call — add a button in Settings).

## Balance tuning cheat-sheet

Everything lives in `src/core/content.ts` (`BALANCE`). The numbers that
most affect retention/revenue:

- `gameDurationMs` — session pacing
- `winIncomeTierMult` vs `upgradeCostTierMult` — progression friction
- `offlineCapMs` — how much "come back tomorrow" is worth
- pack odds & `prospectDevHours` — how tempting Diamonds are
- `interstitialMinIntervalMs` — churn vs revenue lever (be gentle)
