import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Campaign } from './campaign.entity';

export enum RecipientStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}

@Entity('campaign_recipients')
export class CampaignRecipient {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  campaignId: number;

  @Column()
  phoneNumber: string;

  @Column({
    type: 'enum',
    enum: RecipientStatus,
    default: RecipientStatus.PENDING,
  })
  status: RecipientStatus;

  @Column({ nullable: true })
  sentAt: Date;

  @Column({ nullable: true })
  error: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Campaign, (campaign) => campaign.recipients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: Campaign;
}
