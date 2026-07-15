import { Engine, newGameState } from './core/state';
import { loadGame, saveGame } from './core/save';
import { resolveOffline } from './core/offline';
import { formatCash, formatDuration } from './core/format';
import { InterstitialPolicy } from './monetization/AdService';
import { StubAds } from './monetization/StubAds';
import { StubStore } from './monetization/StoreService';
import { LeaderboardService } from './online/LeaderboardService';
import { StubLeaderboard } from './online/StubLeaderboard';
import { FirebaseLeaderboard } from './online/FirebaseLeaderboard';
import { el, infoModal, toast } from './ui/dom';
import {
  renameFlow,
  renderFarm,
  renderHome,
  renderMore,
  renderShop,
  renderTeam,
  renderTopbar,
  renderTrade,
  seasonEndModal,
  TabId,
  UICtx,
  updateHomeLive,
} from './ui/screens';

// ---------------------------------------------------------------- bootstrap

const now = () => Date.now();

let state = loadGame();
const firstRun = state === null;
if (!state) {
  state = newGameState((Math.random() * 0xffffffff) >>> 0, 'My Franchise', now());
}
const engine = new Engine(state);

// stable anonymous player id for leaderboards
const PID_KEY = 'dugout-dynasty-pid';
let playerId = localStorage.getItem(PID_KEY) ?? '';
if (!playerId) {
  playerId = 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem(PID_KEY, playerId);
}

// services: stubs by default; Firebase board activates when configured
const adPolicy = new InterstitialPolicy(engine.state.createdAt);
const ads = new StubAds(adPolicy);
const store = new StubStore();
let leaderboard: LeaderboardService = new StubLeaderboard();
if (FirebaseLeaderboard.available()) {
  const fb = new FirebaseLeaderboard();
  fb.init()
    .then(() => {
      leaderboard = fb;
    })
    .catch(() => {
      /* keep stub */
    });
}

// ---------------------------------------------------------------- UI shell

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'home', icon: '⚾', label: 'Ballpark' },
  { id: 'team', icon: '🧢', label: 'Team' },
  { id: 'farm', icon: '🌱', label: 'Farm' },
  { id: 'trade', icon: '🤝', label: 'Trade' },
  { id: 'shop', icon: '💎', label: 'Shop' },
  { id: 'more', icon: '🏆', label: 'More' },
];

let activeTab: TabId = 'home';
let lastInteraction = 0;

document.addEventListener('pointerdown', () => {
  lastInteraction = now();
});

const topbarHost = document.getElementById('topbar')!;
const screenHost = document.getElementById('screen')!;
const tabbarHost = document.getElementById('tabbar')!;

function shopBadgeCount(): number {
  const t = now();
  return engine.state.offers.active.filter((o) => o.expiresAt > t).length;
}

function tradeBadgeCount(): number {
  const off = engine.state.incomingOffer;
  return off && off.expiresAt > now() ? 1 : 0;
}

// tab bar is built once; renders only update classes/badges so buttons are
// never detached mid-tap
const tabButtons = new Map<TabId, HTMLButtonElement>();

function buildTabbar(): void {
  tabbarHost.replaceChildren(
    ...TABS.map((t) => {
      const b = el('button', { class: 'tab' }, [el('span', { class: 'ico' }, [t.icon]), t.label]);
      b.addEventListener('click', () => {
        activeTab = t.id;
        render(true);
      });
      tabButtons.set(t.id, b);
      return b;
    }),
  );
}

function updateTabbar(): void {
  for (const t of TABS) {
    const b = tabButtons.get(t.id)!;
    b.classList.toggle('active', t.id === activeTab);
    const badge = t.id === 'shop' ? shopBadgeCount() : t.id === 'trade' ? tradeBadgeCount() : 0;
    const existing = b.querySelector('.badge');
    if (badge > 0) {
      if (existing) existing.textContent = String(badge);
      else b.appendChild(el('span', { class: 'badge' }, [String(badge)]));
    } else {
      existing?.remove();
    }
  }
}

const ctx: UICtx = {
  engine,
  ads,
  store,
  get leaderboard() {
    return leaderboard;
  },
  playerId,
  now,
  forceRender: () => render(true),
  submitScores,
} as UICtx & { leaderboard: LeaderboardService };

