import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminGuard } from './admin.guard';
import { BackfillController } from './backfill.controller';
import { RabbitMQEventPublisher } from '../infrastructure/event-bus/rabbitmq-event-publisher';

@Module({
  imports: [ConfigModule],
  controllers: [BackfillController],
  providers: [
    AdminGuard,
    { provide: 'IEventPublisher', useClass: RabbitMQEventPublisher },
  ],
})
export class AdminModule {}
