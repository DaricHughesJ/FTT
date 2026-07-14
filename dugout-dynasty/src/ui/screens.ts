import { BALANCE, LEAGUES, MILESTONES } from '../core/content';
import { formatCash, formatDuration, formatNumber } from '../core/format';
import {
  devSpeedMult,
  facilityCost,
  facilityMaxed,
  FacilityKey,
  fans,
  fanMult,
  scoutCost,
  winIncome,
} from '../core/economy';
import {
  Player,
  playerArm,
  playerBat,
  playerRating,
  playerSpd,
  playerValue,
  Prospect,
  prospectValue,
  rushCost,
} from '../core/roster';
import { standings } from '../core/season';
import { evaluateTrade, TradeOffer } from '../core/trades';
import { DEALS } from '../core/offers';
import { Engine } from '../core/state';
import { LEADERBOARD_CATEGORIES, LeaderboardCategory } from '../core/stats';
import { AdService } from '../monetization/AdService';
import { DIAMOND_PACKS, StoreService } from '../monetization/StoreService';
import { LeaderboardEntry, LeaderboardService } from '../online/LeaderboardService';
import { button, el, infoModal, modal, toast } from './dom';
import { drawField, playText, snapshotAt } from './livegame';

export type TabId = 'home' | 'team' | 'farm' | 'trade' | 'shop' | 'more';

export interface UICtx {
  engine: Engine;
  ads: AdService;
  store: StoreService;
  leaderboard: LeaderboardService;
  playerId: string;
  now(): number;
  forceRender(): void;
  submitScores(): void;
}

// ---------------------------------------------------------------- top bar

export function renderTopbar(host: HTMLElement, ctx: UICtx): void {
  const s = ctx.engine.state;
  const now = ctx.now();
  host.replaceChildren(
    el('div', { class: 'team-title' }, [
      s.teamName,
      el('span', { class: 'league' }, [
        `${LEAGUES[s.season.tier].name} · Game ${Math.min(s.season.gameIndex + 1, BALANCE.gamesPerSeason)}/${BALANCE.gamesPerSeason}`,
      ]),
    ]),
    el('span', { class: 'res cash' }, [`💵 ${formatCash(s.cash)}`]),
    el('span', { class: 'res diamond' }, [`💎 ${formatNumber(s.diamonds)}`]),
    el('span', { class: 'res fans' }, [`👥 ${formatNumber(fans(s.facilities.stadium))}`]),
    ...(ctx.engine.boostActive(now)
      ? [el('span', { class: 'res boost' }, [`🔥 2× ${formatDuration(s.boostUntil - now)}`])]
      : []),
  );
}

// ---------------------------------------------------------------- home

export function renderHome(host: HTMLElement, ctx: UICtx): void {
  const s = ctx.engine.state;
  const now = ctx.now();
  const result = ctx.engine.ensureCurrentGame();
  const opponent = s.season.aiTeams[s.season.nextOpponent];
  const snap = snapshotAt(result, s.gameProgress);

  const canvas = el('canvas', { id: 'field', width: '520', height: '300' });
  drawField(canvas, snap, s.gameProgress);

  const fieldWrap = el('div', { id: 'field-wrap' }, [
    canvas,
    el('div', { class: 'progressbar' }, [
      (() => {
        const bar = el('div', { id: 'game-progress' });
        bar.style.width = `${Math.floor(s.gameProgress * 100)}%`;
        return bar;
      })(),
    ]),
    el('div', { class: 'scoreboard' }, [
      el('span', {}, [`${s.teamName}`]),
      el('span', { class: 'score', id: 'live-score' }, [`${snap.homeScore} — ${snap.awayScore}`]),
      el('span', { id: 'live-opponent' }, [opponent.name]),
    ]),
    el('div', { class: 'ticker', id: 'live-ticker' }, [playText(snap.lastEvent, opponent.name)]),
  ]);

  // rewarded ad actions
  const boostBtn = button(
    ctx.engine.boostActive(now) ? `🔥 Boost active — extend (ad)` : '📺 Watch ad: 2× income for 4h',
    async () => {
      const ok = await ctx.ads.showRewarded('income_boost');
      if (ok) {
        ctx.engine.grantIncomeBoost(ctx.now());
        toast('🔥 2× income boost active!');
        ctx.forceRender();
      }
    },
    'btn btn-block',
  );
  const simBtn = button(
    `📺 Watch ad: sim ${BALANCE.simGamesReward} games instantly`,
    async () => {
      const ok = await ctx.ads.showRewarded('instant_games');
      if (ok) {
        const played = ctx.engine.grantInstantGames(ctx.now());
        toast(`⚡ Simulated ${played} games!`);
        ctx.forceRender();
      }
    },
    'btn btn-block',
  );

  // standings table
  const rows = standings(s.season, s.teamName);
  const table = el('table', { class: 'standings' }, [
    el('tr', {}, [el('th', {}, ['#']), el('th', {}, ['Team']), el('th', { class: 'num' }, ['W']), el('th', { class: 'num' }, ['L'])]),
    ...rows.map((r, i) =>
      el('tr', { class: r.isPlayer ? 'you' : '' }, [
        el('td', {}, [String(i + 1)]),
        el('td', {}, [r.name]),
        el('td', { class: 'num' }, [String(r.wins)]),
        el('td', { class: 'num' }, [String(r.losses)]),
      ]),
    ),
  ]);

  host.replaceChildren(
    fieldWrap,
    boostBtn,
    simBtn,
    el('h2', {}, [`${LEAGUES[s.season.tier].name} standings`]),
    el('div', { class: 'hint' }, [
      `Finish top ${BALANCE.promotionRank} of ${BALANCE.gamesPerSeason} games to get promoted. Win income: ${formatCash(winIncome(ctx.engine.incomeCtx(now)))}`,
    ]),
    el('div', { class: 'card' }, [table]),
  );
}

