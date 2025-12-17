import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findById(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async create(email: string, password: string, name: string): Promise<User> {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.usersRepository.create({
      email,
      password: hashedPassword,
      name,
    });
    return this.usersRepository.save(user);
  }

  async updatePassword(userId: number, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.update(userId, { password: hashedPassword });
  }

  async deductCredits(userId: number, amount: number): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user || user.credits < amount) {
      return false;
    }
    await this.usersRepository.update(userId, {
      credits: user.credits - amount,
    });
    return true;
  }

  async addCredits(userId: number, amount: number): Promise<void> {
    const user = await this.findById(userId);
    if (user) {
      await this.usersRepository.update(userId, {
        credits: user.credits + amount,
      });
    }
  }
}
