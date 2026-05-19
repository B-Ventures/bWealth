/**
 * Fetches the live XAU/USD spot price from goldapi.io and writes it to
 * Firestore goldPrice/latest. Designed to run as a scheduled GitHub Actions job.
 *
 * Required env vars:
 *   GOLD_API_KEY              — goldapi.io access token
 *   FIREBASE_SERVICE_ACCOUNT  — full JSON content of the Firebase service account key
 *
 * Run manually:
 *   GOLD_API_KEY=... FIREBASE_SERVICE_ACCOUNT=$(cat serviceAccount.json) npx tsx scripts/updateGoldPrice.ts
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const goldApiKey = process.env.GOLD_API_KEY;
if (!goldApiKey) {
  console.error('GOLD_API_KEY env var is required.');
  process.exit(1);
}

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error('FIREBASE_SERVICE_ACCOUNT env var is required (JSON string of service account key).');
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);
initializeApp({ credential: cert(serviceAccount), projectId: firebaseConfig.projectId });
const db = getFirestore(firebaseConfig.firestoreDatabaseId);

const res = await fetch('https://www.goldapi.io/api/XAU/USD', {
  headers: { 'x-access-token': goldApiKey, 'Content-Type': 'application/json' }
});
if (!res.ok) throw new Error(`goldapi.io responded ${res.status} ${res.statusText}`);
const data = await res.json() as any;
const spotUsd: number = data?.price;
if (!spotUsd || isNaN(spotUsd)) throw new Error(`Unexpected response from goldapi.io: ${JSON.stringify(data)}`);

await db.collection('goldPrice').doc('latest').set({
  spotUsd,
  timestamp: new Date().toISOString(),
  source: 'https://www.goldapi.io/api/XAU/USD',
});

console.log(`goldPrice/latest updated: spotUsd=${spotUsd} at ${new Date().toISOString()}`);
process.exit(0);
