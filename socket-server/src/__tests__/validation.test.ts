import { describe, it, expect } from 'vitest';
import {
  validate,
  createRoomSchema,
  joinRoomSchema,
  chatMessageSchema,
  drawingSchema,
  chooseWordSchema,
  updateSettingsSchema,
  kickPlayerSchema,
  startGameSchema,
} from '../validation/schemas';
import { CATEGORIES } from '../game/words';

describe('createRoomSchema', () => {
  it('accepts a minimal valid payload and fills in defaults', () => {
    expect(validate(createRoomSchema, { roomId: 'ABC123', name: 'Alice' })).toEqual({
      roomId: 'ABC123',
      name: 'Alice',
      rounds: 3,
      timePerRound: 60,
      maxPlayers: 8,
    });
  });

  it('rejects a roomId that is too short', () => {
    expect(validate(createRoomSchema, { roomId: 'AB', name: 'Alice' })).toBeNull();
  });

  it('rejects a roomId with non-alphanumeric characters', () => {
    expect(validate(createRoomSchema, { roomId: 'AB-123', name: 'Alice' })).toBeNull();
  });

  it('rejects a missing name', () => {
    expect(validate(createRoomSchema, { roomId: 'ABC123' })).toBeNull();
  });

  it('rejects an out-of-range maxPlayers', () => {
    expect(validate(createRoomSchema, { roomId: 'ABC123', name: 'Alice', maxPlayers: 50 })).toBeNull();
  });
});

describe('joinRoomSchema', () => {
  it('accepts a valid payload', () => {
    expect(validate(joinRoomSchema, { roomId: 'ABC123', name: 'Bob' })).toEqual({
      roomId: 'ABC123',
      name: 'Bob',
    });
  });

  it('rejects an empty name', () => {
    expect(validate(joinRoomSchema, { roomId: 'ABC123', name: '' })).toBeNull();
  });
});

describe('chatMessageSchema', () => {
  it('accepts a valid message', () => {
    expect(validate(chatMessageSchema, { roomId: 'ABC123', user: 'Alice', text: 'hello' })).not.toBeNull();
  });

  it('rejects a message over 200 characters', () => {
    const longText = 'a'.repeat(201);
    expect(validate(chatMessageSchema, { roomId: 'ABC123', user: 'Alice', text: longText })).toBeNull();
  });

  it('rejects an empty message', () => {
    expect(validate(chatMessageSchema, { roomId: 'ABC123', user: 'Alice', text: '' })).toBeNull();
  });
});

describe('drawingSchema', () => {
  const segment = {
    roomId: 'ABC123',
    strokeId: 's1',
    from: { x: 0.1, y: 0.2 },
    to: { x: 0.3, y: 0.4 },
    color: '#1a2b3c',
    size: 6,
  };

  it('accepts a valid normalised line segment', () => {
    expect(validate(drawingSchema, segment)).not.toBeNull();
  });

  it('accepts a null `from` (the first point of a new stroke)', () => {
    expect(validate(drawingSchema, { ...segment, from: null })).not.toBeNull();
  });

  it('rejects coordinates outside the 0..1 canvas range', () => {
    expect(validate(drawingSchema, { ...segment, to: { x: 1.5, y: 0.2 } })).toBeNull();
  });

  it('rejects colours that are not #rrggbb hex', () => {
    expect(validate(drawingSchema, { ...segment, color: 'url(javascript:alert(1))' })).toBeNull();
  });

  it('rejects brush sizes outside 1..60', () => {
    expect(validate(drawingSchema, { ...segment, size: 500 })).toBeNull();
  });
});

describe('chooseWordSchema', () => {
  it('accepts a valid payload', () => {
    expect(validate(chooseWordSchema, { roomId: 'ABC123', word: 'cat', round: 1 })).not.toBeNull();
  });

  it('rejects a non-positive round number', () => {
    expect(validate(chooseWordSchema, { roomId: 'ABC123', word: 'cat', round: 0 })).toBeNull();
  });
});

describe('updateSettingsSchema', () => {
  const base = { roomId: 'ABC123' };

  it('accepts a partial update of a single setting', () => {
    expect(validate(updateSettingsSchema, { ...base, rounds: 4 })).toEqual({ ...base, rounds: 4 });
  });

  it('accepts every category and rejects unknown ones', () => {
    for (const category of CATEGORIES) {
      expect(validate(updateSettingsSchema, { ...base, category })).toEqual({ ...base, category });
    }
    expect(validate(updateSettingsSchema, { ...base, category: 'dinosaurs' })).toBeNull();
  });

  it('splits, trims, lowercases and de-duplicates custom words', () => {
    expect(validate(updateSettingsSchema, { ...base, customWords: ' Rocket  Ship, comet,,rocket ship ' })).toEqual({
      ...base,
      customWords: ['rocket ship', 'comet'],
    });
  });

  it('treats an empty textarea as no custom words', () => {
    expect(validate(updateSettingsSchema, { ...base, customWords: '' })).toEqual({ ...base, customWords: [] });
  });

  it('rejects custom words outside 2–30 characters or with symbols', () => {
    expect(validate(updateSettingsSchema, { ...base, customWords: 'ok, x' })).toBeNull();
    expect(validate(updateSettingsSchema, { ...base, customWords: 'a'.repeat(31) })).toBeNull();
    expect(validate(updateSettingsSchema, { ...base, customWords: 'hello<script>' })).toBeNull();
  });

  it('rejects more than 200 custom words', () => {
    const words = (n: number) =>
      Array.from({ length: n }, (_, i) => `w${i.toString(26).replace(/\d/g, (d) => 'qrstuvwxyz'[Number(d)])}`).join(',');
    expect(validate(updateSettingsSchema, { ...base, customWords: words(200) })).not.toBeNull();
    expect(validate(updateSettingsSchema, { ...base, customWords: words(201) })).toBeNull();
  });

  it('rejects out-of-range numeric settings', () => {
    expect(validate(updateSettingsSchema, { ...base, rounds: 0 })).toBeNull();
    expect(validate(updateSettingsSchema, { ...base, timePerRound: 500 })).toBeNull();
    expect(validate(updateSettingsSchema, { ...base, maxPlayers: 1 })).toBeNull();
  });
});

describe('kickPlayerSchema and reconnect token', () => {
  it('requires a target player ID', () => {
    expect(validate(kickPlayerSchema, { roomId: 'ABC123', playerId: 'abc' })).not.toBeNull();
    expect(validate(kickPlayerSchema, { roomId: 'ABC123' })).toBeNull();
  });

  it('accepts an optional reconnect token on join', () => {
    expect(validate(joinRoomSchema, { roomId: 'ABC123', name: 'Al', reconnectToken: 'tok' })).toMatchObject({ reconnectToken: 'tok' });
    expect(validate(joinRoomSchema, { roomId: 'ABC123', name: 'Al', reconnectToken: 'x'.repeat(65) })).toBeNull();
  });
});

describe('startGameSchema', () => {
  it('accepts no payload or an empty object', () => {
    expect(validate(startGameSchema, undefined)).toBeUndefined();
    expect(validate(startGameSchema, {})).toEqual({});
  });
  it('rejects unknown keys such as a client-supplied room', () => {
    expect(validate(startGameSchema, { roomId: 'X' })).toBeNull();
  });
});
