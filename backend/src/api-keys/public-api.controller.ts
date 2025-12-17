import { Controller, Post, Query, Body, UnauthorizedException, BadRequestException, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiQuery, ApiSecurity, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ApiKeysService } from './api-keys.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { SmsService, SmsResult } from '../sms/sms.service';
import { MessageSource } from '../whatsapp/message-log.entity';

@ApiTags('Public API')
@Controller()
export class PublicApiController {
  constructor(
    private apiKeysService: ApiKeysService,
    private whatsappService: WhatsappService,
    private smsService: SmsService,
  ) {}

  @Post('wapp/api/send')
  @ApiOperation({ summary: 'Send WhatsApp message via API' })
  @ApiSecurity('apikey')
  @ApiQuery({ name: 'apikey', required: true })
  @ApiQuery({ name: 'mobile', required: true, description: '10 digit mobile number' })
  @ApiQuery({ name: 'msg', required: true, description: 'Message content' })
  async sendWhatsApp(
    @Query('apikey') apikey: string,
    @Query('mobile') mobile: string,
    @Query('msg') msg: string,
  ) {
    if (!apikey) {
      throw new UnauthorizedException('API key is required');
    }

    const apiKeyRecord = await this.apiKeysService.findByKey(apikey);
    if (!apiKeyRecord) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.apiKeysService.updateLastUsed(apiKeyRecord.id);

    if (!mobile || !msg) {
      throw new BadRequestException('Mobile number and message are required');
    }

    const sessions = await this.whatsappService.getSessions(apiKeyRecord.userId);
    const activeSession = sessions.find((s) =>
      this.whatsappService.isSessionActive(s.id),
    );

    if (!activeSession) {
      return {
        success: false,
        error: 'No active WhatsApp session found',
      };
    }

    try {
      const log = await this.whatsappService.sendMessage(
        activeSession.id,
        apiKeyRecord.userId,
        mobile,
        msg,
        undefined,
        MessageSource.API,
      );

      return {
        success: true,
        messageId: log.id,
        status: log.status,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('wapp/api/sendmedia')
  @ApiOperation({ summary: 'Send WhatsApp message with media (image, video, PDF, document)' })
  @ApiSecurity('apikey')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        media: {
          type: 'string',
          format: 'binary',
          description: 'Media file (image, video, PDF, document)',
        },
      },
    },
  })
  @ApiQuery({ name: 'apikey', required: true })
  @ApiQuery({ name: 'mobile', required: true, description: '10 digit mobile number' })
  @ApiQuery({ name: 'msg', required: false, description: 'Caption/message (optional)' })
  @UseInterceptors(
    FileInterceptor('media', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
      },
      fileFilter: (req, file, cb) => {
        // Allow images, videos, PDFs, documents
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'video/mp4',
          'video/3gpp',
          'video/quicktime',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Invalid file type. Allowed: images, videos, PDF, Word, Excel'), false);
        }
      },
    }),
  )
  async sendWhatsAppMedia(
    @Query('apikey') apikey: string,
    @Query('mobile') mobile: string,
    @Query('msg') msg: string,
    @UploadedFile() media: Express.Multer.File,
  ) {
    if (!apikey) {
      throw new UnauthorizedException('API key is required');
    }

    const apiKeyRecord = await this.apiKeysService.findByKey(apikey);
    if (!apiKeyRecord) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.apiKeysService.updateLastUsed(apiKeyRecord.id);

    if (!mobile) {
      throw new BadRequestException('Mobile number is required');
    }

    if (!media) {
      throw new BadRequestException('Media file is required');
    }

    const sessions = await this.whatsappService.getSessions(apiKeyRecord.userId);
    const activeSession = sessions.find((s) =>
      this.whatsappService.isSessionActive(s.id),
    );

    if (!activeSession) {
      return {
        success: false,
        error: 'No active WhatsApp session found',
      };
    }

    try {
      const log = await this.whatsappService.sendMessage(
        activeSession.id,
        apiKeyRecord.userId,
        mobile,
        msg || '',
        media.path,
        MessageSource.API,
      );

      return {
        success: true,
        messageId: log.id,
        status: log.status,
        mediaFile: media.filename,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('wapp/api/sendmediaurl')
  @ApiOperation({ summary: 'Send WhatsApp message with media from URL' })
  @ApiSecurity('apikey')
  @ApiQuery({ name: 'apikey', required: true })
  @ApiQuery({ name: 'mobile', required: true, description: '10 digit mobile number' })
  @ApiQuery({ name: 'msg', required: false, description: 'Caption/message (optional)' })
  @ApiQuery({ name: 'mediaurl', required: true, description: 'URL of the media file' })
  async sendWhatsAppMediaUrl(
    @Query('apikey') apikey: string,
    @Query('mobile') mobile: string,
    @Query('msg') msg: string,
    @Query('mediaurl') mediaurl: string,
  ) {
    if (!apikey) {
      throw new UnauthorizedException('API key is required');
    }

    const apiKeyRecord = await this.apiKeysService.findByKey(apikey);
    if (!apiKeyRecord) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.apiKeysService.updateLastUsed(apiKeyRecord.id);

    if (!mobile || !mediaurl) {
      throw new BadRequestException('Mobile number and media URL are required');
    }

    const sessions = await this.whatsappService.getSessions(apiKeyRecord.userId);
    const activeSession = sessions.find((s) =>
      this.whatsappService.isSessionActive(s.id),
    );

    if (!activeSession) {
      return {
        success: false,
        error: 'No active WhatsApp session found',
      };
    }

    try {
      const log = await this.whatsappService.sendMessageWithMediaUrl(
        activeSession.id,
        apiKeyRecord.userId,
        mobile,
        msg || '',
        mediaurl,
        MessageSource.API,
      );

      return {
        success: true,
        messageId: log.id,
        status: log.status,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('api/sendsms')
  @ApiOperation({ summary: 'Send SMS via API' })
  @ApiSecurity('apikey')
  @ApiQuery({ name: 'apikey', required: true })
  @ApiQuery({ name: 'number', required: true, description: '10 digit mobile number' })
  @ApiQuery({ name: 'sendername', required: false, description: '6 character sender name' })
  @ApiQuery({ name: 'msg', required: true, description: 'Message content' })
  async sendSms(
    @Query('apikey') apikey: string,
    @Query('number') number: string,
    @Query('sendername') sendername: string,
    @Query('msg') msg: string,
  ) {
    if (!apikey) {
      throw new UnauthorizedException('API key is required');
    }

    const apiKeyRecord = await this.apiKeysService.findByKey(apikey);
    if (!apiKeyRecord) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.apiKeysService.updateLastUsed(apiKeyRecord.id);

    if (!number || !msg) {
      throw new BadRequestException('Number and message are required');
    }

    const result = await this.smsService.sendSms(number, msg, sendername);

    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    };
  }

  @Post('api/sendbulksms')
  @ApiOperation({ summary: 'Send bulk SMS via API' })
  @ApiSecurity('apikey')
  async sendBulkSms(
    @Query('apikey') apikey: string,
    @Body() body: { numbers: string[]; msg: string; sendername?: string },
  ) {
    if (!apikey) {
      throw new UnauthorizedException('API key is required');
    }

    const apiKeyRecord = await this.apiKeysService.findByKey(apikey);
    if (!apiKeyRecord) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.apiKeysService.updateLastUsed(apiKeyRecord.id);

    if (!body.numbers || !body.msg) {
      throw new BadRequestException('Numbers array and message are required');
    }

    const result = await this.smsService.sendBulkSms(
      body.numbers,
      body.msg,
      body.sendername,
    );

    return result;
  }
}
