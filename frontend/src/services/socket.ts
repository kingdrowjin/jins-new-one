import { io, Socket } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${API_URL}/whatsapp`, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    })
  }
  return socket
}

export function connectSocket(userId: number): Socket {
  const sock = getSocket()

  if (!sock.connected) {
    sock.connect()
    sock.emit('authenticate', { userId })
  }

  return sock
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect()
  }
}
