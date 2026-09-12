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
  it('accepts a valid line segment', () => {
    const result = validate(drawingSchema, {
      roomId: 'ABC123',
      prevPoint: { x: 1, y: 2 },
      currentPoint: { x: 3, y: 4 },
      color: '#000000',
    });
    expect(result).not.toBeNull();
  });

  it('accepts a null prevPoint (the first point of a new stroke)', () => {
    const result = validate(drawingSchema, {
      roomId: 'ABC123',
      prevPoint: null,
      currentPoint: { x: 3, y: 4 },
      color: '#000000',
    });
    expect(result).not.toBeNull();
  });

  it('rejects a payload missing currentPoint', () => {
    expect(validate(drawingSchema, { roomId: 'ABC123', color: '#000000' })).toBeNull();
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
