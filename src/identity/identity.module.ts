import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';
import { IdentityService } from './identity.service';
import { IdentityListener } from './identity.listener';

@Module({
  imports: [PrismaModule, RabbitMQModule],
  providers: [IdentityService, IdentityListener],
  exports: [IdentityService],
})
export class IdentityModule {}
