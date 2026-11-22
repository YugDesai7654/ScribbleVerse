import { User } from '../model/user';
import { GameResult } from '../model/gameResult';

const MAX_NAME_LENGTH = 20;
// Must match the unique index in model/user.ts.
const COLLATION = { locale: 'en', strength: 2 } as const;

export type RenamedUser = { userId: string; from: string; to: string };

/**
 * One-off migration that must run before the unique display name index is
 * built. The oldest account keeps its name; every later account whose name
 * matches ignoring case becomes `name + n` (smallest free n, trimmed to fit
 * 20 characters). Their past game results are renamed to match.
 */
export async function dedupeDisplayNames(): Promise<{ renamed: RenamedUser[] }> {
  // Group with the index's own collation, so "equal" means exactly what the
  // unique index will consider equal (not just equal after toLowerCase).
  const groups = await User.aggregate<{ ids: unknown[] }>(
    [
      { $sort: { createdAt: 1, _id: 1 } },
      { $group: { _id: '$displayName', ids: { $push: '$_id' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ],
    { collation: COLLATION }
  );

  const renamed: RenamedUser[] = [];
  for (const group of groups) {
    // $push follows the pre-group sort, so the oldest account is first.
    for (const id of group.ids.slice(1)) {
      const user = await User.findById(id).select('displayName').lean<{ _id: unknown; displayName: string }>();
      if (!user) continue;

      let n = 1;
      let candidate: string;
      do {
        const suffix = String(n);
        candidate = user.displayName.slice(0, MAX_NAME_LENGTH - suffix.length) + suffix;
        n += 1;
      } while (await User.exists({ displayName: candidate }).collation(COLLATION));

      await User.updateOne({ _id: user._id }, { $set: { displayName: candidate } });
      await GameResult.updateMany({ userId: user._id }, { $set: { displayName: candidate } });
      renamed.push({ userId: String(user._id), from: user.displayName, to: candidate });
    }
  }

  return { renamed };
}

async function main() {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ quiet: true });
  const { default: mongoose } = await import('mongoose');
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set');

  await mongoose.connect(uri);
  try {
    const { renamed } = await dedupeDisplayNames();
    for (const r of renamed) console.log(`${r.userId}: "${r.from}" -> "${r.to}"`);
    console.log(`Renamed ${renamed.length} account(s). Restart the server to build the unique index.`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
