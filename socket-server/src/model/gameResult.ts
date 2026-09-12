import mongoose from 'mongoose';

const gameResultSchema = new mongoose.Schema({
  gameId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  displayName: { type: String, required: true, trim: true, maxlength: 20 },
  roomId: { type: String, required: true, trim: true, maxlength: 8 },
  score: { type: Number, required: true, min: 0 },
  won: { type: Boolean, required: true },
  playedAt: { type: Date, default: Date.now, index: true },
});

gameResultSchema.index({ gameId: 1, userId: 1 }, { unique: true });
gameResultSchema.index({ score: -1, playedAt: -1 });

export const GameResult = mongoose.models.GameResult || mongoose.model('GameResult', gameResultSchema);
