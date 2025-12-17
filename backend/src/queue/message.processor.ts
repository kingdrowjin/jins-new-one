import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CampaignRecipient, RecipientStatus } from '../campaigns/campaign-recipient.entity';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { MessageSource } from '../whatsapp/message-log.entity';

interface CampaignMessageJob {
  campaignId: number;
  recipientId: number;
  sessionId: number;
  userId: number;
  phoneNumber: string;
  message: string;
  linkText?: string;
  linkUrl?: string;
  callText?: string;
  callNumber?: string;
  media?: Array<{ filePath: string; type: string }>;
}

interface ApiMessageJob {
  sessionId: number;
  userId: number;
  phoneNumber: string;
  message: string;
  mediaPath?: string;
}

@Processor('messages')
export class MessageProcessor {
  private readonly logger = new Logger(MessageProcessor.name);

  constructor(
    @InjectRepository(CampaignRecipient)
    private recipientRepository: Repository<CampaignRecipient>,
    private configService: ConfigService,
    @Inject(forwardRef(() => WhatsappService))
    private whatsappService: WhatsappService,
  ) {}

  @Process('send-campaign-message')
  async handleCampaignMessage(job: Job<CampaignMessageJob>) {
    const {
      campaignId,
      recipientId,
      sessionId,
      userId,
      phoneNumber,
      message,
      linkText,
      linkUrl,
      callText,
      callNumber,
      media,
    } = job.data;

    this.logger.log(`Processing campaign message to ${phoneNumber}`);

    try {
      // Add random delay between messages to avoid spam detection
      const delay = this.getRandomDelay();
      this.logger.log(`Waiting ${delay}ms before sending...`);
      await this.sleep(delay);

      // Build the full message with link and call buttons
      let fullMessage = message;
      if (linkText && linkUrl) {
        fullMessage += `\n\n${linkText}: ${linkUrl}`;
      }
      if (callText && callNumber) {
        fullMessage += `\n\n${callText}: ${callNumber}`;
      }

      // Get media path if exists
      const mediaPath = media && media.length > 0 ? media[0].filePath : undefined;

      this.logger.log(`Sending message to ${phoneNumber} via session ${sessionId}`);

      // Actually send the message via WhatsApp service
      await this.whatsappService.sendMessage(
        sessionId,
        userId,
        phoneNumber,
        fullMessage,
        mediaPath,
        MessageSource.CAMPAIGN,
      );

      this.logger.log(`Message successfully sent to ${phoneNumber}`);

      await this.recipientRepository.update(recipientId, {
        status: RecipientStatus.SENT,
        sentAt: new Date(),
      });
    } catch (error) {
      this.logger.error(`Failed to send message to ${phoneNumber}: ${error.message}`);
      await this.recipientRepository.update(recipientId, {
        status: RecipientStatus.FAILED,
        error: error.message,
      });
    }
  }

  @Process('send-api-message')
  async handleApiMessage(job: Job<ApiMessageJob>) {
    const { sessionId, userId, phoneNumber, message, mediaPath } = job.data;

    this.logger.log(`Processing API message to ${phoneNumber}`);

    try {
      const delay = this.getRandomDelay();
      this.logger.log(`Waiting ${delay}ms before sending...`);
      await this.sleep(delay);

      // Actually send the message via WhatsApp service
      await this.whatsappService.sendMessage(
        sessionId,
        userId,
        phoneNumber,
        message,
        mediaPath,
        MessageSource.API,
      );

      this.logger.log(`API message successfully sent to ${phoneNumber}`);
    } catch (error) {
      this.logger.error(`Failed to send API message to ${phoneNumber}: ${error.message}`);
      throw error;
    }
  }

  private getRandomDelay(): number {
    const min = parseInt(this.configService.get('MESSAGE_DELAY_MIN', '3000'), 10);
    const max = parseInt(this.configService.get('MESSAGE_DELAY_MAX', '5000'), 10);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
