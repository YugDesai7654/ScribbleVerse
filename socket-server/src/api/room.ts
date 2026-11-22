import { Room } from '../model/room';

export type RoomSettings = {
  rounds: number;
  timePerRound: number;
  maxPlayers: number;
};

// Host creates a room
export async function createRoom(roomId: string, hostName: string, settings: RoomSettings) {
  // Check if room already exists
  const existing = await Room.findOne({ roomId });
  if (existing) {
    throw new Error('Room already exists');
  }
  const room = new Room({ roomId, hostName, ...settings });
  await room.save();
  return room;
}

// User joins a room
export async function joinRoom(roomId: string) {
  const room = await Room.findOne({ roomId });

  if (!room) {
    throw new Error('Room does not exist');
  }
  return room;
}

// Promote a new host when the current host disconnects
export async function updateHost(roomId: string, newHostName: string) {
  const room = await Room.findOneAndUpdate(
    { roomId },
    { hostName: newHostName },
    { new: true }
  );
  return room;
}
