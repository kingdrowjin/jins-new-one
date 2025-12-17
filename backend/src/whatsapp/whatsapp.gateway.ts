import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3001'],
    credentials: true,
  },
  namespace: '/whatsapp',
})
export class WhatsappGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WhatsappGateway.name);
  private clientSessions: Map<string, { userId: number; sessionId?: number; socket: Socket }> = new Map();

  constructor(private whatsappService: WhatsappService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.clientSessions.delete(client.id);
  }

  @SubscribeMessage('authenticate')
  handleAuthenticate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: number },
  ) {
    this.clientSessions.set(client.id, { userId: data.userId, socket: client });
    client.emit('authenticated', { success: true });
    this.logger.log(`Client ${client.id} authenticated as user ${data.userId}`);
  }

  @SubscribeMessage('initSession')
  async handleInitSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: number; userId: number },
  ) {
    const { sessionId, userId } = data;
    this.logger.log(`Initializing session ${sessionId} for user ${userId}`);

    this.clientSessions.set(client.id, { userId, sessionId, socket: client });

    try {
      await this.whatsappService.initializeClient(
        sessionId,
        userId,
        (qr) => {
          client.emit('qr', { qr, sessionId });
        },
        (status, statusData) => {
          client.emit('status', { status, sessionId, ...statusData });
        },
      );
    } catch (error: any) {
      client.emit('error', { message: error.message, sessionId });
    }
  }

  @SubscribeMessage('checkSession')
  async handleCheckSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: number },
  ) {
    const isActive = this.whatsappService.isSessionActive(data.sessionId);
    client.emit('sessionStatus', { sessionId: data.sessionId, isActive });
  }

  emitToUser(userId: number, event: string, data: any) {
    for (const [, session] of this.clientSessions) {
      if (session.userId === userId && session.socket) {
        session.socket.emit(event, data);
      }
    }
  }
}
