// One-time purchase deals: a starter deal for new players plus milestone deals.
// Each deal can be purchased at most once per franchise history (they do NOT
// come back after prestige — that's what makes them "deals").

export interface DealDef {
  id: string;
  name: string;
  desc: string;
  priceUsd: number; // display price; real billing wired at store time
  diamonds: number;
  cashWinsMult: number; // cash granted = this many win-incomes at purchase time
  prospectGrade?: 'A' | 'S';
  durationMs: number;
}

export const DEALS: DealDef[] = [
  {
    id: 'starter',
    name: 'Starter Deal',
    desc: 'One-time bundle for new franchises: Diamonds plus a ready-to-develop A-grade prospect.',
    priceUsd: 2.99,
    diamonds: 260,
    cashWinsMult: 10,
    prospectGrade: 'A',
    durationMs: 48 * 3600_000,
  },
  {
    id: 'champion',
    name: 'Champion Deal',
    desc: 'Celebrate your first championship: a big Diamond haul and an S-grade superstar prospect.',
    priceUsd: 7.99,
    diamonds: 700,
    cashWinsMult: 25,
    prospectGrade: 'S',
    durationMs: 48 * 3600_000,
  },
  {
    id: 'dynasty',
    name: 'Dynasty Deal',
    desc: 'For prestiged franchises: the best Diamonds-per-dollar bundle in the game.',
    priceUsd: 14.99,
    diamonds: 1600,
    cashWinsMult: 40,
    durationMs: 48 * 3600_000,
  },
];

export interface ActiveOffer {
  dealId: string;
  offeredAt: number;
  expiresAt: number;
}

export interface OfferBookState {
  active: ActiveOffer[];
  purchased: string[]; // deal ids bought (once-only)
  triggered: string[]; // deal ids ever offered (won't re-trigger)
}

export function newOfferBook(): OfferBookState {
  return { active: [], purchased: [], triggered: [] };
}

export interface OfferTriggerContext {
  promotions: number;
  championships: number;
  prestiges: number;
  now: number;
}

function dealById(id: string): DealDef {
  const d = DEALS.find((x) => x.id === id);
  if (!d) throw new Error(`unknown deal ${id}`);
  return d;
}

function trigger(book: OfferBookState, id: string, now: number): ActiveOffer {
  const deal = dealById(id);
  const offer: ActiveOffer = { dealId: id, offeredAt: now, expiresAt: now + deal.durationMs };
  book.active.push(offer);
  book.triggered.push(id);
  return offer;
}

/** Check trigger conditions; returns newly activated offers. Call after milestones change. */
export function updateOffers(book: OfferBookState, ctx: OfferTriggerContext): ActiveOffer[] {
  // expire old ones first
  book.active = book.active.filter((o) => o.expiresAt > ctx.now);

  const fresh: ActiveOffer[] = [];
  const can = (id: string) => !book.triggered.includes(id) && !book.purchased.includes(id);

  if (can('starter') && ctx.promotions >= 1) fresh.push(trigger(book, 'starter', ctx.now));
  if (can('champion') && ctx.championships >= 1) fresh.push(trigger(book, 'champion', ctx.now));
  if (can('dynasty') && ctx.prestiges >= 1) fresh.push(trigger(book, 'dynasty', ctx.now));
  return fresh;
}

/** Mark a deal purchased; returns its definition. Throws if not active/already bought. */
export function purchaseOffer(book: OfferBookState, dealId: string, now: number): DealDef {
  const active = book.active.find((o) => o.dealId === dealId && o.expiresAt > now);
  if (!active) throw new Error('offer not active');
  if (book.purchased.includes(dealId)) throw new Error('offer already purchased');
  book.purchased.push(dealId);
  book.active = book.active.filter((o) => o.dealId !== dealId);
  return dealById(dealId);
}

export { dealById };
