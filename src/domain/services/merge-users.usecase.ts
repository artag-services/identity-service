import { IUserRepository, UserRecord } from '../ports/IUserRepository'
import { IEventPublisher } from '../ports/IEventPublisher'
import { DATA_EVENTS } from '../values/identity-events'

export interface MergeUsersCommand {
  primaryUserId: string
  secondaryUserId: string
  reason: string
}

export class MergeUsersUseCase {
  constructor(
    private readonly repo: IUserRepository,
    private readonly eventBus: IEventPublisher,
  ) {}

  async execute(command: MergeUsersCommand): Promise<UserRecord> {
    const primary = await this.repo.findUserById(command.primaryUserId, { identities: true, contacts: true })
    const secondary = await this.repo.findUserById(command.secondaryUserId, { identities: true, contacts: true })

    if (!primary || !secondary) {
      throw new Error('One or both users not found')
    }

    for (const identity of secondary.identities ?? []) {
      await this.repo.updateIdentity(identity.id, { userId: command.primaryUserId })
    }

    for (const contact of secondary.contacts ?? []) {
      try {
        await this.repo.upsertContact(
          command.primaryUserId,
          contact.type,
          contact.value,
          contact.trustScore,
          contact.source,
        )
      } catch {
        // best-effort
      }
    }

    const mergedNicknames = [...new Set(
      [...primary.nicknames, ...(secondary.nicknames ?? []), secondary.realName].filter((n): n is string => n != null),
    )]

    const updated = await this.repo.updateUser(command.primaryUserId, {
      nicknames: mergedNicknames,
    })

    await this.repo.updateUser(command.secondaryUserId, {
      deletedAt: new Date().toISOString(),
    })

    for (const identity of secondary.identities ?? []) {
      await this.publishUserSnapshot(command.primaryUserId, identity.channelUserId, identity.channel)
    }

    this.eventBus.publish(DATA_EVENTS.USER_DELETED, {
      userId: command.secondaryUserId,
      reason: 'merged',
      mergedInto: command.primaryUserId,
      deletedAt: new Date().toISOString(),
    })

    return updated
  }

  private async publishUserSnapshot(userId: string, channelUserId: string, channel: string): Promise<void> {
    const user = await this.repo.findUserById(userId)
    const identity = await this.repo.findIdentityByChannel(channelUserId, channel)
    if (!user || !identity) return

    this.eventBus.publish(DATA_EVENTS.USER_LINKED, {
      userId,
      channel: identity.identity.channel,
      channelUserId: identity.identity.channelUserId,
      displayName: identity.identity.displayName ?? user.realName ?? null,
      realName: user.realName ?? null,
      avatarUrl: identity.identity.avatarUrl ?? null,
      aiEnabled: user.aiEnabled,
      linkedAt: identity.identity.updatedAt,
    })
  }
}
