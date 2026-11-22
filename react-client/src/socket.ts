import { io } from 'socket.io-client';
import { API_BASE_URL } from './config';

const socket = io(API_BASE_URL, {
  autoConnect: false,
  reconnectionAttempts: 10, // then `reconnect_failed` fires and the overlay offers a way out
  withCredentials: true, // send the httpOnly auth cookie with the handshake, so the
                          // server can recognize logged-in users automatically
});

export default socket;