import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import { WhatsappSession, SessionStatus } from './whatsapp-session.entity';
import { MessageLog, MessageStatus, MessageSource } from './message-log.entity';

// whatsapp-web.js imports
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';

interface ActiveClient {
  client: Client;
  sessionId: number;
  userId: number;
  retryCount: number;
  lastActivity: Date;
  isReady: boolean;
}

// Rate limiter for messages
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

@Injectable()
export class WhatsappService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private clients: Map<number, ActiveClient> = new Map();
  private qrCallbacks: Map<number, (qr: string) => void> = new Map();
  private statusCallbacks: Map<number, (status: string, data?: any) => void> = new Map();

  // Rate limiting: max 30 messages per minute per session
  private rateLimits: Map<number, RateLimitEntry> = new Map();
  private readonly RATE_LIMIT_MAX = 30;
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute

  // Retry configuration
  private readonly MAX_RETRIES = 5;
  private readonly BASE_RETRY_DELAY = 5000; // 5 seconds
  private readonly MAX_RETRY_DELAY = 300000; // 5 minutes

  // Session directory for whatsapp-web.js
  private readonly SESSION_DIR: string;

  constructor(
    @InjectRepository(WhatsappSession)
    private sessionRepository: Repository<WhatsappSession>,
    @InjectRepository(MessageLog)
    private messageLogRepository: Repository<MessageLog>,
    private configService: ConfigService,
  ) {
    this.SESSION_DIR = this.configService.get<string>('WHATSAPP_SESSION_PATH') || './whatsapp-sessions';
    // Ensure session directory exists
    if (!fs.existsSync(this.SESSION_DIR)) {
      fs.mkdirSync(this.SESSION_DIR, { recursive: true });
    }
  }

  // Auto-reconnect sessions on startup
  async onModuleInit() {
    this.logger.log('WhatsApp Service (whatsapp-web.js) initializing...');

    try {
      // Find all sessions that were connected
      const sessionsToRestore = await this.sessionRepository.find({
        where: { status: SessionStatus.CONNECTED },
      });

      this.logger.log(`Found ${sessionsToRestore.length} sessions to restore`);

      for (const session of sessionsToRestore) {
        // Check if session folder exists (has auth data)
        const sessionPath = path.join(this.SESSION_DIR, `session-${session.id}`);
        if (fs.existsSync(sessionPath)) {
          this.logger.log(`Auto-restoring session ${session.id} (${session.sessionName})`);
          this.initializeClient(session.id, session.userId).catch(err => {
            this.logger.error(`Failed to auto-restore session ${session.id}: ${err.message}`);
          });
          // Delay between session inits
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
          this.logger.log(`Session ${session.id} has no local auth data, marking as disconnected`);
          await this.sessionRepository.update(session.id, { status: SessionStatus.DISCONNECTED });
        }
      }
    } catch (error) {
      this.logger.error(`Error during session restoration: ${error.message}`);
    }
  }

  async onModuleDestroy() {
    this.logger.log('WhatsApp Service shutting down...');
    for (const [sessionId, activeClient] of this.clients) {
      try {
        await activeClient.client.destroy();
      } catch (error) {
        this.logger.error(`Error destroying client ${sessionId}: ${error.message}`);
      }
    }
    this.clients.clear();
    this.rateLimits.clear();
  }

  // Calculate exponential backoff delay
  private getRetryDelay(retryCount: number): number {
    const delay = Math.min(
      this.BASE_RETRY_DELAY * Math.pow(2, retryCount),
      this.MAX_RETRY_DELAY
    );
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    return Math.floor(delay + jitter);
  }

  // Check rate limit before sending
  private checkRateLimit(sessionId: number): { allowed: boolean; waitTime?: number } {
    const now = Date.now();
    const entry = this.rateLimits.get(sessionId);

    if (!entry || now > entry.resetTime) {
      this.rateLimits.set(sessionId, { count: 1, resetTime: now + this.RATE_LIMIT_WINDOW });
      return { allowed: true };
    }

    if (entry.count >= this.RATE_LIMIT_MAX) {
      return { allowed: false, waitTime: entry.resetTime - now };
    }

    entry.count++;
    return { allowed: true };
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
    retryCount: number = 0,
  ): Promise<void> {
    // Close existing connection if any
    if (this.clients.has(sessionId)) {
      const existing = this.clients.get(sessionId);
      if (existing) {
        try {
          await existing.client.destroy();
        } catch (e) {}
      }
      this.clients.delete(sessionId);
    }

    if (onQr) this.qrCallbacks.set(sessionId, onQr);
    if (onStatus) this.statusCallbacks.set(sessionId, onStatus);

    this.logger.log(`Initializing whatsapp-web.js client for session ${sessionId} (attempt ${retryCount + 1}/${this.MAX_RETRIES + 1})`);

    try {
      // Create client with LocalAuth for session persistence
      const puppeteerOptions: any = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
        ],
      };

      // Use system Chromium if available (for Docker/Railway)
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        this.logger.log(`Using Chromium at: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
      }

      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: `session-${sessionId}`,
          dataPath: this.SESSION_DIR,
        }),
        puppeteer: puppeteerOptions,
      });

      // Store client
      this.clients.set(sessionId, {
        client,
        sessionId,
        userId,
        retryCount,
        lastActivity: new Date(),
        isReady: false,
      });

      // QR Code event
      client.on('qr', (qr) => {
        this.logger.log(`QR code generated for session ${sessionId}`);
        const callback = this.qrCallbacks.get(sessionId);
        if (callback) callback(qr);
      });

      // Authentication success
      client.on('authenticated', () => {
        this.logger.log(`Session ${sessionId} authenticated`);
        const statusCallback = this.statusCallbacks.get(sessionId);
        if (statusCallback) statusCallback('authenticated');
      });

      // Auth failure
      client.on('auth_failure', async (msg) => {
        this.logger.error(`Auth failure for session ${sessionId}: ${msg}`);
        await this.sessionRepository.update(sessionId, {
          status: SessionStatus.FAILED,
        });
        const statusCallback = this.statusCallbacks.get(sessionId);
        if (statusCallback) statusCallback('error', { error: 'Authentication failed', details: msg });
      });

      // Ready event - fully connected
      client.on('ready', async () => {
        this.logger.log(`Client ready for session ${sessionId}`);

        const activeClient = this.clients.get(sessionId);
        if (activeClient) {
          activeClient.isReady = true;
          activeClient.retryCount = 0;
          activeClient.lastActivity = new Date();
        }

        // Get phone number
        const info = client.info;
        const phoneNumber = info?.wid?.user || info?.wid?._serialized?.split('@')[0];

        await this.sessionRepository.update(sessionId, {
          status: SessionStatus.CONNECTED,
          phoneNumber: phoneNumber,
        });

        const statusCallback = this.statusCallbacks.get(sessionId);
        if (statusCallback) statusCallback('ready', { phoneNumber });
      });

      // Disconnected event
      client.on('disconnected', async (reason) => {
        this.logger.warn(`Session ${sessionId} disconnected: ${reason}`);

        const activeClient = this.clients.get(sessionId);
        const currentRetryCount = activeClient?.retryCount || 0;

        this.clients.delete(sessionId);

        if (reason === 'LOGOUT') {
          // User logged out - clear session
          await this.sessionRepository.update(sessionId, {
            status: SessionStatus.DISCONNECTED,
          });
          // Delete session folder
          const sessionPath = path.join(this.SESSION_DIR, `session-${sessionId}`);
          if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
          }
          const statusCallback = this.statusCallbacks.get(sessionId);
          if (statusCallback) statusCallback('disconnected', { reason: 'logged_out', needsReauth: true });

        } else if (currentRetryCount < this.MAX_RETRIES) {
          // Try to reconnect
          const delay = this.getRetryDelay(currentRetryCount);
          this.logger.log(`Will retry session ${sessionId} in ${Math.round(delay / 1000)}s`);

          await this.sessionRepository.update(sessionId, {
            status: SessionStatus.PENDING,
          });

          setTimeout(() => {
            const statusCallback = this.statusCallbacks.get(sessionId);
            if (statusCallback) statusCallback('reconnecting', { attempt: currentRetryCount + 2 });

            this.initializeClient(sessionId, userId, onQr, onStatus, currentRetryCount + 1)
              .catch(err => this.logger.error(`Reconnect failed: ${err.message}`));
          }, delay);

        } else {
          // Max retries exceeded
          this.logger.error(`Max retries exceeded for session ${sessionId}`);
          await this.sessionRepository.update(sessionId, {
            status: SessionStatus.FAILED,
          });
          const statusCallback = this.statusCallbacks.get(sessionId);
          if (statusCallback) statusCallback('error', { maxRetriesExceeded: true });
        }
      });

      // Initialize the client
      await client.initialize();

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
        await activeClient.client.destroy();
      } catch (e) {}
      this.clients.delete(sessionId);
    }

    // Delete session folder
    const sessionPath = path.join(this.SESSION_DIR, `session-${sessionId}`);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    // Clean up rate limit entry
    this.rateLimits.delete(sessionId);

    await this.sessionRepository.delete(sessionId);
    return true;
  }

  isSessionActive(sessionId: number): boolean {
    const client = this.clients.get(sessionId);
    return !!client && client.isReady;
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
    if (!activeClient || !activeClient.isReady) {
      throw new Error('Session not active');
    }

    // Check rate limit
    const rateCheck = this.checkRateLimit(sessionId);
    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(rateCheck.waitTime! / 1000)} seconds.`);
    }

    // Update last activity
    activeClient.lastActivity = new Date();

    // Format recipient number - add country code if needed
    let formattedNumber = recipient.replace(/[^0-9]/g, '');
    // If 10 digits, assume India and add 91
    if (formattedNumber.length === 10) {
      formattedNumber = '91' + formattedNumber;
      this.logger.log(`Added country code: ${formattedNumber}`);
    }
    // whatsapp-web.js uses format: number@c.us
    const chatId = `${formattedNumber}@c.us`;

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
        const media = MessageMedia.fromFilePath(mediaPath);
        await activeClient.client.sendMessage(chatId, media, { caption: message });
      } else {
        // Send text message
        await activeClient.client.sendMessage(chatId, message);
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

  async sendMessageWithMediaUrl(
    sessionId: number,
    userId: number,
    recipient: string,
    message: string,
    mediaUrl: string,
    source: MessageSource = MessageSource.API,
  ): Promise<MessageLog> {
    const activeClient = this.clients.get(sessionId);
    if (!activeClient || !activeClient.isReady) {
      throw new Error('Session not active');
    }

    // Check rate limit
    const rateCheck = this.checkRateLimit(sessionId);
    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(rateCheck.waitTime! / 1000)} seconds.`);
    }

    // Update last activity
    activeClient.lastActivity = new Date();

    // Format recipient number
    let formattedNumber = recipient.replace(/[^0-9]/g, '');
    if (formattedNumber.length === 10) {
      formattedNumber = '91' + formattedNumber;
      this.logger.log(`Added country code: ${formattedNumber}`);
    }
    const chatId = `${formattedNumber}@c.us`;

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
      const media = await MessageMedia.fromUrl(mediaUrl);
      await activeClient.client.sendMessage(chatId, media, { caption: message });

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
