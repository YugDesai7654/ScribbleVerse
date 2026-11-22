import { describe, it, expect } from 'vitest';
import {
  validate,
  createRoomSchema,
  joinRoomSchema,
  chatMessageSchema,
  drawingSchema,
  chooseWordSchema,
} from '../validation/schemas';

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
