/**
 * Seeds the `goldCountries` Firestore collection with country configs.
 *
 * Run once (or whenever premium factors are updated):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json npx tsx scripts/seedGoldCountries.ts
 *
 * A service account JSON with Firestore write access is required.
 * Download it from: Firebase Console → Project Settings → Service Accounts.
 */
import { initializeApp, cert, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { COUNTRY_CONFIGS } from '../src/goldCountries';
import * as path from 'path';
import * as fs from 'fs';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || path.join(process.cwd(), 'serviceAccount.json');

if (!fs.existsSync(credPath)) {
  console.error(`Service account not found at ${credPath}`);
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS or place serviceAccount.json in project root.');
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));

import firebaseConfig from '../firebase-applet-config.json';

let app: App;
try {
  app = initializeApp({ credential: cert(serviceAccount), projectId: firebaseConfig.projectId });
} catch {
  // Already initialized (e.g. re-run)
  const { getApp } = await import('firebase-admin/app');
  app = getApp();
}

const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const batch = db.batch();

for (const [code, config] of Object.entries(COUNTRY_CONFIGS)) {
  batch.set(db.collection('goldCountries').doc(code), {
    ...config,
    updatedAt: new Date().toISOString(),
  });
}

await batch.commit();
console.log(`Seeded ${Object.keys(COUNTRY_CONFIGS).length} countries into goldCountries collection.`);
process.exit(0);
