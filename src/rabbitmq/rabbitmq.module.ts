import { Global, Module } from '@nestjs/common';
import { RabbitMQService } from './rabbitmq.service';

/**
 * Global so feature modules (AdminModule, IdentityModule, …) can inject
 * RabbitMQService without importing RabbitMQModule explicitly. Matches the
 * pattern used by every other service in this stack.
 */
@Global()
@Module({
  providers: [RabbitMQService],
  exports: [RabbitMQService],
})
export class RabbitMQModule {}
