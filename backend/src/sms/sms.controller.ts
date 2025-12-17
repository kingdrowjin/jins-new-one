import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SmsService, SmsResult } from './sms.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SendSmsDto } from './dto/send-sms.dto';
import { SendBulkSmsDto } from './dto/send-bulk-sms.dto';

@ApiTags('SMS')
@Controller('sms')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SmsController {
  constructor(private smsService: SmsService) {}

  @Post('send')
  @ApiOperation({ summary: 'Send a single SMS' })
  async sendSms(@Body() sendSmsDto: SendSmsDto): Promise<SmsResult> {
    return this.smsService.sendSms(
      sendSmsDto.number,
      sendSmsDto.msg,
      sendSmsDto.sendername,
    );
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Send bulk SMS' })
  async sendBulkSms(@Body() sendBulkSmsDto: SendBulkSmsDto) {
    return this.smsService.sendBulkSms(
      sendBulkSmsDto.numbers,
      sendBulkSmsDto.msg,
      sendBulkSmsDto.sendername,
    );
  }
}