/**
 * Per-frame update of the live view without rebuilding the DOM — keeps the
 * ballpark animation smooth while full screen re-renders stay infrequent.
 */
export function updateHomeLive(ctx: UICtx): void {
  const canvas = document.getElementById('field') as HTMLCanvasElement | null;
  if (!canvas) return;
  const s = ctx.engine.state;
  const result = ctx.engine.ensureCurrentGame();
  const opponent = s.season.aiTeams[s.season.nextOpponent];
  const snap = snapshotAt(result, s.gameProgress);
  drawField(canvas, snap, s.gameProgress);
  const bar = document.getElementById('game-progress');
  if (bar) bar.style.width = `${Math.floor(s.gameProgress * 100)}%`;
  const score = document.getElementById('live-score');
  if (score) score.textContent = `${snap.homeScore} — ${snap.awayScore}`;
  const opp = document.getElementById('live-opponent');
  if (opp) opp.textContent = opponent.name;
  const ticker = document.getElementById('live-ticker');
  if (ticker) ticker.textContent = playText(snap.lastEvent, opponent.name);
}

// ---------------------------------------------------------------- team

function statLine(p: Player): string {
  if (p.pos === 'P') return `Arm ${formatNumber(playerArm(p))} · Spd ${formatNumber(playerSpd(p))}`;
  return `Bat ${formatNumber(playerBat(p))} · Spd ${formatNumber(playerSpd(p))}`;
}

/** Small ▲/▼ chip for a recent random development change. */
function devChip(p: Player, now: number): HTMLElement | null {
  if (!p.devDelta || !p.devAt || now - p.devAt > 90_000) return null;
  const up = p.devDelta > 0;
  return el('span', { class: `dev-chip ${up ? 'dev-up' : 'dev-down'}` }, [
    `${up ? '▲' : '▼'}${Math.abs(p.devDelta * 100).toFixed(1)}%`,
  ]);
}

function potentialChip(p: Player): HTMLElement {
  return el('span', { class: `grade grade-${p.potential}`, title: 'Potential' }, [p.potential]);
}

