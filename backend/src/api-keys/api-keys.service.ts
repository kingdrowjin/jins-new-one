import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ApiKey } from './api-key.entity';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
  ) {}

  async create(userId: number, name: string): Promise<ApiKey> {
    const key = this.generateApiKey();
    const apiKey = this.apiKeyRepository.create({
      userId,
      key,
      name,
    });
    return this.apiKeyRepository.save(apiKey);
  }

  async findAll(userId: number): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByKey(key: string): Promise<ApiKey | null> {
    return this.apiKeyRepository.findOne({
      where: { key, isActive: true },
      relations: ['user'],
    });
  }

  async delete(id: number, userId: number): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id, userId },
    });
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }
    await this.apiKeyRepository.delete(id);
  }

  async deactivate(id: number, userId: number): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id, userId },
    });
    if (!apiKey) {
      throw new NotFoundException('API key not found');
    }
    await this.apiKeyRepository.update(id, { isActive: false });
  }

  async updateLastUsed(id: number): Promise<void> {
    await this.apiKeyRepository.update(id, { lastUsedAt: new Date() });
  }

  private generateApiKey(): string {
    return uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
  }
}
