import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Campaign } from './campaign.entity';

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  PDF = 'pdf',
}

@Entity('campaign_media')
export class CampaignMedia {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  campaignId: number;

  @Column({
    type: 'enum',
    enum: MediaType,
  })
  type: MediaType;

  @Column()
  filePath: string;

  @Column()
  fileName: string;

  @Column({ nullable: true })
  fileSize: number;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Campaign, (campaign) => campaign.media, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaignId' })
  campaign: Campaign;
}