export function renderTeam(host: HTMLElement, ctx: UICtx): void {
  const s = ctx.engine.state;
  const children: Node[] = [];

  children.push(
    el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'pname' }, [`Team rating: ${formatNumber(ctx.engine.teamRating())}`]),
          el('div', { class: 'stat-line' }, [
            `Worth ${formatCash(ctx.engine.teamWorth())} · League avg stat ${formatNumber(BALANCE.leagueAvgStat(s.season.tier))}`,
          ]),
        ]),
      ]),
    ]),
    el('div', { class: 'hint' }, [
      'The letter chip is a player\'s potential. After every game, players can randomly improve or decline — big games (hits, homers, pitcher wins) tilt the odds toward growth, and high-potential players grow faster.',
    ]),
    el('h2', {}, ['Lineup']),
  );

  const renderPlayer = (p: Player): HTMLElement => {
    const cost = upgradeCostFor(ctx, p);
    const dev = devChip(p, ctx.now());
    return el('div', { class: 'card' }, [
      el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'pname' }, [
            (() => el('span', { class: 'pos-chip' }, [p.pos]))(),
            potentialChip(p),
            ` ${p.name}${p.up > 0 ? ` +${p.up}` : ''}`,
            ...(dev ? [' ', dev] : []),
          ]),
          el('div', { class: 'stat-line' }, [
            `${statLine(p)} · Value ${formatCash(playerValue(p, s.season.tier))}`,
          ]),
        ]),
        button(
          `Train ${formatCash(cost)}`,
          () => {
            if (ctx.engine.upgradePlayer(p.id)) {
              toast(`${p.name} trained! +10% stats`);
              ctx.forceRender();
            }
          },
          'btn btn-sm btn-buy',
          s.cash < cost,
        ),
      ]),
    ]);
  };

  for (const p of s.roster.filter((x) => x.pos !== 'P')) children.push(renderPlayer(p));
  children.push(el('h2', {}, ['Pitching staff']));
  for (const p of s.roster.filter((x) => x.pos === 'P')) children.push(renderPlayer(p));

  // facilities
  children.push(el('h2', {}, ['Facilities']));
  const facil: { key: FacilityKey; icon: string; name: string; desc: (lvl: number) => string }[] = [
    {
      key: 'stadium',
      icon: '🏟️',
      name: 'Stadium',
      desc: (lvl) => `${formatNumber(fans(lvl))} fans · income ×${fanMult(lvl).toFixed(2)}`,
    },
    {
      key: 'training',
      icon: '🏋️',
      name: 'Training Center',
      desc: (lvl) =>
        `Dev speed ×${devSpeedMult(lvl, s.legacyPoints).toFixed(2)} · training ${Math.round(Math.min(BALANCE.trainingDiscountCap, BALANCE.trainingDiscountPerLevel * lvl) * 100)}% cheaper`,
    },
    {
      key: 'scouting',
      icon: '🔭',
      name: 'Scouting Office',
      desc: (lvl) => `Better scout grades · faster scout cooldown (lvl ${lvl})`,
    },
  ];
  for (const f of facil) {
    const lvl = s.facilities[f.key];
    const maxed = facilityMaxed(f.key, lvl);
    const cost = facilityCost(f.key, lvl, s.season.tier);
    children.push(
      el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [
          el('div', { class: 'grow' }, [
            el('div', { class: 'pname' }, [`${f.icon} ${f.name} — Lv ${lvl}`]),
            el('div', { class: 'stat-line' }, [f.desc(lvl)]),
          ]),
          button(
            maxed ? 'MAX' : `Upgrade ${formatCash(cost)}`,
            () => {
              if (ctx.engine.buyFacility(f.key)) {
                toast(`${f.name} upgraded to Lv ${s.facilities[f.key]}!`);
                ctx.forceRender();
              }
            },
            'btn btn-sm btn-buy',
            maxed || s.cash < cost,
          ),
        ]),
      ]),
    );
  }

  host.replaceChildren(...children);
}

function upgradeCostFor(ctx: UICtx, p: Player): number {
  const s = ctx.engine.state;
  const discount = Math.min(
    BALANCE.trainingDiscountCap,
    BALANCE.trainingDiscountPerLevel * s.facilities.training,
  );
  return Math.ceil(
    BALANCE.upgradeCostBase *
      Math.pow(BALANCE.upgradeCostTierMult, s.season.tier) *
      Math.pow(BALANCE.upgradeCostGrowth, p.up) *
      (1 - discount),
  );
}

// ---------------------------------------------------------------- farm

export function renderFarm(host: HTMLElement, ctx: UICtx): void {
  const s = ctx.engine.state;
  const now = ctx.now();
  const children: Node[] = [];

  const cost = scoutCost(ctx.engine.incomeCtx(now));
  const cooldownLeft = s.scoutReadyAt - now;
  const full = s.prospects.length >= BALANCE.maxProspects;

  children.push(
    el('div', { class: 'hint' }, [
      `Prospects develop over real time (faster with the Training Center), then get called up to replace a starter. Farm: ${s.prospects.length}/${BALANCE.maxProspects}`,
    ]),
    button(
      cooldownLeft > 0
        ? `🔭 Scout ready in ${formatDuration(cooldownLeft)}`
        : full
          ? '🔭 Farm is full'
          : `🔭 Scout a prospect — ${formatCash(cost)}`,
      () => {
        const pr = ctx.engine.scout(ctx.now());
        if (pr) {
          toast(`Scouted ${pr.grade}-grade ${pr.name} (${pr.pos})!`);
          ctx.forceRender();
        }
      },
      'btn btn-block btn-primary',
      cooldownLeft > 0 || full || s.cash < cost,
    ),
    el('h2', {}, ['Your prospects']),
  );

  if (s.prospects.length === 0) {
    children.push(el('div', { class: 'hint' }, ['No prospects yet. Scout one above or open a Scout Pack in the Shop.']));
  }

  for (const pr of s.prospects) {
    children.push(renderProspect(ctx, pr));
  }

  host.replaceChildren(...children);
}

