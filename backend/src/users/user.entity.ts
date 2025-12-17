import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { WhatsappSession } from '../whatsapp/whatsapp-session.entity';
import { ApiKey } from '../api-keys/api-key.entity';
import { Campaign } from '../campaigns/campaign.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  name: string;

  @Column({ default: 100 })
  credits: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => WhatsappSession, (session) => session.user)
  whatsappSessions: WhatsappSession[];

  @OneToMany(() => ApiKey, (apiKey) => apiKey.user)
  apiKeys: ApiKey[];

  @OneToMany(() => Campaign, (campaign) => campaign.user)
  campaigns: Campaign[];
}
