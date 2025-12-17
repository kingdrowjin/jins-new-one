import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Campaign, CampaignStatus } from './campaign.entity';
import { CampaignRecipient, RecipientStatus } from './campaign-recipient.entity';
import { CampaignMedia, MediaType } from './campaign-media.entity';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private campaignRepository: Repository<Campaign>,
    @InjectRepository(CampaignRecipient)
    private recipientRepository: Repository<CampaignRecipient>,
    @InjectRepository(CampaignMedia)
    private mediaRepository: Repository<CampaignMedia>,
    private whatsappService: WhatsappService,
    @InjectQueue('messages')
    private messageQueue: Queue,
  ) {}

  async create(userId: number, createCampaignDto: CreateCampaignDto): Promise<Campaign> {
    const campaign = this.campaignRepository.create({
      userId,
      ...createCampaignDto,
      status: CampaignStatus.DRAFT,
    });
    return this.campaignRepository.save(campaign);
  }

  async findAll(userId: number): Promise<Campaign[]> {
    return this.campaignRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      relations: ['media'],
    });
  }

  async findOne(id: number, userId: number): Promise<Campaign> {
    const campaign = await this.campaignRepository.findOne({
      where: { id, userId },
      relations: ['recipients', 'media'],
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  async addRecipients(campaignId: number, userId: number, phoneNumbers: string[]): Promise<void> {
    const campaign = await this.findOne(campaignId, userId);

    const uniqueNumbers = [...new Set(phoneNumbers.map((n) => n.trim()).filter((n) => n))];

    const recipients = uniqueNumbers.map((phoneNumber) =>
      this.recipientRepository.create({
        campaignId,
        phoneNumber,
        status: RecipientStatus.PENDING,
      }),
    );

    await this.recipientRepository.save(recipients);
    await this.campaignRepository.update(campaignId, {
      totalRecipients: campaign.totalRecipients + uniqueNumbers.length,
    });
  }

  async addMedia(
    campaignId: number,
    userId: number,
    type: MediaType,
    filePath: string,
    fileName: string,
    fileSize: number,
  ): Promise<CampaignMedia> {
    await this.findOne(campaignId, userId);

    const media = this.mediaRepository.create({
      campaignId,
      type,
      filePath,
      fileName,
      fileSize,
    });
    return this.mediaRepository.save(media);
  }

  async startCampaign(campaignId: number, userId: number): Promise<Campaign> {
    const campaign = await this.findOne(campaignId, userId);

    if (!campaign.sessionId) {
      throw new BadRequestException('No WhatsApp session assigned to campaign');
    }

    if (!this.whatsappService.isSessionActive(campaign.sessionId)) {
      throw new BadRequestException('WhatsApp session is not connected');
    }

    if (campaign.recipients.length === 0) {
      throw new BadRequestException('No recipients in campaign');
    }

    await this.campaignRepository.update(campaignId, {
      status: CampaignStatus.RUNNING,
    });

    for (const recipient of campaign.recipients) {
      if (recipient.status === RecipientStatus.PENDING) {
        await this.messageQueue.add('send-campaign-message', {
          campaignId,
          recipientId: recipient.id,
          sessionId: campaign.sessionId,
          userId,
          phoneNumber: recipient.phoneNumber,
          message: campaign.message,
          linkText: campaign.linkText,
          linkUrl: campaign.linkUrl,
          callText: campaign.callText,
          callNumber: campaign.callNumber,
          media: campaign.media,
        });
      }
    }

    return this.findOne(campaignId, userId);
  }

  async updateRecipientStatus(
    recipientId: number,
    status: RecipientStatus,
    error?: string,
  ): Promise<void> {
    const updateData: any = { status };
    if (status === RecipientStatus.SENT) {
      updateData.sentAt = new Date();
    }
    if (error) {
      updateData.error = error;
    }
    await this.recipientRepository.update(recipientId, updateData);

    const recipient = await this.recipientRepository.findOne({
      where: { id: recipientId },
    });

    if (recipient) {
      const campaign = await this.campaignRepository.findOne({
        where: { id: recipient.campaignId },
      });

      if (campaign) {
        if (status === RecipientStatus.SENT) {
          await this.campaignRepository.update(recipient.campaignId, {
            sentCount: campaign.sentCount + 1,
          });
        } else if (status === RecipientStatus.FAILED) {
          await this.campaignRepository.update(recipient.campaignId, {
            failedCount: campaign.failedCount + 1,
          });
        }

        if (
          campaign.sentCount + campaign.failedCount + 1 >=
          campaign.totalRecipients
        ) {
          await this.campaignRepository.update(recipient.campaignId, {
            status: CampaignStatus.COMPLETED,
          });
        }
      }
    }
  }

  async getCampaignReport(campaignId: number, userId: number) {
    const campaign = await this.findOne(campaignId, userId);
    const recipients = await this.recipientRepository.find({
      where: { campaignId },
    });

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        totalRecipients: campaign.totalRecipients,
        sentCount: campaign.sentCount,
        failedCount: campaign.failedCount,
        createdAt: campaign.createdAt,
      },
      recipients: recipients.map((r) => ({
        phoneNumber: r.phoneNumber,
        status: r.status,
        sentAt: r.sentAt,
        error: r.error,
      })),
    };
  }

  async delete(campaignId: number, userId: number): Promise<void> {
    const campaign = await this.findOne(campaignId, userId);
    await this.campaignRepository.delete(campaignId);
  }
}