function renderProspect(ctx: UICtx, pr: Prospect): HTMLElement {
  const s = ctx.engine.state;
  const ready = pr.dev >= 100;
  const rush = rushCost(pr, ctx.engine.devSpeed());
  const buttons: HTMLElement[] = [];

  if (ready) {
    buttons.push(
      button('⬆️ Call up', () => callUpFlow(ctx, pr), 'btn btn-sm btn-primary'),
    );
  } else {
    buttons.push(
      button(
        `💎 ${rush} Rush`,
        () => {
          if (ctx.engine.rushProspect(pr.id)) {
            toast(`${pr.name} is ready for the call-up!`);
            ctx.forceRender();
          }
        },
        'btn btn-sm btn-diamond',
        s.diamonds < rush,
      ),
    );
  }
  buttons.push(
    button(
      `Sell ${formatCash(Math.floor(prospectValue(pr) * 0.3))}`,
      () => {
        ctx.engine.releaseProspect(pr.id);
        toast(`${pr.name} sold.`);
        ctx.forceRender();
      },
      'btn btn-sm',
    ),
  );

  return el('div', { class: 'card' }, [
    el('div', { class: 'row' }, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'pname' }, [
          (() => el('span', { class: `grade grade-${pr.grade}` }, [pr.grade]))(),
          ` ${pr.name}`,
          (() => el('span', { class: 'pos-chip' }, [pr.pos]))(),
        ]),
        el('div', { class: 'stat-line' }, [
          ready ? '✅ Ready for the majors!' : `Developing: ${pr.dev.toFixed(0)}%`,
        ]),
      ]),
      ...buttons,
    ]),
  ]);
}

function callUpFlow(ctx: UICtx, pr: Prospect): void {
  const s = ctx.engine.state;
  const candidates = s.roster.filter((p) => (p.pos === 'P') === (pr.pos === 'P'));
  modal((box, close) => {
    box.appendChild(el('h3', {}, [`Call up ${pr.name}`]));
    box.appendChild(
      el('div', { class: 'hint' }, [
        `Choose who they replace. The outgoing player is sold for ${Math.round(BALANCE.releaseRefundFrac * 100)}% of value.`,
      ]),
    );
    for (const p of candidates) {
      box.appendChild(
        el('div', { class: 'card' }, [
          el('div', { class: 'row' }, [
            el('div', { class: 'grow' }, [
              el('div', { class: 'pname' }, [`${p.pos} · ${p.name}`]),
              el('div', { class: 'stat-line' }, [`Rating ${formatNumber(playerRating(p))}`]),
            ]),
            button('Replace', () => {
              if (ctx.engine.callUp(pr.id, p.id)) {
                close();
                toast(`${pr.name} called up!`);
                ctx.forceRender();
              }
            }, 'btn btn-sm btn-primary'),
          ]),
        ]),
      );
    }
    box.appendChild(el('div', { class: 'row' }, [button('Cancel', close, 'btn')]));
  });
}

// ---------------------------------------------------------------- trade

interface TradeDraft {
  aiTeamIdx: number;
  receiveId: string | null;
  giveId: string | null;
  prospectIds: string[];
  cash: number;
}

const tradeDraft: TradeDraft = { aiTeamIdx: 0, receiveId: null, giveId: null, prospectIds: [], cash: 0 };

