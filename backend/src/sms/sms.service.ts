import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private twilioClient: Twilio.Twilio | null = null;
  private fromNumber: string;

  constructor(private configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.fromNumber = this.configService.get<string>('TWILIO_PHONE_NUMBER', '');

    if (accountSid && authToken && !accountSid.startsWith('your-')) {
      this.twilioClient = Twilio(accountSid, authToken);
      this.logger.log('Twilio client initialized');
    } else {
      this.logger.warn('Twilio credentials not configured. SMS functionality disabled.');
    }
  }

  async sendSms(
    to: string,
    message: string,
    senderId?: string,
  ): Promise<SmsResult> {
    if (!this.twilioClient) {
      return {
        success: false,
        error: 'SMS service not configured',
      };
    }

    try {
      const formattedNumber = this.formatPhoneNumber(to);

      const result = await this.twilioClient.messages.create({
        body: message,
        from: senderId || this.fromNumber,
        to: formattedNumber,
      });

      this.logger.log(`SMS sent to ${to}: ${result.sid}`);

      return {
        success: true,
        messageId: result.sid,
      };
    } catch (error: any) {
      this.logger.error(`Failed to send SMS to ${to}: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async sendBulkSms(
    recipients: string[],
    message: string,
    senderId?: string,
  ): Promise<{ results: SmsResult[]; successCount: number; failedCount: number }> {
    const results: SmsResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      const result = await this.sendSms(recipient, message, senderId);
      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }

      await this.sleep(1000);
    }

    return { results, successCount, failedCount };
  }

  private formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');
    if (!cleaned.startsWith('+')) {
      if (cleaned.length === 10) {
        cleaned = '+91' + cleaned;
      } else if (!cleaned.startsWith('91') && cleaned.length === 10) {
        cleaned = '+91' + cleaned;
      } else {
        cleaned = '+' + cleaned;
      }
    }
    return cleaned;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
