import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  IUserRepository,
  UserRecord,
  UserIdentityRecord,
  UserContactRecord,
  IdentityWithUser,
  ContactWithUser,
  CreateUserData,
  CreateIdentityData,
  CreateNameHistoryData,
} from '../../domain/ports/IUserRepository'

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  private readonly logger = new Logger(PrismaUserRepository.name)

  constructor(private readonly prisma: PrismaService) {}

  async findIdentityByChannel(channelUserId: string, channel: string): Promise<IdentityWithUser | null> {
    const record = await this.prisma.userIdentity.findUnique({
      where: { channelUserId_channel: { channelUserId, channel } },
      include: { user: true },
    })
    if (!record) return null
    return {
      identity: this.toIdentityRecord(record),
      user: this.toUserRecord(record.user),
    }
  }

  async findContactByTypeValue(type: string, value: string): Promise<ContactWithUser | null> {
    const record = await this.prisma.userContact.findFirst({
      where: { type, value, user: { deletedAt: null } },
      include: { user: true },
    })
    if (!record) return null
    return {
      contact: this.toContactRecord(record),
      user: this.toUserRecord(record.user),
    }
  }

  async findUserById(id: string, include?: { identities?: boolean; contacts?: boolean }): Promise<UserRecord | null> {
    const incl: Record<string, boolean> = {}
    if (include?.identities) incl.identities = true
    if (include?.contacts) incl.contacts = true

    const record = await this.prisma.user.findUnique({
      where: { id },
      include: Object.keys(incl).length > 0 ? incl : undefined,
    })
    if (!record) return null
    return this.toUserRecord(record)
  }

  async findUsers(filters?: { channel?: string; includeDeleted?: boolean; includeRelations?: boolean }): Promise<UserRecord[]> {
    const where: Record<string, unknown> = {}
    if (!filters?.includeDeleted) where.deletedAt = null

    const include: Record<string, unknown> = {}
    if (filters?.channel) {
      include.identities = { where: { channel: filters.channel } }
    } else if (filters?.includeRelations) {
      include.identities = true
    }
    if (filters?.includeRelations) {
      include.contacts = true
    }

    const records = await this.prisma.user.findMany({
      where,
      include: Object.keys(include).length > 0 ? include : undefined,
      orderBy: { createdAt: 'desc' },
    })
    return records.map((r) => this.toUserRecord(r))
  }

  async countActiveUsers(): Promise<number> {
    return this.prisma.user.count({ where: { deletedAt: null } })
  }

  async groupIdentitiesByChannel(): Promise<Array<{ channel: string; count: number }>> {
    const channels = await this.prisma.userIdentity.groupBy({
      by: ['channel'],
      _count: { id: true },
      where: { user: { deletedAt: null } },
    })
    return channels.map((c) => ({ channel: c.channel, count: c._count.id }))
  }

  async createUser(data: CreateUserData): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: {
        realName: data.realName ?? null,
        nicknames: data.nicknames ?? [],
        nameTrustScore: data.nameTrustScore,
        nameSource: data.nameSource ?? null,
      },
    })
    return this.toUserRecord(user)
  }

  async createIdentity(data: CreateIdentityData): Promise<UserIdentityRecord> {
    const identity = await this.prisma.userIdentity.create({
      data: {
        channelUserId: data.channelUserId,
        channel: data.channel,
        displayName: data.displayName ?? null,
        avatarUrl: data.avatarUrl ?? null,
        metadata: (data.metadata ?? null) as any,
        trustScore: data.trustScore,
        userId: data.userId,
      },
    })
    return this.toIdentityRecord(identity)
  }

  async updateIdentity(id: string, data: Record<string, unknown>): Promise<void> {
    await this.prisma.userIdentity.update({
      where: { id },
      data: data as any,
    })
  }

  async updateUser(id: string, data: Record<string, unknown>): Promise<UserRecord> {
    const record = await this.prisma.user.update({
      where: { id },
      data: data as any,
    })
    return this.toUserRecord(record)
  }

  async upsertContact(
    userId: string,
    type: string,
    value: string,
    trustScore: number,
    source?: string | null,
  ): Promise<UserContactRecord> {
    const record = await this.prisma.userContact.upsert({
      where: { userId_type_value: { userId, type, value } },
      create: { userId, type, value, trustScore, source: source ?? null },
      update: { trustScore, source: source ?? null, updatedAt: new Date() },
    })
    return this.toContactRecord(record)
  }

  async createNameHistory(data: CreateNameHistoryData): Promise<void> {
    await this.prisma.nameHistory.create({
      data: {
        userId: data.userId,
        previousName: data.previousName ?? null,
        newName: data.newName ?? null,
        reason: data.reason ?? null,
        source: data.source ?? null,
        trustScore: data.trustScore,
      },
    })
  }

  private toUserRecord(r: any): UserRecord {
    return {
      id: r.id,
      realName: r.realName ?? null,
      nicknames: r.nicknames ?? [],
      nameTrustScore: r.nameTrustScore,
      nameSource: r.nameSource ?? null,
      aiEnabled: r.aiEnabled,
      aiEnabledAt: r.aiEnabledAt?.toISOString() ?? null,
      deletedAt: r.deletedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      identities: r.identities?.map((i: any) => this.toIdentityRecord(i)),
      contacts: r.contacts?.map((c: any) => this.toContactRecord(c)),
    }
  }

  private toIdentityRecord(r: any): UserIdentityRecord {
    return {
      id: r.id,
      channelUserId: r.channelUserId,
      channel: r.channel,
      displayName: r.displayName ?? null,
      avatarUrl: r.avatarUrl ?? null,
      metadata: (r.metadata ?? null) as Record<string, unknown> | null,
      trustScore: r.trustScore,
      userId: r.userId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }
  }

  private toContactRecord(r: any): UserContactRecord {
    return {
      id: r.id,
      type: r.type,
      value: r.value,
      trustScore: r.trustScore,
      source: r.source ?? null,
      userId: r.userId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }
  }
}
