import { IUserRepository, UserRecord } from '../ports/IUserRepository'
import { IEventPublisher } from '../ports/IEventPublisher'
import { DATA_EVENTS } from '../values/identity-events'

export interface UpdateAISettingsCommand {
  userId: string
  aiEnabled: boolean
}

export class UpdateAISettingsUseCase {
  constructor(
    private readonly repo: IUserRepository,
    private readonly eventBus: IEventPublisher,
  ) {}

  async execute(command: UpdateAISettingsCommand): Promise<UserRecord> {
    const updated = await this.repo.updateUser(command.userId, {
      aiEnabled: command.aiEnabled,
      aiEnabledAt: new Date().toISOString(),
    })

    this.eventBus.publish(DATA_EVENTS.USER_AI_UPDATED, {
      userId: updated.id,
      aiEnabled: updated.aiEnabled,
      updatedAt: updated.updatedAt,
    })

    return updated
  }
}
