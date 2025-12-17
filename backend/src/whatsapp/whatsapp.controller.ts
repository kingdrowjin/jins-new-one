import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('WhatsApp')
@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  @Post('sessions')
  @ApiOperation({ summary: 'Create a new WhatsApp session' })
  async createSession(
    @CurrentUser() user: { userId: number },
    @Body() createSessionDto: CreateSessionDto,
  ) {
    const session = await this.whatsappService.createSession(
      user.userId,
      createSessionDto.sessionName,
    );
    return { session, message: 'Session created. Connect via WebSocket to get QR code.' };
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Get all WhatsApp sessions for current user' })
  async getSessions(@CurrentUser() user: { userId: number }) {
    return this.whatsappService.getSessions(user.userId);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get a specific WhatsApp session' })
  async getSession(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.whatsappService.getSession(id, user.userId);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Delete a WhatsApp session' })
  async deleteSession(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) id: number,
  ) {
    const deleted = await this.whatsappService.deleteSession(id, user.userId);
    return { success: deleted };
  }

  @Post('sessions/:id/send')
  @ApiOperation({ summary: 'Send a message via WhatsApp' })
  async sendMessage(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) sessionId: number,
    @Body() sendMessageDto: SendMessageDto,
  ) {
    const session = await this.whatsappService.getSession(sessionId, user.userId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    try {
      const log = await this.whatsappService.sendMessage(
        sessionId,
        user.userId,
        sendMessageDto.recipient,
        sendMessageDto.message,
        sendMessageDto.mediaPath,
      );
      return { success: true, messageLog: log };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  @Get('messages')
  @ApiOperation({ summary: 'Get message logs' })
  async getMessageLogs(
    @CurrentUser() user: { userId: number },
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.whatsappService.getMessageLogs(user.userId, limit || 100, offset || 0);
  }

  @Get('sessions/:id/messages')
  @ApiOperation({ summary: 'Get message logs for a session' })
  async getSessionMessages(
    @CurrentUser() user: { userId: number },
    @Param('id', ParseIntPipe) sessionId: number,
    @Query('limit') limit?: number,
  ) {
    return this.whatsappService.getSessionMessageLogs(sessionId, user.userId, limit || 100);
  }
}
