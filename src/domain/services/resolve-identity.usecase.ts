import { IUserRepository, UserRecord, CreateIdentityData, CreateNameHistoryData } from '../ports/IUserRepository'
import { IEventPublisher } from '../ports/IEventPublisher'
import { getTrustScore } from '../values/channel-trust-scores'
import { DATA_EVENTS, buildUserLinkedPayload } from '../values/identity-events'

export interface ResolveIdentityCommand {
  channel: string
  channelUserId: string
  displayName?: string
  phone?: string
  email?: string
  username?: string
  avatarUrl?: string
  trustScore?: number
  metadata?: Record<string, unknown>
}

interface MatchResult {
  userId: string
  matchType: 'phone' | 'email' | 'username' | 'new'
  confidence: number
}

export class ResolveIdentityUseCase {
  constructor(
    private readonly repo: IUserRepository,
    private readonly eventBus: IEventPublisher,
  ) {}

  async execute(command: ResolveIdentityCommand): Promise<UserRecord> {
    const existing = await this.repo.findIdentityByChannel(command.channelUserId, command.channel)

    if (existing) {
      await this.repo.updateIdentity(existing.identity.id, {
        displayName: command.displayName ?? null,
        avatarUrl: command.avatarUrl ?? null,
        trustScore: getTrustScore(command.channel),
        metadata: command.metadata ?? null,
      })

      await this.publishUserSnapshot(existing.user.id, command.channelUserId, command.channel, { isNewUser: false })
      const u = await this.repo.findUserById(existing.user.id, { identities: true, contacts: true })
      return u!
    }

    const match = await this.findMatchingUser(command)
    let userId: string
    let isNewUser = false

    if (match) {
      userId = match.userId
      await this.linkIdentityToUser(userId, command)
    } else {
      const user = await this.repo.createUser({
        realName: command.displayName ?? null,
        nicknames: this.buildNicknames(command),
        nameTrustScore: getTrustScore(command.channel),
        nameSource: command.channel,
      })
      userId = user.id
      isNewUser = true

      await this.repo.createIdentity({
        channelUserId: command.channelUserId,
        channel: command.channel,
        displayName: command.displayName ?? null,
        avatarUrl: command.avatarUrl ?? null,
        metadata: this.buildIdentityMetadata(command),
        trustScore: getTrustScore(command.channel),
        userId,
      })
    }

    await this.createUserContacts(userId, command)
    await this.publishUserSnapshot(userId, command.channelUserId, command.channel, { isNewUser })

    const u = await this.repo.findUserById(userId, { identities: true, contacts: true })
    return u!
  }

  private async findMatchingUser(command: ResolveIdentityCommand): Promise<MatchResult | null> {
    if (command.phone) {
      const contact = await this.repo.findContactByTypeValue('phone', command.phone)
      if (contact) return { userId: contact.user.id, matchType: 'phone', confidence: 0.95 }
    }

    if (command.email) {
      const contact = await this.repo.findContactByTypeValue('email', command.email)
      if (contact) return { userId: contact.user.id, matchType: 'email', confidence: 0.85 }
    }

    if (command.username) {
      const contact = await this.repo.findContactByTypeValue('username', command.username)
      if (contact) return { userId: contact.user.id, matchType: 'username', confidence: 0.75 }
    }

    return null
  }

  private async linkIdentityToUser(userId: string, command: ResolveIdentityCommand): Promise<void> {
    const trustScore = getTrustScore(command.channel)

    await this.repo.createIdentity({
      channelUserId: command.channelUserId,
      channel: command.channel,
      displayName: command.displayName ?? null,
      avatarUrl: command.avatarUrl ?? null,
      metadata: this.buildIdentityMetadata(command),
      trustScore,
      userId,
    })

    const user = await this.repo.findUserById(userId)
    if (!user) throw new Error(`User ${userId} not found`)

    const nicknamesToAdd: string[] = []
    if (command.username && !user.nicknames.includes(command.username)) {
      nicknamesToAdd.push(command.username)
    }

    if (command.displayName && trustScore > (user.nameTrustScore || 0)) {
      const nameHistory: CreateNameHistoryData = {
        userId,
        previousName: user.realName,
        newName: command.displayName,
        reason: `Updated from ${command.channel}`,
        source: command.channel,
        trustScore,
      }
      await this.repo.createNameHistory(nameHistory)
      this.eventBus.publish(DATA_EVENTS.USER_NAME_UPDATED, {
        userId,
        previousName: user.realName,
        newName: command.displayName,
        channel: command.channel,
        trustScore,
      })

      const nicknamesToPush = [user.realName || command.displayName, ...nicknamesToAdd]
        .filter((n): n is string => n != null && !user.nicknames.includes(n))

      await this.repo.updateUser(userId, {
        realName: command.displayName,
        nameTrustScore: trustScore,
        nameSource: command.channel,
        nicknames: [...new Set([...user.nicknames, ...nicknamesToPush])],
      })
    } else if (command.displayName && !user.nicknames.includes(command.displayName)) {
      const nicknamesToPush = [command.displayName, ...nicknamesToAdd]
        .filter((n): n is string => n != null && !user.nicknames.includes(n))

      await this.repo.updateUser(userId, {
        nicknames: [...new Set([...user.nicknames, ...nicknamesToPush])],
      })
    } else if (nicknamesToAdd.length > 0) {
      await this.repo.updateUser(userId, {
        nicknames: [...new Set([...user.nicknames, ...nicknamesToAdd])],
      })
    }
  }

  private async createUserContacts(userId: string, command: ResolveIdentityCommand): Promise<void> {
    const trustScore = getTrustScore(command.channel)

    for (const entry of [
      { type: 'phone', value: command.phone },
      { type: 'email', value: command.email },
      { type: 'username', value: command.username },
    ]) {
      if (entry.value) {
        try {
          await this.repo.upsertContact(userId, entry.type, entry.value, trustScore, command.channel)
        } catch {
          // best-effort
        }
      }
    }
  }

  private buildNicknames(command: ResolveIdentityCommand): string[] {
    const nicknames: string[] = []
    if (command.displayName) nicknames.push(command.displayName)
    if (command.username && command.username !== command.displayName && !nicknames.includes(command.username)) {
      nicknames.push(command.username)
    }
    return nicknames
  }

  private buildIdentityMetadata(command: ResolveIdentityCommand): Record<string, unknown> | null {
    const meta: Record<string, unknown> = { ...(command.metadata ?? {}) }
    if (command.username) meta.username = command.username
    return Object.keys(meta).length > 0 ? meta : null
  }

  private async publishUserSnapshot(
    userId: string,
    channelUserId: string,
    channel: string,
    opts: { isNewUser?: boolean } = {},
  ): Promise<void> {
    const user = await this.repo.findUserById(userId)
    const identity = await this.repo.findIdentityByChannel(channelUserId, channel)
    if (!user || !identity) return

    const payload = buildUserLinkedPayload(userId, identity.identity, user)

    if (opts.isNewUser) {
      this.eventBus.publish(DATA_EVENTS.USER_CREATED, payload)
    }
    this.eventBus.publish(DATA_EVENTS.USER_LINKED, payload)
  }
}