export function renderTrade(host: HTMLElement, ctx: UICtx): void {
  const s = ctx.engine.state;
  const children: Node[] = [];

  // incoming offer banner
  if (s.incomingOffer && s.incomingOffer.expiresAt > ctx.now()) {
    const off = s.incomingOffer;
    const wants = s.roster.find((p) => p.id === off.wantsPlayerId);
    children.push(
      el('div', { class: 'card deal-card' }, [
        el('div', { class: 'pname' }, [`📨 ${off.aiTeamName} wants ${wants?.name ?? 'your player'}!`]),
        el('div', { class: 'stat-line' }, [
          `They offer ${off.offersPlayer.name} (rating ${formatNumber(playerRating(off.offersPlayer))}) + ${formatCash(off.offersCash)}`,
        ]),
        el('div', { class: 'row' }, [
          button('Accept', () => {
            if (ctx.engine.acceptIncomingOffer(ctx.now())) toast('Trade completed! 🤝');
            ctx.forceRender();
          }, 'btn btn-sm btn-primary'),
          button('Decline', () => {
            ctx.engine.declineIncomingOffer();
            ctx.forceRender();
          }, 'btn btn-sm'),
        ]),
      ]),
    );
  }

  if (tradeDraft.aiTeamIdx >= s.season.aiTeams.length) tradeDraft.aiTeamIdx = 0;
  const team = s.season.aiTeams[tradeDraft.aiTeamIdx];

  // team picker
  const select = el('select');
  s.season.aiTeams.forEach((t, i) => {
    const opt = el('option', { value: String(i) }, [`${t.name} (${t.wins}-${t.losses})`]);
    if (i === tradeDraft.aiTeamIdx) opt.setAttribute('selected', '');
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    tradeDraft.aiTeamIdx = parseInt(select.value, 10);
    tradeDraft.receiveId = null;
    ctx.forceRender();
  });

  children.push(el('h2', {}, ['Trade partner']), select, el('h2', {}, [`${team.name} roster — tap to target`]));

  for (const p of team.roster) {
    const selected = tradeDraft.receiveId === p.id;
    const card = el('div', { class: `card${selected ? ' selected' : ''}` }, [
      el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'pname' }, [
            (() => el('span', { class: 'pos-chip' }, [p.pos]))(),
            potentialChip(p),
            ` ${p.name}`,
          ]),
          el('div', { class: 'stat-line' }, [
            `${statLine(p)} · Value ${formatCash(playerValue(p, s.season.tier))}`,
          ]),
        ]),
        ...(selected ? [el('span', {}, ['🎯'])] : []),
      ]),
    ]);
    card.addEventListener('click', () => {
      tradeDraft.receiveId = selected ? null : p.id;
      ctx.forceRender();
    });
    children.push(card);
  }

  // your side of the deal
  if (tradeDraft.receiveId) {
    const receive = team.roster.find((p) => p.id === tradeDraft.receiveId);
    if (receive) {
      children.push(el('h2', {}, ['Your offer']), el('div', { class: 'hint' }, ['Pick one player to send (required), plus optional prospects and cash.']));

      for (const p of s.roster) {
        const selected = tradeDraft.giveId === p.id;
        const card = el('div', { class: `card${selected ? ' selected' : ''}` }, [
          el('div', { class: 'row' }, [
            el('div', { class: 'grow' }, [
              el('div', { class: 'pname' }, [
                (() => el('span', { class: 'pos-chip' }, [p.pos]))(),
                potentialChip(p),
                ` ${p.name}`,
              ]),
              el('div', { class: 'stat-line' }, [`Value ${formatCash(playerValue(p, s.season.tier))}`]),
            ]),
            ...(selected ? [el('span', {}, ['📤'])] : []),
          ]),
        ]);
        card.addEventListener('click', () => {
          tradeDraft.giveId = selected ? null : p.id;
          ctx.forceRender();
        });
        children.push(card);
      }

      if (s.prospects.length > 0) {
        children.push(el('h2', {}, ['Add prospects (optional)']));
        for (const pr of s.prospects) {
          const selected = tradeDraft.prospectIds.includes(pr.id);
          const card = el('div', { class: `card${selected ? ' selected' : ''}` }, [
            el('div', { class: 'row' }, [
              el('div', { class: 'grow' }, [
                el('div', { class: 'pname' }, [
                  (() => el('span', { class: `grade grade-${pr.grade}` }, [pr.grade]))(),
                  ` ${pr.name}`,
                ]),
                el('div', { class: 'stat-line' }, [`Value ${formatCash(prospectValue(pr))}`]),
              ]),
              ...(selected ? [el('span', {}, ['📤'])] : []),
            ]),
          ]);
          card.addEventListener('click', () => {
            tradeDraft.prospectIds = selected
              ? tradeDraft.prospectIds.filter((id) => id !== pr.id)
              : [...tradeDraft.prospectIds, pr.id];
            ctx.forceRender();
          });
          children.push(card);
        }
      }

      // cash slider substitute: +/- buttons
      children.push(el('h2', {}, ['Add cash (optional)']));
      const cashRow = el('div', { class: 'row' }, [
        button('−', () => {
          tradeDraft.cash = Math.max(0, tradeDraft.cash - Math.ceil(s.cash * 0.1));
          ctx.forceRender();
        }, 'btn btn-sm'),
        el('div', { class: 'grow', style: 'text-align:center;font-weight:bold' }, [formatCash(tradeDraft.cash)]),
        button('+', () => {
          tradeDraft.cash = Math.min(s.cash, tradeDraft.cash + Math.ceil(s.cash * 0.1));
          ctx.forceRender();
        }, 'btn btn-sm'),
      ]);
      children.push(el('div', { class: 'card' }, [cashRow]));

      // evaluation
      const give = s.roster.find((p) => p.id === tradeDraft.giveId);
      if (give) {
        const offer: TradeOffer = {
          givePlayer: give,
          giveProspects: s.prospects.filter((pr) => tradeDraft.prospectIds.includes(pr.id)),
          giveCash: tradeDraft.cash,
          receivePlayer: receive,
          aiTeamId: team.id,
        };
        const evaln = evaluateTrade(offer, s.season.tier);
        children.push(
          el('div', { class: 'card' }, [
            el('div', { class: 'stat-line' }, [
              `They value your offer at ${formatCash(evaln.giveValue)}; they want ≥ ${formatCash(evaln.receiveValue * evaln.margin)} for ${receive.name}.`,
            ]),
            button(
              evaln.accepted ? '🤝 Propose trade — they will accept' : '❌ They would reject this',
              () => {
                const res = ctx.engine.proposeTrade(offer);
                if (res.accepted) {
                  toast(`Trade completed! ${receive.name} joins your club.`);
                  tradeDraft.receiveId = null;
                  tradeDraft.giveId = null;
                  tradeDraft.prospectIds = [];
                  tradeDraft.cash = 0;
                } else {
                  toast('Offer rejected — sweeten the deal.');
                }
                ctx.forceRender();
              },
              evaln.accepted ? 'btn btn-block btn-primary' : 'btn btn-block',
              !evaln.accepted,
            ),
          ]),
        );
      }
    }
  }

  host.replaceChildren(...children);
}

