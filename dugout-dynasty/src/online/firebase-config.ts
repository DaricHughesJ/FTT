/**
 * Firebase config — paste your project's web config here to turn on ONLINE
 * leaderboards. Until then the game silently uses the local stub board.
 *
 * Setup (~5 minutes, free tier is plenty):
 *   1. https://console.firebase.google.com → Add project
 *   2. Add a Web app; copy the config object it shows you over the nulls below
 *   3. Build > Firestore Database → Create database (production mode)
 *   4. Rules tab → paste the rules from PUBLISHING.md (public read,
 *      score-shaped writes only)
 *   5. npm install firebase
 */
export const FIREBASE_CONFIG: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
} | null = null;

// Example:
// export const FIREBASE_CONFIG = {
//   apiKey: 'AIza...',
//   authDomain: 'dugout-dynasty.firebaseapp.com',
//   projectId: 'dugout-dynasty',
//   appId: '1:1234567890:web:abc123',
// };
