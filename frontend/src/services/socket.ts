import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io('http://localhost:3000/whatsapp', {
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
