import { io, type Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io({
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: 600,
      reconnectionDelayMax: 3000,
      reconnectionAttempts: Infinity,
    });
  }
  return socketInstance;
}
