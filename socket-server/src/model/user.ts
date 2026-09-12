import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 100 },
  passwordHash: { type: String, required: true },
  displayName: { type: String, required: true, trim: true, maxlength: 20 },
  createdAt: { type: Date, default: Date.now },
  totalScore: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  gamesWon: { type: Number, default: 0 },
});

// Guard against "Cannot overwrite `User` model once compiled" if this module
// ever gets re-imported against an already-populated mongoose registry (e.g.
// certain test-runner module-isolation setups).
export const User = mongoose.models.User || mongoose.model('User', userSchema);
