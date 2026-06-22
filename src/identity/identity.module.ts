import { Module } from '@nestjs/common'

import { PrismaModule } from '../prisma/prisma.module'
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module'

import { PrismaUserRepository } from '../infrastructure/persistence/prisma-user.repository'
import { RabbitMQEventPublisher } from '../infrastructure/event-bus/rabbitmq-event-publisher'

import { ResolveIdentityUseCase } from '../domain/services/resolve-identity.usecase'
import { MergeUsersUseCase } from '../domain/services/merge-users.usecase'
import { DeleteUserUseCase } from '../domain/services/delete-user.usecase'
import { UpdateAISettingsUseCase } from '../domain/services/update-ai-settings.usecase'

import { IdentityListener } from './identity.listener'
import { IdentityQueryService } from './identity-query.service'

@Module({
  imports: [PrismaModule, RabbitMQModule],
  providers: [
    // Ports → Adapters
    { provide: 'IUserRepository', useClass: PrismaUserRepository },
    { provide: 'IEventPublisher', useClass: RabbitMQEventPublisher },

    // Use cases
    {
      provide: ResolveIdentityUseCase,
      useFactory: (repo, bus) => new ResolveIdentityUseCase(repo, bus),
      inject: ['IUserRepository', 'IEventPublisher'],
    },
    {
      provide: MergeUsersUseCase,
      useFactory: (repo, bus) => new MergeUsersUseCase(repo, bus),
      inject: ['IUserRepository', 'IEventPublisher'],
    },
    {
      provide: DeleteUserUseCase,
      useFactory: (repo, bus) => new DeleteUserUseCase(repo, bus),
      inject: ['IUserRepository', 'IEventPublisher'],
    },
    {
      provide: UpdateAISettingsUseCase,
      useFactory: (repo, bus) => new UpdateAISettingsUseCase(repo, bus),
      inject: ['IUserRepository', 'IEventPublisher'],
    },

    // Services
    IdentityQueryService,
    IdentityListener,
  ],
  exports: [IdentityQueryService],
})
export class IdentityModule {}
