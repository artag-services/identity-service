import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // RabbitMQ will connect automatically via OnModuleInit hook
  // IdentityListener will set up queues and listeners after connection

  // Keep the service running for consuming messages
  await app.listen(3010);
  console.log('Identity Service running on port 3010');
}

bootstrap().catch((error) => {
  console.error('Failed to start Identity Service:', error);
  process.exit(1);
});
