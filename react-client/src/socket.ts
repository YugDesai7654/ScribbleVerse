import { io } from 'socket.io-client';
import { API_BASE_URL } from './config';

const socket = io(API_BASE_URL, {
  autoConnect: false,
  withCredentials: true, // send the httpOnly auth cookie with the handshake, so the
                          // server can recognize logged-in users automatically
});

export default socket;