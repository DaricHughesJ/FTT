// In-app purchases: Diamond packs and one-time Deals.
// Real billing requires store accounts; until then StubStore simulates the
// purchase flow behind the same interface (RevenueCat or cordova-plugin-purchase
// slot in here at store time — see PUBLISHING.md).

export interface DiamondPack {
  id: string;
  name: string;
  diamonds: number;
  priceUsd: number;
}

export const DIAMOND_PACKS: DiamondPack[] = [
  { id: 'dia_s', name: 'Handful of Diamonds', diamonds: 120, priceUsd: 1.99 },
  { id: 'dia_m', name: 'Bag of Diamonds', diamonds: 380, priceUsd: 4.99 },
  { id: 'dia_l', name: 'Crate of Diamonds', diamonds: 900, priceUsd: 9.99 },
  { id: 'dia_xl', name: 'Vault of Diamonds', diamonds: 2100, priceUsd: 19.99 },
];

export interface StoreService {
  /** Purchase a diamond pack; resolves true on completed payment. */
  buyDiamondPack(packId: string): Promise<boolean>;
  /** Purchase a one-time deal (offers screen); resolves true on payment. */
  buyDeal(dealId: string, priceUsd: number): Promise<boolean>;
  isStub(): boolean;
}

/** Dev/browser store: confirms via dialog and always "succeeds". */
export class StubStore implements StoreService {
  isStub(): boolean {
    return true;
  }

  buyDiamondPack(packId: string): Promise<boolean> {
    const pack = DIAMOND_PACKS.find((p) => p.id === packId);
    if (!pack) return Promise.resolve(false);
    return this.confirm(`${pack.name} — $${pack.priceUsd.toFixed(2)} (TEST PURCHASE)`);
  }

  buyDeal(_dealId: string, priceUsd: number): Promise<boolean> {
    return this.confirm(`One-time deal — $${priceUsd.toFixed(2)} (TEST PURCHASE)`);
  }

  private confirm(label: string): Promise<boolean> {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'ad-overlay';
      el.innerHTML = `
        <div class="ad-box">
          <div class="ad-label">${label}</div>
          <div class="stub-store-note">Real billing activates after store setup.</div>
          <div class="row">
            <button class="btn btn-primary" data-ok>Simulate purchase</button>
            <button class="btn" data-cancel>Cancel</button>
          </div>
        </div>`;
      document.body.appendChild(el);
      el.querySelector('[data-ok]')!.addEventListener('click', () => {
        el.remove();
        resolve(true);
      });
      el.querySelector('[data-cancel]')!.addEventListener('click', () => {
        el.remove();
        resolve(false);
      });
    });
  }
}
