/**
 * Socket.io client singleton + antrean emit sebelum koneksi kebuka.
 * (c) KyyDevv
 */
import { io } from 'socket.io-client';
import { getToken } from './api.js';

let socket = null;
const pending = [];

function buildTokenAuth() {
  const token = getToken();
  return token ? { token } : {};
}

export function getSocket() {
  if (socket) return socket;

  socket = io('/', {
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.4,
    timeout: 20000,
    auth: buildTokenAuth(),
    query: buildTokenAuth(),
  });

  socket.on('connect', () => {
    // Flush semua emit yang sempet ketahan
    while (pending.length) {
      const { event, payload, cb } = pending.shift();
      socket.emit(event, payload, cb);
    }
  });

  return socket;
}

/** Emit yang aman: kalo socket belum konek, disimpen dulu di antrean. */
export function emit(event, payload = {}, cb = undefined) {
  const s = getSocket();
  if (s.connected) {
    if (cb) s.emit(event, payload, cb);
    else s.emit(event, payload);
    return;
  }
  pending.push({ event, payload, cb });
  // Antrean jangan kebanyakan
  if (pending.length > 30) pending.shift();
}

/** Emit dengan Promise (buat ack dari server). Auto reject kalo kelamaan. */
export function emitAsync(event, payload = {}, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server nggak jawab event "${event}" dalam ${timeoutMs / 1000}s.`)), timeoutMs);
    emit(event, payload, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

export function on(event, handler) {
  const s = getSocket();
  s.on(event, handler);
  return () => s.off(event, handler);
}

export function off(event, handler) {
  if (socket) socket.off(event, handler);
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export default getSocket;
