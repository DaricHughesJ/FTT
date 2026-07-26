import { LeaderboardCategory } from '../core/stats';
import { LeaderboardEntry, LeaderboardScores, LeaderboardService, sanitizeTeamName } from './LeaderboardService';
import { FIREBASE_CONFIG } from './firebase-config';

/**
 * Firestore-backed leaderboard. Activates only when FIREBASE_CONFIG is filled
 * in AND the `firebase` package is installed; otherwise construction throws
 * and main.ts falls back to StubLeaderboard.
 *
 * Data model: collection `leaderboard`, one doc per player id:
 *   { teamName, rating, worth, hr, championships, updatedAt }
 * Reads use orderBy(category) + limit(n). Scores are client-submitted and
 * therefore spoofable — acceptable for a casual board; swap in Play Games /
 * Game Center for tamper-resistant boards at store time.
 */
export class FirebaseLeaderboard implements LeaderboardService {
  private db: any;
  private fs: any;

  static available(): boolean {
    return FIREBASE_CONFIG !== null;
  }

  async init(): Promise<void> {
    if (!FIREBASE_CONFIG) throw new Error('no firebase config');
    // specifiers built at runtime so bundlers don't try to resolve an
    // optional dependency that is only installed once Firebase is configured
    const dyn = (spec: string) => import(/* @vite-ignore */ spec);
    const app = await dyn('firebase/' + 'app');
    this.fs = await dyn('firebase/' + 'firestore');
    const fbApp = app.initializeApp(FIREBASE_CONFIG);
    this.db = this.fs.getFirestore(fbApp);
  }

  isOnline(): boolean {
    return true;
  }

  async submit(playerId: string, teamName: string, scores: LeaderboardScores): Promise<void> {
    const ref = this.fs.doc(this.db, 'leaderboard', playerId);
    await this.fs.setDoc(ref, {
      teamName: sanitizeTeamName(teamName),
      rating: Math.floor(scores.rating),
      worth: Math.floor(scores.worth),
      hr: Math.floor(scores.hr),
      championships: Math.floor(scores.championships),
      updatedAt: Date.now(),
    });
  }

  async top(category: LeaderboardCategory, limit: number): Promise<LeaderboardEntry[]> {
    const q = this.fs.query(
      this.fs.collection(this.db, 'leaderboard'),
      this.fs.orderBy(category, 'desc'),
      this.fs.limit(limit),
    );
    const snap = await this.fs.getDocs(q);
    const rows: LeaderboardEntry[] = [];
    snap.forEach((doc: any) => {
      const d = doc.data();
      rows.push({ teamName: d.teamName ?? '???', score: d[category] ?? 0 });
    });
    return rows;
  }
}
