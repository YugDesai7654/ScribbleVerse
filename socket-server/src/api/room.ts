import { Room } from '../model/room';

// Host creates a room
export async function createRoom(roomId: string, hostName: string) {
  // Check if room already exists
  const existing = await Room.findOne({ roomId });
  if (existing) {
    throw new Error('Room already exists');
  }
  const room = new Room({ roomId, hostName });
  await room.save();
  return room;
}

// User joins a room
export async function joinRoom(roomId: string) {
  const room = await Room.findOne({ roomId });
  console.log("room : ",room);
  
  if (!room) {
    throw new Error('Room does not exist');
  }
  return room;
}
