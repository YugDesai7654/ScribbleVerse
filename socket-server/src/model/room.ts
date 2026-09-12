import mongoose from 'mongoose';

export const roomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    hostName: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  });


// Guard against "Cannot overwrite `Room` model once compiled" if this module
// ever gets re-imported against an already-populated mongoose registry (e.g.
// certain test-runner module-isolation setups).
export const Room = mongoose.models.Room || mongoose.model('Room', roomSchema);