function submitScores(): void {
  void leaderboard.submit(playerId, engine.state.teamName, {
    rating: engine.teamRating(),
    worth: engine.teamWorth(),
    hr: engine.state.career.hr,
    championships: engine.state.career.championships,
  });
}

const SCREENS: Record<TabId, (host: HTMLElement, ctx: UICtx) => void> = {
  home: renderHome,
  team: renderTeam,
  farm: renderFarm,
  trade: renderTrade,
  shop: renderShop,
  more: renderMore,
};

let lastDomRender = 0;

function render(force = false): void {
  // don't yank the DOM out from under an in-flight tap
  if (!force && now() - lastInteraction < 450) return;
  lastDomRender = now();
  renderTopbar(topbarHost, ctx);
  updateTabbar();
  const scroll = screenHost.scrollTop;
  SCREENS[activeTab](screenHost, ctx);
  if (!force) screenHost.scrollTop = scroll;
}

// ---------------------------------------------------------------- engine events

engine.events.gameFinished = (result, income) => {
  const won = result.homeWin;
  if (activeTab === 'home') {
    toast(`${won ? '✅ WIN' : '❌ LOSS'} ${result.homeRuns}–${result.awayRuns} · +${formatCash(income)}`, 1800);
  }
};

let resolvingOffline = false;

engine.events.seasonEnded = (summary) => {
  submitScores();
  // seasons that finished while away are covered by the offline summary —
  // don't stack a modal per season
  if (!resolvingOffline) {
    seasonEndModal(ctx, summary.rank, summary.champion, summary.promoted, summary.newTier, summary.diamondsEarned);
  }
};

function resolveOfflineQuiet(t: number): ReturnType<typeof resolveOffline> {
  resolvingOffline = true;
  try {
    return resolveOffline(engine, t);
  } finally {
    resolvingOffline = false;
  }
}

engine.events.milestoneReached = (label, diamonds) => {
  toast(`🎯 Milestone: ${label} · +${diamonds} 💎`, 3500);
};

engine.events.offerAppeared = () => {
  toast('⏳ A limited-time deal appeared in the Shop!', 3500);
};

engine.events.incomingTradeOffer = (offer) => {
  toast(`📨 ${offer.aiTeamName} sent you a trade offer!`, 3500);
};

// ---------------------------------------------------------------- main loop

let lastTick = now();

function loop(): void {
  const t = now();
  const dt = t - lastTick;
  lastTick = t;

  if (dt > 60_000) {
    // device slept / tab frozen — resolve through the offline path
    const summary = resolveOfflineQuiet(t);
    if (summary) showOfflineSummary(summary.awayMs, summary.gamesPlayed, summary.wins, summary.losses, summary.cashEarned);
  } else if (dt > 0) {
    engine.tick(dt, t);
  }
  // full DOM re-render at 1Hz; the live canvas updates every frame in place
  if (t - lastDomRender > 1000) render();
  else if (activeTab === 'home') updateHomeLive(ctx);
  requestAnimationFrame(loop);
}

function showOfflineSummary(awayMs: number, games: number, wins: number, losses: number, cash: number): void {
  void infoModal('While you were gone…', [
    `Away for ${formatDuration(awayMs)} (progress capped at 8h)`,
    `Games played: ${games} (${wins}W – ${losses}L)`,
    `Cash earned: ${formatCash(cash)}`,
  ], 'Back to the dugout');
}

// ---------------------------------------------------------------- persistence

setInterval(() => saveGame(engine.state), 10_000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    engine.state.lastSeen = now();
    saveGame(engine.state);
  }
});
window.addEventListener('pagehide', () => saveGame(engine.state));

// ---------------------------------------------------------------- go

// debug/testing handle (also handy from the browser console)
(window as unknown as { __dd: { engine: Engine } }).__dd = { engine };

const offline = firstRun ? null : resolveOfflineQuiet(now());
buildTabbar();
render(true);
if (offline && offline.gamesPlayed > 0) {
  showOfflineSummary(offline.awayMs, offline.gamesPlayed, offline.wins, offline.losses, offline.cashEarned);
}
if (firstRun) {
  renameFlow(ctx);
}
lastTick = now();
requestAnimationFrame(loop);