// ---------------------------------------------------------------- shop

export function renderShop(host: HTMLElement, ctx: UICtx): void {
  const s = ctx.engine.state;
  const now = ctx.now();
  const children: Node[] = [];

  // active one-time deals
  const activeOffers = s.offers.active.filter((o) => o.expiresAt > now);
  if (activeOffers.length > 0) {
    children.push(el('h2', {}, ['⏳ Limited-time deals']));
    for (const off of activeOffers) {
      const deal = DEALS.find((d) => d.id === off.dealId);
      if (!deal) continue;
      children.push(
        el('div', { class: 'card deal-card' }, [
          el('div', { class: 'row' }, [
            el('div', { class: 'grow' }, [
              el('div', { class: 'pname' }, [deal.name]),
              el('div', { class: 'stat-line' }, [deal.desc]),
              el('div', { class: 'deal-timer' }, [`Expires in ${formatDuration(off.expiresAt - now)} · one-time only`]),
            ]),
            el('div', {}, [
              el('div', { class: 'price-tag' }, [`$${deal.priceUsd.toFixed(2)}`]),
              button('Buy', async () => {
                const ok = await ctx.store.buyDeal(deal.id, deal.priceUsd);
                if (ok) {
                  ctx.engine.applyDeal(deal.id, ctx.now());
                  toast(`${deal.name} purchased! 🎉`);
                  ctx.forceRender();
                }
              }, 'btn btn-sm btn-primary'),
            ]),
          ]),
        ]),
      );
    }
  }

  // scout packs (diamonds)
  children.push(el('h2', {}, ['Scout packs (💎)']));
  const full = s.prospects.length >= BALANCE.maxProspects;
  if (full) children.push(el('div', { class: 'hint' }, ['Farm is full — trade, call up, or sell a prospect first.']));
  for (const pack of BALANCE.packs) {
    const oddsText = (['C', 'B', 'A', 'S'] as const)
      .filter((g) => (pack.odds[g] ?? 0) > 0)
      .map((g) => `${g}: ${Math.round((pack.odds[g] ?? 0) * 100)}%`)
      .join(' · ');
    children.push(
      el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [
          el('div', { class: 'grow' }, [
            el('div', { class: 'pname' }, [pack.name]),
            el('div', { class: 'odds' }, [`Odds: ${oddsText}`]),
          ]),
          button(
            `💎 ${pack.cost}`,
            () => {
              const pr = ctx.engine.buyPack(pack.id);
              if (pr) {
                packRevealModal(pr);
                ctx.forceRender();
              }
            },
            'btn btn-sm btn-diamond',
            s.diamonds < pack.cost || full,
          ),
        ]),
      ]),
    );
  }

  // rewarded diamonds
  const capLeft = BALANCE.diamondsRewardedAdDailyCap - (isToday(s.rewardedAdDay, now) ? s.rewardedAdCount : 0);
  children.push(
    el('h2', {}, ['Free diamonds']),
    button(
      capLeft > 0
        ? `📺 Watch ad: +${BALANCE.diamondsRewardedAd} 💎 (${capLeft} left today)`
        : '📺 Daily free-diamond limit reached',
      async () => {
        const ok = await ctx.ads.showRewarded('free_diamonds');
        if (ok) {
          const got = ctx.engine.grantAdDiamonds(ctx.now());
          toast(got > 0 ? `+${got} 💎!` : 'Daily limit reached.');
          ctx.forceRender();
        }
      },
      'btn btn-block',
      capLeft <= 0,
    ),
  );

  // diamond IAP packs
  children.push(el('h2', {}, ['Diamond packs']));
  for (const pack of DIAMOND_PACKS) {
    children.push(
      el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [
          el('div', { class: 'grow' }, [
            el('div', { class: 'pname' }, [`💎 ${formatNumber(pack.diamonds)} — ${pack.name}`]),
          ]),
          button(`$${pack.priceUsd.toFixed(2)}`, async () => {
            const ok = await ctx.store.buyDiamondPack(pack.id);
            if (ok) {
              ctx.engine.grantDiamonds(pack.diamonds);
              toast(`+${formatNumber(pack.diamonds)} 💎 — thank you!`);
              ctx.forceRender();
            }
          }, 'btn btn-sm btn-primary'),
        ]),
      ]),
    );
  }
  if (ctx.store.isStub()) {
    children.push(
      el('div', { class: 'hint' }, [
        'Purchases are simulated in this build. Real billing activates after app-store setup (see PUBLISHING.md).',
      ]),
    );
  }

  host.replaceChildren(...children);
}

