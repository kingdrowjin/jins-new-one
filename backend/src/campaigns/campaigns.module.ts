import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampaignsService } from './campaigns.service';
import { CampaignsController } from './campaigns.controller';
import { Campaign } from './campaign.entity';
import { CampaignRecipient } from './campaign-recipient.entity';
import { CampaignMedia } from './campaign-media.entity';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, CampaignRecipient, CampaignMedia]),
    WhatsappModule,
    QueueModule,
  ],
  providers: [CampaignsService],
  controllers: [CampaignsController],
  exports: [CampaignsService],
})
export class CampaignsModule {}
