import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { SmsModule } from './sms/sms.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { UploadsModule } from './uploads/uploads.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 3306),
        username: configService.get('DB_USERNAME', 'jantu'),
        password: configService.get('DB_PASSWORD', 'jantupassword'),
        database: configService.get('DB_DATABASE', 'jantu'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true,
        logging: false,
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    WhatsappModule,
    SmsModule,
    CampaignsModule,
    ApiKeysModule,
    UploadsModule,
    QueueModule,
  ],
})
export class AppModule {}
