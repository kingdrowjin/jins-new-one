import { Module } from '@nestjs/common';
import { SmsService } from './sms.service';
import { SmsController } from './sms.controller';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  providers: [SmsService],
  controllers: [SmsController],
  exports: [SmsService],
})
export class SmsModule {}
