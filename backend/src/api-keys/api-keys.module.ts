import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { PublicApiController } from './public-api.controller';
import { ApiKey } from './api-key.entity';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { SmsModule } from '../sms/sms.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey]),
    WhatsappModule,
    SmsModule,
    UsersModule,
  ],
  providers: [ApiKeysService],
  controllers: [ApiKeysController, PublicApiController],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
