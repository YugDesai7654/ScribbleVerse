// Single source of truth for the backend's base URL. The Socket.IO server and
// the REST auth/leaderboard API are the same Express+Socket.IO process, so both
// the socket client and the REST fetch helper point at this one value.
export const API_BASE_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';
