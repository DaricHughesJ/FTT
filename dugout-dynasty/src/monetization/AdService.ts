import { BALANCE } from '../core/content';

export type RewardedPlacement = 'income_boost' | 'instant_games' | 'free_diamonds';

/**
 * Every ad interaction goes through this interface. The game never talks to
 * an ad SDK directly, so swapping stub -> AdMob is a one-line change in main.ts.
 */
export interface AdService {
  /** Show a rewarded ad; resolves true if the user earned the reward. */
  showRewarded(placement: RewardedPlacement): Promise<boolean>;
  /** Show an interstitial if allowed. Resolves when dismissed (or skipped). */
  showInterstitial(): Promise<void>;
  ready(): boolean;
}

/**
 * Frequency-cap policy for interstitials, kept separate from any SDK so it is
 * unit-testable: never within the first N minutes after install, and at most
 * one per M minutes after that.
 */
export class InterstitialPolicy {
  private lastShownAt = 0;

  constructor(private installedAt: number) {}

  canShow(now: number): boolean {
    if (now - this.installedAt < BALANCE.interstitialGraceMs) return false;
    if (now - this.lastShownAt < BALANCE.interstitialMinIntervalMs) return false;
    return true;
  }

  markShown(now: number): void {
    this.lastShownAt = now;
  }
}
