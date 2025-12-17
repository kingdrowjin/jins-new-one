import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { WhatsappSession } from '../whatsapp/whatsapp-session.entity';
import { CampaignRecipient } from './campaign-recipient.entity';
import { CampaignMedia } from './campaign-media.entity';

export enum CampaignStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ nullable: true })
  sessionId: number;

  @Column()
  name: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ nullable: true })
  linkText: string;

  @Column({ nullable: true })
  linkUrl: string;

  @Column({ nullable: true })
  callText: string;

  @Column({ nullable: true })
  callNumber: string;

  @Column({
    type: 'enum',
    enum: CampaignStatus,
    default: CampaignStatus.DRAFT,
  })
  status: CampaignStatus;

  @Column({ default: 0 })
  totalRecipients: number;

  @Column({ default: 0 })
  sentCount: number;

  @Column({ default: 0 })
  failedCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.campaigns, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => WhatsappSession, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sessionId' })
  session: WhatsappSession;

  @OneToMany(() => CampaignRecipient, (recipient) => recipient.campaign)
  recipients: CampaignRecipient[];

  @OneToMany(() => CampaignMedia, (media) => media.campaign)
  media: CampaignMedia[];
}
