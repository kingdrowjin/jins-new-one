import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappGateway } from './whatsapp.gateway';
import { WhatsappSession } from './whatsapp-session.entity';
import { MessageLog } from './message-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappSession, MessageLog]),
  ],
  providers: [WhatsappService, WhatsappGateway],
  controllers: [WhatsappController],
  exports: [WhatsappService],
})
export class WhatsappModule {}
