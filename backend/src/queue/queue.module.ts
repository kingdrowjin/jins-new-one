import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageProcessor } from './message.processor';
import { CampaignRecipient } from '../campaigns/campaign-recipient.entity';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'messages',
    }),
    TypeOrmModule.forFeature([CampaignRecipient]),
    forwardRef(() => WhatsappModule),
  ],
  providers: [MessageProcessor],
  exports: [BullModule],
})
export class QueueModule {}
