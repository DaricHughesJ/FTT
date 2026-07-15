import { AdService, InterstitialPolicy, RewardedPlacement } from './AdService';

/**
 * Browser/dev ad implementation: shows a fake 3-second "ad" overlay so the
 * whole reward flow is playable without an ad SDK. On device this is replaced
 * by AdmobAds.
 */
export class StubAds implements AdService {
  constructor(private policy: InterstitialPolicy) {}

  ready(): boolean {
    return true;
  }

  showRewarded(_placement: RewardedPlacement): Promise<boolean> {
    return this.overlay('Rewarded ad (test)', 3000).then(() => true);
  }

  async showInterstitial(): Promise<void> {
    const now = Date.now();
    if (!this.policy.canShow(now)) return;
    this.policy.markShown(now);
    await this.overlay('Interstitial ad (test)', 2000);
  }

  private overlay(label: string, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'ad-overlay';
      el.innerHTML = `
        <div class="ad-box">
          <div class="ad-label">${label}</div>
          <div class="ad-count"></div>
        </div>`;
      document.body.appendChild(el);
      const count = el.querySelector('.ad-count') as HTMLElement;
      const started = Date.now();
      const timer = setInterval(() => {
        const left = Math.ceil((ms - (Date.now() - started)) / 1000);
        count.textContent = left > 0 ? `${left}…` : '';
        if (Date.now() - started >= ms) {
          clearInterval(timer);
          el.remove();
          resolve();
        }
      }, 200);
    });
  }
}
