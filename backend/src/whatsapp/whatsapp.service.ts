import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import pino from 'pino';
// Note: path and fs still needed for media file handling
import { WhatsappSession, SessionStatus } from './whatsapp-session.entity';
import { MessageLog, MessageStatus, MessageSource } from './message-log.entity';
import { Boom } from '@hapi/boom';

// Baileys 6.x imports
import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import type { WASocket } from '@whiskeysockets/baileys';
import { useDBAuthState } from './db-auth-state';

interface ActiveClient {
  socket: WASocket;
  sessionId: number;
  userId: number;
}

@Injectable()
export class WhatsappService implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private clients: Map<number, ActiveClient> = new Map();
  private qrCallbacks: Map<number, (qr: string) => void> = new Map();
  private pairingCodeCallbacks: Map<number, (code: string) => void> = new Map();
  private statusCallbacks: Map<number, (status: string, data?: any) => void> = new Map();

  constructor(
    @InjectRepository(WhatsappSession)
    private sessionRepository: Repository<WhatsappSession>,
    @InjectRepository(MessageLog)
    private messageLogRepository: Repository<MessageLog>,
    private configService: ConfigService,
  ) {}

  async onModuleDestroy() {
    for (const [sessionId, activeClient] of this.clients) {
      try {
        activeClient.socket.end(undefined);
      } catch (error) {
        this.logger.error(`Error destroying client ${sessionId}: ${error.message}`);
      }
    }
  }

  async createSession(userId: number, sessionName: string): Promise<WhatsappSession> {
    const session = this.sessionRepository.create({
      userId,
      sessionName,
      status: SessionStatus.PENDING,
    });
    return this.sessionRepository.save(session);
  }

  async initializeClient(
    sessionId: number,
    userId: number,
    onQr?: (qr: string) => void,
    onStatus?: (status: string, data?: any) => void,
    phoneNumber?: string,
    onPairingCode?: (code: string) => void,
  ): Promise<void> {
    // Close existing connection if any
    if (this.clients.has(sessionId)) {
      const existing = this.clients.get(sessionId);
      if (existing) {
        try {
          existing.socket.end(undefined);
        } catch (e) {}
      }
      this.clients.delete(sessionId);
    }

    if (onQr) this.qrCallbacks.set(sessionId, onQr);
    if (onPairingCode) this.pairingCodeCallbacks.set(sessionId, onPairingCode);
    if (onStatus) this.statusCallbacks.set(sessionId, onStatus);

    this.logger.log(`Initializing Baileys client for session ${sessionId}`);

    try {
      // Use database-backed auth state for persistence across deployments
      const { state, saveCreds } = await useDBAuthState(this.sessionRepository, sessionId);

      // Fetch the latest WhatsApp Web version
      const { version } = await fetchLatestBaileysVersion();

      this.logger.log(`Using Baileys version: ${version.join('.')}`);

      const socket = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }) as any),
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }) as any,
        browser: ['Ubuntu', 'Chrome', '114.0.0.0'] as [string, string, string],
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
      });

      // Store client
      this.clients.set(sessionId, { socket, sessionId, userId });

      // Handle connection updates
      socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        this.logger.log(`Connection update for session ${sessionId}: ${JSON.stringify({ connection, hasQr: !!qr })}`);

        if (qr && !phoneNumber) {
          // QR code received - send to frontend
          this.logger.log(`QR code generated for session ${sessionId}`);
          const callback = this.qrCallbacks.get(sessionId);
          if (callback) callback(qr);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          this.logger.warn(`Connection closed for session ${sessionId}, code: ${statusCode}, reconnect: ${shouldReconnect}`);

          this.clients.delete(sessionId);

          if (!shouldReconnect) {
            // Logged out - don't reconnect
            await this.sessionRepository.update(sessionId, {
              status: SessionStatus.DISCONNECTED,
            });
            const statusCallback = this.statusCallbacks.get(sessionId);
            if (statusCallback) statusCallback('disconnected', { reason: 'logged_out' });
          } else if (statusCode === 515) {
            // Restart required - reconnect once after delay
            this.logger.log(`Reconnecting session ${sessionId} due to restart required (515)`);

            setTimeout(() => {
              const statusCallback = this.statusCallbacks.get(sessionId);
              if (statusCallback) statusCallback('reconnecting');

              this.initializeClient(sessionId, userId, onQr, onStatus, phoneNumber, onPairingCode)
                .catch(err => this.logger.error(`Reconnect failed: ${err.message}`));
            }, 2000);
          } else {
            // Other disconnects - notify but don't auto-reconnect aggressively
            const statusCallback = this.statusCallbacks.get(sessionId);
            if (statusCallback) statusCallback('disconnected', { code: statusCode });
          }
        } else if (connection === 'open') {
          this.logger.log(`Client connected for session ${sessionId}`);

          // Get phone number from socket
          const phoneNum = socket.user?.id?.split(':')[0] || socket.user?.id;

          await this.sessionRepository.update(sessionId, {
            status: SessionStatus.CONNECTED,
            phoneNumber: phoneNum,
          });

          const statusCallback = this.statusCallbacks.get(sessionId);
          if (statusCallback) {
            statusCallback('ready', { phoneNumber: phoneNum });
          }
        }
      });

      // Handle credential updates
      socket.ev.on('creds.update', saveCreds);

      // Request pairing code if phone number provided AND not already registered
      if (phoneNumber && !state.creds.registered) {
        this.logger.log(`Will request pairing code for phone: ${phoneNumber}`);

        // Wait for socket to be ready, then request pairing code
        const requestCode = async () => {
          try {
            // Double check we're not already registered
            if (state.creds.registered) {
              this.logger.log(`Already registered, skipping pairing code request`);
              return;
            }

            let formattedPhone = phoneNumber.replace(/[^0-9]/g, '');

            // If phone is exactly 10 digits, assume India and add 91
            if (formattedPhone.length === 10) {
              formattedPhone = '91' + formattedPhone;
              this.logger.log(`Added India country code: ${formattedPhone}`);
            }

            if (formattedPhone.length < 10) {
              throw new Error('Phone number too short. Include country code (e.g., 919904280710)');
            }

            this.logger.log(`Requesting pairing code for: ${formattedPhone}`);

            // Check if requestPairingCode exists
            if (typeof socket.requestPairingCode !== 'function') {
              throw new Error('Pairing code not supported in this version. Use QR code instead.');
            }

            const code = await socket.requestPairingCode(formattedPhone);
            this.logger.log(`Pairing code generated for session ${sessionId}: ${code}`);

            const pairingCallback = this.pairingCodeCallbacks.get(sessionId);
            if (pairingCallback) pairingCallback(code);
          } catch (error: any) {
            this.logger.error(`Failed to get pairing code: ${error.message}`);
            const statusCallback = this.statusCallbacks.get(sessionId);
            if (statusCallback) statusCallback('error', { error: error.message });
          }
        };

        // Wait 3 seconds for socket to initialize
        setTimeout(requestCode, 3000);
      } else if (phoneNumber && state.creds.registered) {
        this.logger.log(`Session ${sessionId} already registered, will auto-connect`);
      }

    } catch (error: any) {
      this.logger.error(`Failed to initialize client ${sessionId}: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      await this.sessionRepository.update(sessionId, {
        status: SessionStatus.FAILED,
      });
      const statusCallback = this.statusCallbacks.get(sessionId);
      if (statusCallback) statusCallback('error', { error: error.message });
      throw error;
    }
  }

  async getSessions(userId: number): Promise<WhatsappSession[]> {
    return this.sessionRepository.find({ where: { userId } });
  }

  async getSession(sessionId: number, userId: number): Promise<WhatsappSession | null> {
    return this.sessionRepository.findOne({ where: { id: sessionId, userId } });
  }

  async deleteSession(sessionId: number, userId: number): Promise<boolean> {
    const session = await this.getSession(sessionId, userId);
    if (!session) return false;

    const activeClient = this.clients.get(sessionId);
    if (activeClient) {
      try {
        activeClient.socket.end(undefined);
      } catch (e) {}
      this.clients.delete(sessionId);
    }

    // Session data is stored in database, will be deleted with the session record

    await this.sessionRepository.delete(sessionId);
    return true;
  }

  isSessionActive(sessionId: number): boolean {
    const client = this.clients.get(sessionId);
    return !!client && !!client.socket.user;
  }

  async sendMessage(
    sessionId: number,
    userId: number,
    recipient: string,
    message: string,
    mediaPath?: string,
    source: MessageSource = MessageSource.MANUAL,
  ): Promise<MessageLog> {
    const activeClient = this.clients.get(sessionId);
    if (!activeClient) {
      throw new Error('Session not active');
    }

    // Format recipient number - add country code if needed
    let formattedNumber = recipient.replace(/[^0-9]/g, '');
    // If 10 digits, assume India and add 91
    if (formattedNumber.length === 10) {
      formattedNumber = '91' + formattedNumber;
      this.logger.log(`Added country code: ${formattedNumber}`);
    }
    if (!formattedNumber.includes('@')) {
      formattedNumber = `${formattedNumber}@s.whatsapp.net`;
    }

    const log = this.messageLogRepository.create({
      userId,
      sessionId,
      recipient,
      message,
      status: MessageStatus.PENDING,
      source,
    });
    await this.messageLogRepository.save(log);

    try {
      if (mediaPath && fs.existsSync(mediaPath)) {
        // Send media message
        const mimeType = this.getMimeType(mediaPath);
        const mediaBuffer = fs.readFileSync(mediaPath);

        if (mimeType.startsWith('image/')) {
          await activeClient.socket.sendMessage(formattedNumber, {
            image: mediaBuffer,
            caption: message,
          });
        } else if (mimeType.startsWith('video/')) {
          await activeClient.socket.sendMessage(formattedNumber, {
            video: mediaBuffer,
            caption: message,
          });
        } else if (mimeType === 'application/pdf') {
          await activeClient.socket.sendMessage(formattedNumber, {
            document: mediaBuffer,
            mimetype: mimeType,
            fileName: path.basename(mediaPath),
            caption: message,
          });
        } else {
          await activeClient.socket.sendMessage(formattedNumber, {
            document: mediaBuffer,
            mimetype: mimeType,
            fileName: path.basename(mediaPath),
          });
        }
      } else {
        // Send text message
        await activeClient.socket.sendMessage(formattedNumber, { text: message });
      }

      log.status = MessageStatus.SENT;
      log.sentAt = new Date();
    } catch (error: any) {
      log.status = MessageStatus.FAILED;
      log.error = error.message;
      this.logger.error(`Failed to send message: ${error.message}`);
    }

    await this.messageLogRepository.save(log);
    return log;
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.avi': 'video/avi',
      '.mov': 'video/quicktime',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  async sendMessageWithMediaUrl(
    sessionId: number,
    userId: number,
    recipient: string,
    message: string,
    mediaUrl: string,
    source: MessageSource = MessageSource.API,
  ): Promise<MessageLog> {
    const activeClient = this.clients.get(sessionId);
    if (!activeClient) {
      throw new Error('Session not active');
    }

    // Format recipient number - add country code if needed
    let formattedNumber = recipient.replace(/[^0-9]/g, '');
    // If 10 digits, assume India and add 91
    if (formattedNumber.length === 10) {
      formattedNumber = '91' + formattedNumber;
      this.logger.log(`Added country code: ${formattedNumber}`);
    }
    if (!formattedNumber.includes('@')) {
      formattedNumber = `${formattedNumber}@s.whatsapp.net`;
    }

    const log = this.messageLogRepository.create({
      userId,
      sessionId,
      recipient,
      message,
      status: MessageStatus.PENDING,
      source,
    });
    await this.messageLogRepository.save(log);

    try {
      // Download media from URL
      const response = await fetch(mediaUrl);
      if (!response.ok) {
        throw new Error(`Failed to download media: ${response.statusText}`);
      }
      const mediaBuffer = Buffer.from(await response.arrayBuffer());

      // Determine mime type from URL or content-type header
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const urlPath = new URL(mediaUrl).pathname;
      const ext = path.extname(urlPath).toLowerCase();

      if (contentType.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
        await activeClient.socket.sendMessage(formattedNumber, {
          image: mediaBuffer,
          caption: message,
        });
      } else if (contentType.startsWith('video/') || ['.mp4', '.avi', '.mov'].includes(ext)) {
        await activeClient.socket.sendMessage(formattedNumber, {
          video: mediaBuffer,
          caption: message,
        });
      } else if (contentType === 'application/pdf' || ext === '.pdf') {
        await activeClient.socket.sendMessage(formattedNumber, {
          document: mediaBuffer,
          mimetype: 'application/pdf',
          fileName: path.basename(urlPath) || 'document.pdf',
          caption: message,
        });
      } else {
        await activeClient.socket.sendMessage(formattedNumber, {
          document: mediaBuffer,
          mimetype: contentType,
          fileName: path.basename(urlPath) || 'file',
        });
      }

      log.status = MessageStatus.SENT;
      log.sentAt = new Date();
    } catch (error: any) {
      log.status = MessageStatus.FAILED;
      log.error = error.message;
      this.logger.error(`Failed to send media message: ${error.message}`);
    }

    await this.messageLogRepository.save(log);
    return log;
  }

  async getMessageLogs(userId: number, limit = 100, offset = 0): Promise<MessageLog[]> {
    return this.messageLogRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async getSessionMessageLogs(sessionId: number, userId: number, limit = 100): Promise<MessageLog[]> {
    return this.messageLogRepository.find({
      where: { sessionId, userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
