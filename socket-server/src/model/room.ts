import mongoose from 'mongoose';

export const roomSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    hostName: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  });


export const Room = mongoose.model('Room', roomSchema);

