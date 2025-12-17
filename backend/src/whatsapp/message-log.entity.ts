import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { WhatsappSession } from './whatsapp-session.entity';

export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
}

export enum MessageSource {
  API = 'api',
  CAMPAIGN = 'campaign',
}

@Entity('message_logs')
export class MessageLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ nullable: true })
  sessionId: number;

  @Column()
  recipient: string;

  @Column({ type: 'text' })
  message: string;

  @Column({
    type: 'enum',
    enum: MessageStatus,
    default: MessageStatus.PENDING,
  })
  status: MessageStatus;

  @Column({
    type: 'enum',
    enum: MessageSource,
    default: MessageSource.API,
  })
  source: MessageSource;

  @Column({ nullable: true })
  error: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => WhatsappSession, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sessionId' })
  session: WhatsappSession;
}
