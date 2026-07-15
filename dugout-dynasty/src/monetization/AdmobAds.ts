import { AdService, InterstitialPolicy, RewardedPlacement } from './AdService';

/**
 * AdMob implementation for Capacitor builds.
 *
 * To activate:
 *   1. npm install @capacitor-community/admob && npx cap sync
 *   2. Replace the TEST unit IDs below with your real AdMob unit IDs
 *      (create them at https://apps.admob.com). The IDs below are Google's
 *      published test IDs — they always serve test ads and are safe to ship
 *      to testers, but earn nothing.
 *   3. In main.ts, construct AdmobAds instead of StubAds when
 *      Capacitor.isNativePlatform() is true.
 *
 * This file avoids a hard import of the plugin so web builds compile without
 * it; it is loaded dynamically at runtime.
 */
const UNITS = {
  // Google's official test ad unit IDs (Android)
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
};

export class AdmobAds implements AdService {
  private admob: any = null;

  constructor(private policy: InterstitialPolicy) {}

  async init(): Promise<void> {
    try {
      // dynamic import so the dependency is optional until store time;
      // specifier built at runtime so bundlers don't try to resolve it
      const spec = '@capacitor-community/' + 'admob';
      const mod = await import(/* @vite-ignore */ spec);
      this.admob = mod.AdMob;
      await this.admob.initialize({});
    } catch {
      this.admob = null;
    }
  }

  ready(): boolean {
    return this.admob !== null;
  }

  async showRewarded(_placement: RewardedPlacement): Promise<boolean> {
    if (!this.admob) return false;
    try {
      await this.admob.prepareRewardVideoAd({ adId: UNITS.rewarded });
      const result = await this.admob.showRewardVideoAd();
      return !!result;
    } catch {
      return false;
    }
  }

  async showInterstitial(): Promise<void> {
    if (!this.admob) return;
    const now = Date.now();
    if (!this.policy.canShow(now)) return;
    try {
      await this.admob.prepareInterstitial({ adId: UNITS.interstitial });
      await this.admob.showInterstitial();
      this.policy.markShown(now);
    } catch {
      /* ad failed to load — never block gameplay on ads */
    }
  }
}
