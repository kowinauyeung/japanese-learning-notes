import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ensureAdcQuotaProject } from './allow-user.shared';
import { rebuildVocabularyStats, verifyVocabularyStats } from './backfill-vocabulary-stats.lib';
import { parseBackfillVocabularyStatsArgs } from './backfill-vocabulary-stats.shared';

/**
 * Rebuild every user's cached vocabulary statistics from its source entries.
 *
 *   yarn backfill:vocabulary-stats          # goitei-dev, sample 20 users
 *   yarn backfill:vocabulary-stats prod     # production, sample 20 users
 *   yarn backfill:vocabulary-stats prod --sample 50
 *
 * A missing document is created as zero before its source scan. From that
 * point every client mutation applies its atomic delta. The subsequent
 * transaction reads both the source query and stats document before replacing
 * the counters, so a concurrent delta conflicts and retries instead of being
 * silently overwritten by an older scan.
 */

const parsed = parseBackfillVocabularyStatsArgs(process.argv.slice(2));

if (!parsed.ok) {
  for (const error of parsed.errors) console.error(error);
  console.error(parsed.usage);
  process.exit(1);
}

const { projectId, sampleSize } = parsed;

if (getApps().length === 0) {
  const key = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!key) ensureAdcQuotaProject(process.env, projectId);
  initializeApp({ credential: key ? cert(key) : applicationDefault(), projectId });
}

const db = getFirestore();
const users = await db.collection('users').get();
const activeUserIds: string[] = [];
let deleted = 0;

for (const user of users.docs) {
  const result = await rebuildVocabularyStats(db, user.id);
  if (result === 'deleted') deleted += 1;
  else activeUserIds.push(user.id);
}

const sampledIds = evenlySpacedSample(activeUserIds, sampleSize);
for (const uid of sampledIds) await verifyVocabularyStats(db, uid);

console.log(
  `backfilled ${activeUserIds.length} active users on ${projectId}; ` +
    `removed stale stats for ${deleted} deleted users; verified ${sampledIds.length} sampled users.`,
);

function evenlySpacedSample(ids: string[], requested: number): string[] {
  if (ids.length <= requested) return ids;
  return Array.from(
    { length: requested },
    (_, index) => ids[Math.floor((index * ids.length) / requested)],
  ).filter((uid): uid is string => Boolean(uid));
}