function isToday(day: string, now: number): boolean {
  return day === new Date(now).toISOString().slice(0, 10);
}

function packRevealModal(pr: Prospect): void {
  modal((box, close) => {
    box.appendChild(el('h3', {}, ['Scout pack opened!']));
    box.appendChild(el('div', { class: 'big' }, [pr.grade === 'S' ? '🌟' : pr.grade === 'A' ? '✨' : '⚾']));
    box.appendChild(
      el('div', { class: 'pname' }, [
        (() => el('span', { class: `grade grade-${pr.grade}` }, [pr.grade]))(),
        ` ${pr.name} (${pr.pos})`,
      ]),
    );
    box.appendChild(
      el('div', { class: 'hint' }, [
        pr.grade === 'S'
          ? 'A superstar prospect! Develop them in the Farm.'
          : 'Sent to your Farm for development.',
      ]),
    );
    box.appendChild(el('div', { class: 'row' }, [button('Nice!', close, 'btn btn-primary')]));
  });
}

// ---------------------------------------------------------------- more

let lbCategory: LeaderboardCategory = 'rating';
let lbCache: { cat: string; at: number; rows: LeaderboardEntry[] } | null = null;

export function renderMore(host: HTMLElement, ctx: UICtx): void {
  const s = ctx.engine.state;
  const children: Node[] = [];

  // leaderboards
  children.push(el('h2', {}, [`🏆 Leaderboards ${ctx.leaderboard.isOnline() ? '(online)' : '(local — connect Firebase for global)'}`]));
  const tabs = el('div', { class: 'lb-tabs' });
  for (const cat of LEADERBOARD_CATEGORIES) {
    tabs.appendChild(
      button(cat.label, () => {
        lbCategory = cat.id;
        lbCache = null;
        ctx.forceRender();
      }, `btn btn-sm${lbCategory === cat.id ? ' btn-primary' : ''}`),
    );
  }
  children.push(tabs);

  const lbHost = el('div', { class: 'card' }, ['Loading…']);
  children.push(lbHost);
  const stale = !lbCache || lbCache.cat !== lbCategory || ctx.now() - lbCache.at > 15_000;
  if (stale) {
    ctx.submitScores();
    ctx.leaderboard.top(lbCategory, 20).then((rows) => {
      lbCache = { cat: lbCategory, at: ctx.now(), rows };
      fillLeaderboard(lbHost, rows);
    });
  } else if (lbCache) {
    fillLeaderboard(lbHost, lbCache.rows);
  }

  // milestones
  children.push(el('h2', {}, ['🎯 Milestones']));
  for (const m of MILESTONES) {
    const done = s.milestonesClaimed.includes(m.id);
    children.push(
      el('div', { class: 'card' }, [
        el('div', { class: 'row' }, [
          el('div', { class: 'grow' }, [el('div', { class: done ? 'stat-line' : 'pname' }, [`${done ? '✅' : '⬜'} ${m.label}`])]),
          el('span', { class: 'res diamond' }, [`+${m.diamonds} 💎`]),
        ]),
      ]),
    );
  }

  // prestige
  children.push(el('h2', {}, ['🏛️ Legacy']));
  const gain = ctx.engine.prestigeGain();
  children.push(
    el('div', { class: 'card' }, [
      el('div', { class: 'pname' }, [`Legacy points: ${s.legacyPoints} (+${Math.round(s.legacyPoints * BALANCE.legacyIncomePerPoint * 100)}% income & dev speed)`]),
      el('div', { class: 'stat-line' }, [
        ctx.engine.prestigeAvailable()
          ? `Start a new franchise now to earn +${gain} legacy points. Your roster, cash and league reset; legacy, career stats and purchases persist.`
          : 'Win a championship to unlock Start a New Franchise.',
      ]),
      button(
        `🏛️ Start new franchise (+${gain} legacy)`,
        () => {
          modal((box, close) => {
            box.appendChild(el('h3', {}, ['Start a new franchise?']));
            box.appendChild(
              el('div', { class: 'hint' }, [
                `You'll gain ${gain} legacy points but reset your roster, cash, prospects, facilities and league. This cannot be undone.`,
              ]),
            );
            box.appendChild(
              el('div', { class: 'row' }, [
                button('Do it', () => {
                  ctx.engine.prestige(ctx.now());
                  close();
                  toast(`🏛️ New franchise founded! +${gain} legacy points`);
                  ctx.forceRender();
                }, 'btn btn-primary'),
                button('Cancel', close, 'btn'),
              ]),
            );
          });
        },
        'btn btn-block',
        !ctx.engine.prestigeAvailable(),
      ),
    ]),
  );

  // career stats
  children.push(el('h2', {}, ['📊 Career']));
  children.push(
    el('div', { class: 'card' }, [
      el('div', { class: 'stat-line' }, [`Record: ${s.career.wins}-${s.career.losses} · HR: ${formatNumber(s.career.hr)} · Championships: ${s.career.championships}`]),
      el('div', { class: 'stat-line' }, [`Seasons: ${s.career.seasons} · Promotions: ${s.career.promotions} · Trades: ${s.career.tradesCompleted} · Packs: ${s.career.packsOpened}`]),
      el('div', { class: 'stat-line' }, [`Highest league: ${LEAGUES[s.career.highestTier].name} · Franchises: ${s.prestigeCount + 1}`]),
    ]),
  );

  // settings
  children.push(el('h2', {}, ['⚙️ Settings']));
  children.push(
    el('div', { class: 'card' }, [
      button('✏️ Rename team', () => renameFlow(ctx), 'btn btn-block'),
      button('🗑️ Reset save (delete everything)', () => {
        modal((box, close) => {
          box.appendChild(el('h3', {}, ['Delete your save?']));
          box.appendChild(el('div', { class: 'hint' }, ['This wipes ALL progress including legacy and purchases. There is no undo.']));
          box.appendChild(
            el('div', { class: 'row' }, [
              button('Delete everything', () => {
                localStorage.removeItem('dugout-dynasty-save');
                location.reload();
              }, 'btn btn-danger'),
              button('Cancel', close, 'btn btn-primary'),
            ]),
          );
        });
      }, 'btn btn-block btn-danger'),
    ]),
    el('div', { class: 'hint' }, ['Dugout Dynasty v0.1 · an idle baseball franchise game']),
  );

  host.replaceChildren(...children);
}

