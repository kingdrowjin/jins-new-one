import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ unique: true })
  key: string;

  @Column()
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  lastUsedAt: Date;

  @ManyToOne(() => User, (user) => user.apiKeys, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
