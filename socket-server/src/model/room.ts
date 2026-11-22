import mongoose from 'mongoose';

// Rooms are short-lived: MongoDB's TTL monitor removes them a day after creation
// so abandoned room codes don't accumulate forever.
export const ROOM_TTL_SECONDS = 24 * 60 * 60;

export const roomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    hostName: { type: String, required: true },
    // Persisted so a room can be resumed after it empties or the server restarts.
    rounds: { type: Number, default: 3, min: 1, max: 10 },
    timePerRound: { type: Number, default: 60, min: 10, max: 300 },
    maxPlayers: { type: Number, default: 8, min: 2, max: 12 },
    createdAt: { type: Date, default: Date.now, expires: ROOM_TTL_SECONDS }
  });


// Guard against "Cannot overwrite `Room` model once compiled" if this module
// ever gets re-imported against an already-populated mongoose registry (e.g.
// certain test-runner module-isolation setups).
export const Room = mongoose.models.Room || mongoose.model('Room', roomSchema);