function fillLeaderboard(host: HTMLElement, rows: LeaderboardEntry[]): void {
  const table = el('table', { class: 'standings' }, [
    el('tr', {}, [el('th', {}, ['#']), el('th', {}, ['Team']), el('th', { class: 'num' }, ['Score'])]),
    ...rows.map((r, i) =>
      el('tr', { class: r.isYou ? 'you' : '' }, [
        el('td', {}, [String(i + 1)]),
        el('td', {}, [`${r.teamName}${r.isYou ? ' (you)' : ''}`]),
        el('td', { class: 'num' }, [formatNumber(r.score)]),
      ]),
    ),
  ]);
  host.replaceChildren(table);
}

export function renameFlow(ctx: UICtx): void {
  modal((box, close) => {
    box.appendChild(el('h3', {}, ['Name your franchise']));
    const input = el('input', { type: 'text', maxlength: '24', placeholder: 'e.g. Rocket City Sluggers' });
    input.value = ctx.engine.state.teamName === 'My Franchise' ? '' : ctx.engine.state.teamName;
    box.appendChild(input);
    box.appendChild(
      el('div', { class: 'row' }, [
        button('Save', () => {
          const name = input.value.trim();
          if (name.length >= 2) {
            ctx.engine.state.teamName = name.slice(0, 24);
            close();
            ctx.forceRender();
          }
        }, 'btn btn-primary'),
        button('Cancel', close, 'btn'),
      ]),
    );
    setTimeout(() => input.focus(), 50);
  });
}

// ---------------------------------------------------------------- season-end / offline modals

export function seasonEndModal(ctx: UICtx, rank: number, champion: boolean, promoted: boolean, newTier: number, diamonds: number): void {
  modal((box, close) => {
    box.appendChild(el('h3', {}, [champion ? '🏆 CHAMPIONS!' : 'Season over']));
    box.appendChild(el('div', { class: 'big' }, [champion ? '🏆' : promoted ? '📈' : '⚾']));
    const lines: string[] = [`You finished #${rank}.`];
    if (promoted) lines.push(`Promoted to the ${LEAGUES[newTier].name}!`);
    if (diamonds > 0) lines.push(`Earned +${diamonds} 💎`);
    if (!promoted && !champion) lines.push(`Finish top ${BALANCE.promotionRank} to move up.`);
    const list = el('div', { class: 'modal-list' });
    for (const l of lines) list.appendChild(el('div', {}, [l]));
    box.appendChild(list);
    box.appendChild(el('div', { class: 'row' }, [button('Play on', () => {
      close();
      // natural break — the policy inside the service decides if one actually shows
      void ctx.ads.showInterstitial();
    }, 'btn btn-primary')]));
  });
}

export { infoModal };
