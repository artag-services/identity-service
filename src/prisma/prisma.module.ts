import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global so feature modules (AdminModule, IdentityModule, …) can inject
 * PrismaService without importing PrismaModule explicitly. Matches the
 * pattern used by every other service in this stack.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
