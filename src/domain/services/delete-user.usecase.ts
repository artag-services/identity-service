import { IUserRepository, UserRecord } from '../ports/IUserRepository'
import { IEventPublisher } from '../ports/IEventPublisher'
import { DATA_EVENTS } from '../values/identity-events'

export interface DeleteUserCommand {
  userId: string
}

export class DeleteUserUseCase {
  constructor(
    private readonly repo: IUserRepository,
    private readonly eventBus: IEventPublisher,
  ) {}

  async execute(command: DeleteUserCommand): Promise<UserRecord> {
    const updated = await this.repo.updateUser(command.userId, {
      deletedAt: new Date().toISOString(),
    })

    this.eventBus.publish(DATA_EVENTS.USER_DELETED, {
      userId: command.userId,
      reason: 'soft-delete',
      deletedAt: new Date().toISOString(),
    })

    return updated
  }
}
