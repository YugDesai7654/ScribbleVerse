import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { User } from '../model/user';
import { GameResult } from '../model/gameResult';
import { dedupeDisplayNames } from '../scripts/dedupeDisplayNames';

/**
 * Unique display names against a real MongoDB (in memory, never Atlas): the
 * one-off migration for pre-existing duplicates, and the collation index that
 * stops new ones.
 */

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), GameResult.init()]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

/** Removes the unique name index so legacy duplicate data can be seeded. */
async function dropNameIndex() {
  for (const index of await User.collection.indexes()) {
    if (index.key && 'displayName' in index.key && index.name) await User.collection.dropIndex(index.name);
  }
}

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), GameResult.deleteMany({})]);
  await dropNameIndex();
});

let counter = 0;
function seedUser(displayName: string, createdAt: Date) {
  counter += 1;
  return User.create({ email: `p${counter}@example.com`, passwordHash: 'x', displayName, createdAt });
}

describe('dedupeDisplayNames', () => {
  it('keeps the oldest account name and renames later case-insensitive duplicates', async () => {
    const oldest = await seedUser('Sam', new Date('2026-01-01'));
    const middle = await seedUser('sam', new Date('2026-02-01'));
    const newest = await seedUser('SAM', new Date('2026-03-01'));
    await GameResult.create({
      gameId: 'g1', userId: middle._id, displayName: 'sam', roomId: 'R1', score: 10, won: false,
    });

    const { renamed } = await dedupeDisplayNames();
    expect(renamed).toHaveLength(2);
    await User.syncIndexes();

    const users = await User.find({}).lean<{ _id: unknown; displayName: string }[]>();
    const lowered = users.map((u) => u.displayName.toLowerCase());
    expect(new Set(lowered).size).toBe(users.length);
    users.forEach((u) => expect(u.displayName.length).toBeLessThanOrEqual(20));

    const names = Object.fromEntries(users.map((u) => [String(u._id), u.displayName]));
    expect(names[String(oldest._id)]).toBe('Sam');
    expect(names[String(middle._id)]).toBe('sam1');
    expect(names[String(newest._id)]).toBe('SAM2');

    const result = await GameResult.findOne({ gameId: 'g1' }).lean<{ displayName: string }>();
    expect(result?.displayName).toBe(names[String(middle._id)]);
  });

  it('trims long names so the renamed result still fits in 20 characters', async () => {
    const long = 'a'.repeat(20);
    await seedUser(long, new Date('2026-01-01'));
    await seedUser(long.toUpperCase(), new Date('2026-02-01'));
    const { renamed } = await dedupeDisplayNames();
    expect(renamed).toHaveLength(1);
    expect(renamed[0].to).toHaveLength(20);
    expect(renamed[0].to.toLowerCase()).not.toBe(long);
  });
});

describe('dedupeDisplayNames collation', () => {
  it('treats names equal under the index collation as duplicates, beyond toLowerCase', async () => {
    await seedUser('\uFB01sh', new Date('2026-01-01')); // "fi" ligature
    await seedUser('FISH', new Date('2026-02-01'));
    await seedUser('sam', new Date('2026-01-01'));
    await seedUser('\uFF33\uFF41\uFF4D', new Date('2026-02-01')); // full-width "Sam"

    const { renamed } = await dedupeDisplayNames();
    expect(renamed.map((r) => r.from).sort()).toEqual(['FISH', '\uFF33\uFF41\uFF4D'].sort());
    // The index must now build without a duplicate-key failure.
    await expect(User.syncIndexes()).resolves.toBeDefined();
  });
});

describe('display name index', () => {
  it('rejects a name that differs only by case', async () => {
    await User.syncIndexes();
    await seedUser('Sam', new Date());
    await expect(seedUser('SAM', new Date())).rejects.toMatchObject({ code: 11000 });
  });
});
