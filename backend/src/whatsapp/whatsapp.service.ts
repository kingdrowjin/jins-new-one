import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
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
  retryCount: number;
  lastActivity: Date;
  healthCheckInterval?: NodeJS.Timeout;
}

// Rate limiter for messages
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Error categories for better handling
enum ErrorCategory {
  TEMPORARY = 'temporary',      // Can retry
  RATE_LIMITED = 'rate_limited', // Wait longer
  LOGGED_OUT = 'logged_out',    // Need re-auth
  FATAL = 'fatal',              // Don't retry
}

@Injectable()
export class WhatsappService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private clients: Map<number, ActiveClient> = new Map();
  private qrCallbacks: Map<number, (qr: string) => void> = new Map();
  private pairingCodeCallbacks: Map<number, (code: string) => void> = new Map();
  private statusCallbacks: Map<number, (status: string, data?: any) => void> = new Map();

  // Rate limiting: max 30 messages per minute per session
  private rateLimits: Map<number, RateLimitEntry> = new Map();
  private readonly RATE_LIMIT_MAX = 30;
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute

  // Retry configuration
  private readonly MAX_RETRIES = 5;
  private readonly BASE_RETRY_DELAY = 2000; // 2 seconds
  private readonly MAX_RETRY_DELAY = 300000; // 5 minutes

  // Health check interval
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

  constructor(
    @InjectRepository(WhatsappSession)
    private sessionRepository: Repository<WhatsappSession>,
    @InjectRepository(MessageLog)
    private messageLogRepository: Repository<MessageLog>,
    private configService: ConfigService,
  ) {}

  // Auto-reconnect sessions on startup
  async onModuleInit() {
    this.logger.log('WhatsApp Service initializing - checking for sessions to restore...');

    try {
      // Find all sessions that were connected and have session data
      const sessionsToRestore = await this.sessionRepository.find({
        where: { status: SessionStatus.CONNECTED },
      });

      for (const session of sessionsToRestore) {
        if (session.sessionData) {
          this.logger.log(`Auto-restoring session ${session.id} (${session.sessionName})`);
          // Don't await - let them connect in parallel
          this.initializeClient(session.id, session.userId).catch(err => {
            this.logger.error(`Failed to auto-restore session ${session.id}: ${err.message}`);
          });
          // Small delay between session inits to avoid overwhelming WhatsApp
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      this.logger.log(`Attempted to restore ${sessionsToRestore.length} sessions`);
    } catch (error) {
      this.logger.error(`Error during session restoration: ${error.message}`);
    }
  }

  // Categorize errors for appropriate handling
  private categorizeError(statusCode: number): ErrorCategory {
    switch (statusCode) {
      case DisconnectReason.loggedOut:
      case 401:
        return ErrorCategory.LOGGED_OUT;
      case 408: // Timeout
      case 500: // Server error
      case 502: // Bad gateway
      case 503: // Service unavailable
      case 515: // Restart required
        return ErrorCategory.TEMPORARY;
      case 429: // Too many requests
        return ErrorCategory.RATE_LIMITED;
      default:
        if (statusCode >= 400 && statusCode < 500) {
          return ErrorCategory.FATAL;
        }
        return ErrorCategory.TEMPORARY;
    }
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

  // Start health check for a session
  private startHealthCheck(sessionId: number) {
    const client = this.clients.get(sessionId);
    if (!client) return;

    // Clear existing interval if any
    if (client.healthCheckInterval) {
      clearInterval(client.healthCheckInterval);
    }

    client.healthCheckInterval = setInterval(async () => {
      const activeClient = this.clients.get(sessionId);
      if (!activeClient) {
        clearInterval(client.healthCheckInterval);
        return;
      }

      // Check if socket is still connected
      if (!activeClient.socket.user) {
        this.logger.warn(`Health check failed for session ${sessionId} - no user info`);
        // Try to reconnect
        const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
        if (session && session.sessionData) {
          this.logger.log(`Attempting health-check reconnect for session ${sessionId}`);
          this.initializeClient(sessionId, session.userId).catch(err => {
            this.logger.error(`Health-check reconnect failed: ${err.message}`);
          });
        }
      } else {
        activeClient.lastActivity = new Date();
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  // Stop health check for a session
  private stopHealthCheck(sessionId: number) {
    const client = this.clients.get(sessionId);
    if (client?.healthCheckInterval) {
      clearInterval(client.healthCheckInterval);
      client.healthCheckInterval = undefined;
    }
  }

  async onModuleDestroy() {
    this.logger.log('WhatsApp Service shutting down...');
    for (const [sessionId, activeClient] of this.clients) {
      try {
        this.stopHealthCheck(sessionId);
        activeClient.socket.end(undefined);
      } catch (error) {
        this.logger.error(`Error destroying client ${sessionId}: ${error.message}`);
      }
    }
    this.clients.clear();
    this.rateLimits.clear();
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
    retryCount: number = 0,
  ): Promise<void> {
    // Close existing connection if any
    if (this.clients.has(sessionId)) {
      const existing = this.clients.get(sessionId);
      if (existing) {
        try {
          this.stopHealthCheck(sessionId);
          existing.socket.end(undefined);
        } catch (e) {}
      }
      this.clients.delete(sessionId);
    }

    if (onQr) this.qrCallbacks.set(sessionId, onQr);
    if (onPairingCode) this.pairingCodeCallbacks.set(sessionId, onPairingCode);
    if (onStatus) this.statusCallbacks.set(sessionId, onStatus);

    this.logger.log(`Initializing Baileys client for session ${sessionId} (attempt ${retryCount + 1}/${this.MAX_RETRIES + 1})`);

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

      // Store client with retry tracking
      this.clients.set(sessionId, {
        socket,
        sessionId,
        userId,
        retryCount,
        lastActivity: new Date(),
      });

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
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode || 500;
          const errorCategory = this.categorizeError(statusCode);
          const currentClient = this.clients.get(sessionId);
          const currentRetryCount = currentClient?.retryCount || 0;

          this.logger.warn(`Connection closed for session ${sessionId}, code: ${statusCode}, category: ${errorCategory}, retries: ${currentRetryCount}`);

          this.stopHealthCheck(sessionId);
          this.clients.delete(sessionId);

          if (errorCategory === ErrorCategory.LOGGED_OUT) {
            // Logged out - clear session data and don't reconnect
            await this.sessionRepository.update(sessionId, {
              status: SessionStatus.DISCONNECTED,
              sessionData: null, // Clear credentials
            });
            const statusCallback = this.statusCallbacks.get(sessionId);
            if (statusCallback) statusCallback('disconnected', { reason: 'logged_out', needsReauth: true });

          } else if (errorCategory === ErrorCategory.FATAL) {
            // Fatal error - don't retry
            await this.sessionRepository.update(sessionId, {
              status: SessionStatus.FAILED,
            });
            const statusCallback = this.statusCallbacks.get(sessionId);
            if (statusCallback) statusCallback('error', { code: statusCode, fatal: true });

          } else if (currentRetryCount < this.MAX_RETRIES) {
            // Temporary or rate-limited error - retry with exponential backoff
            const delay = errorCategory === ErrorCategory.RATE_LIMITED
              ? this.getRetryDelay(currentRetryCount) * 2 // Double delay for rate limits
              : this.getRetryDelay(currentRetryCount);

            this.logger.log(`Will retry session ${sessionId} in ${Math.round(delay / 1000)}s (attempt ${currentRetryCount + 2}/${this.MAX_RETRIES + 1})`);

            await this.sessionRepository.update(sessionId, {
              status: SessionStatus.PENDING,
            });

            setTimeout(() => {
              const statusCallback = this.statusCallbacks.get(sessionId);
              if (statusCallback) statusCallback('reconnecting', { attempt: currentRetryCount + 2 });

              this.initializeClient(sessionId, userId, onQr, onStatus, phoneNumber, onPairingCode, currentRetryCount + 1)
                .catch(err => this.logger.error(`Reconnect failed: ${err.message}`));
            }, delay);

          } else {
            // Max retries exceeded
            this.logger.error(`Max retries exceeded for session ${sessionId}`);
            await this.sessionRepository.update(sessionId, {
              status: SessionStatus.FAILED,
            });
            const statusCallback = this.statusCallbacks.get(sessionId);
            if (statusCallback) statusCallback('error', { code: statusCode, maxRetriesExceeded: true });
          }
        } else if (connection === 'open') {
          this.logger.log(`Client connected for session ${sessionId}`);

          // Get phone number from socket
          const phoneNum = socket.user?.id?.split(':')[0] || socket.user?.id;

          // Reset retry count on successful connection
          const client = this.clients.get(sessionId);
          if (client) {
            client.retryCount = 0;
            client.lastActivity = new Date();
          }

          await this.sessionRepository.update(sessionId, {
            status: SessionStatus.CONNECTED,
            phoneNumber: phoneNum,
          });

          // Start health monitoring
          this.startHealthCheck(sessionId);

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
        this.stopHealthCheck(sessionId);
        activeClient.socket.end(undefined);
      } catch (e) {}
      this.clients.delete(sessionId);
    }

    // Clean up rate limit entry
    this.rateLimits.delete(sessionId);

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
