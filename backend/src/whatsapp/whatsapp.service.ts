import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import * as path from 'path';
import * as fs from 'fs';
import { WhatsappSession, SessionStatus } from './whatsapp-session.entity';
import { MessageLog, MessageStatus, MessageSource } from './message-log.entity';

interface ActiveClient {
  client: Client;
  sessionId: number;
  userId: number;
}

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private clients: Map<number, ActiveClient> = new Map();
  private qrCallbacks: Map<number, (qr: string) => void> = new Map();
  private statusCallbacks: Map<number, (status: string, data?: any) => void> = new Map();

  constructor(
    @InjectRepository(WhatsappSession)
    private sessionRepository: Repository<WhatsappSession>,
    @InjectRepository(MessageLog)
    private messageLogRepository: Repository<MessageLog>,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    const activeSessions = await this.sessionRepository.find({
      where: { status: SessionStatus.CONNECTED },
    });

    for (const session of activeSessions) {
      try {
        await this.initializeClient(session.id, session.userId);
      } catch (error) {
        this.logger.error(`Failed to restore session ${session.id}: ${error.message}`);
      }
    }
  }

  async onModuleDestroy() {
    for (const [sessionId, activeClient] of this.clients) {
      try {
        await activeClient.client.destroy();
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
  ): Promise<void> {
    if (this.clients.has(sessionId)) {
      const existing = this.clients.get(sessionId);
      if (existing) {
        await existing.client.destroy();
      }
    }

    if (onQr) this.qrCallbacks.set(sessionId, onQr);
    if (onStatus) this.statusCallbacks.set(sessionId, onStatus);

    const sessionPath = path.join(
      this.configService.get('WHATSAPP_SESSION_PATH', './whatsapp-sessions'),
      `session-${sessionId}`,
    );

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `session-${sessionId}`,
        dataPath: this.configService.get('WHATSAPP_SESSION_PATH', './whatsapp-sessions'),
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    });

    client.on('qr', (qr) => {
      this.logger.log(`QR code generated for session ${sessionId}`);
      const callback = this.qrCallbacks.get(sessionId);
      if (callback) callback(qr);
    });

    client.on('ready', async () => {
      this.logger.log(`Client ready for session ${sessionId}`);
      const info = client.info;
      await this.sessionRepository.update(sessionId, {
        status: SessionStatus.CONNECTED,
        phoneNumber: info?.wid?.user || undefined,
      });

      const statusCallback = this.statusCallbacks.get(sessionId);
      if (statusCallback) {
        statusCallback('ready', { phoneNumber: info?.wid?.user });
      }
    });

    client.on('authenticated', () => {
      this.logger.log(`Client authenticated for session ${sessionId}`);
      const statusCallback = this.statusCallbacks.get(sessionId);
      if (statusCallback) statusCallback('authenticated');
    });

    client.on('auth_failure', async (msg) => {
      this.logger.error(`Auth failure for session ${sessionId}: ${msg}`);
      await this.sessionRepository.update(sessionId, {
        status: SessionStatus.FAILED,
      });
      const statusCallback = this.statusCallbacks.get(sessionId);
      if (statusCallback) statusCallback('auth_failure', { error: msg });
    });

    client.on('disconnected', async (reason) => {
      this.logger.warn(`Client disconnected for session ${sessionId}: ${reason}`);
      await this.sessionRepository.update(sessionId, {
        status: SessionStatus.DISCONNECTED,
      });
      this.clients.delete(sessionId);
      const statusCallback = this.statusCallbacks.get(sessionId);
      if (statusCallback) statusCallback('disconnected', { reason });
    });

    this.clients.set(sessionId, { client, sessionId, userId });

    try {
      await client.initialize();
    } catch (error) {
      this.logger.error(`Failed to initialize client ${sessionId}: ${error.message}`);
      await this.sessionRepository.update(sessionId, {
        status: SessionStatus.FAILED,
      });
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
      await activeClient.client.destroy();
      this.clients.delete(sessionId);
    }

    const sessionPath = path.join(
      this.configService.get('WHATSAPP_SESSION_PATH', './whatsapp-sessions'),
      `session-${sessionId}`,
    );

    try {
      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true });
      }
    } catch (error) {
      this.logger.error(`Failed to delete session files: ${error.message}`);
    }

    await this.sessionRepository.delete(sessionId);
    return true;
  }

  async sendMessage(
    sessionId: number,
    userId: number,
    recipient: string,
    message: string,
    mediaPath?: string,
    source: MessageSource = MessageSource.API,
  ): Promise<MessageLog> {
    const log = this.messageLogRepository.create({
      userId,
      sessionId,
      recipient,
      message,
      source,
      status: MessageStatus.PENDING,
    });
    await this.messageLogRepository.save(log);

    const activeClient = this.clients.get(sessionId);
    if (!activeClient) {
      log.status = MessageStatus.FAILED;
      log.error = 'Session not connected';
      await this.messageLogRepository.save(log);
      throw new Error('Session not connected');
    }

    try {
      const formattedNumber = this.formatPhoneNumber(recipient);
      const chatId = `${formattedNumber}@c.us`;

      if (mediaPath && fs.existsSync(mediaPath)) {
        const media = MessageMedia.fromFilePath(mediaPath);
        await activeClient.client.sendMessage(chatId, media, { caption: message });
      } else {
        await activeClient.client.sendMessage(chatId, message);
      }

      log.status = MessageStatus.SENT;
      await this.messageLogRepository.save(log);
      return log;
    } catch (error) {
      log.status = MessageStatus.FAILED;
      log.error = error.message;
      await this.messageLogRepository.save(log);
      throw error;
    }
  }

  async sendMessageWithButtons(
    sessionId: number,
    userId: number,
    recipient: string,
    message: string,
    buttons: { text: string; url?: string; phoneNumber?: string }[],
    mediaPath?: string,
    source: MessageSource = MessageSource.API,
  ): Promise<MessageLog> {
    let fullMessage = message;

    buttons.forEach((btn, index) => {
      if (btn.url) {
        fullMessage += `\n\n${btn.text}: ${btn.url}`;
      } else if (btn.phoneNumber) {
        fullMessage += `\n\n${btn.text}: ${btn.phoneNumber}`;
      }
    });

    return this.sendMessage(sessionId, userId, recipient, fullMessage, mediaPath, source);
  }

  async sendMessageWithMediaUrl(
    sessionId: number,
    userId: number,
    recipient: string,
    message: string,
    mediaUrl: string,
    source: MessageSource = MessageSource.API,
  ): Promise<MessageLog> {
    const log = this.messageLogRepository.create({
      userId,
      sessionId,
      recipient,
      message,
      source,
      status: MessageStatus.PENDING,
    });
    await this.messageLogRepository.save(log);

    const activeClient = this.clients.get(sessionId);
    if (!activeClient) {
      log.status = MessageStatus.FAILED;
      log.error = 'Session not connected';
      await this.messageLogRepository.save(log);
      throw new Error('Session not connected');
    }

    try {
      const formattedNumber = this.formatPhoneNumber(recipient);
      const chatId = `${formattedNumber}@c.us`;

      // Fetch media from URL
      const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });

      if (message) {
        await activeClient.client.sendMessage(chatId, media, { caption: message });
      } else {
        await activeClient.client.sendMessage(chatId, media);
      }

      log.status = MessageStatus.SENT;
      await this.messageLogRepository.save(log);
      return log;
    } catch (error) {
      log.status = MessageStatus.FAILED;
      log.error = error.message;
      await this.messageLogRepository.save(log);
      throw error;
    }
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

  getActiveSessionIds(): number[] {
    return Array.from(this.clients.keys());
  }

  isSessionActive(sessionId: number): boolean {
    return this.clients.has(sessionId);
  }

  private formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '91' + cleaned.substring(1);
    }
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    return cleaned;
  }
}
