import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { ResolveIdentityDto, MergeUsersDto } from './dto';
import { User, UserIdentity, UserContact } from '@prisma/client';
import { v4 as uuid } from 'uuid';

interface MatchResult {
  userId?: string;
  matchType: 'phone' | 'email' | 'username' | 'new';
  confidence: number;
}

/**
 * `data.*` routing keys this service emits to the CQRS bus. Sync-service
 * subscribes to `data.#` and projects these into MongoDB.
 *
 * Rule: every successful write to our own Postgres MUST be followed by
 * publishing a structured event here. The read model is downstream and
 * stale until it consumes these events.
 */
const DATA_EVENTS = {
  USER_CREATED: 'data.identity.user.created',
  USER_LINKED: 'data.identity.user.linked',
  USER_NAME_UPDATED: 'data.identity.user.name-updated',
  USER_DELETED: 'data.identity.user.deleted',
} as const;

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  /// Trust scores by channel
  private readonly CHANNEL_TRUST_SCORES: Record<string, number> = {
    instagram: 0.95,
    slack: 0.95,
    email: 0.90,
    notion: 0.80,
    whatsapp: 0.70,
    facebook: 0.75,
    tiktok: 0.70,
  };

  constructor(
    private prisma: PrismaService,
    private rabbitmq: RabbitMQService,
  ) {}

  /// Resolve or create a user identity
  async resolveIdentity(dto: ResolveIdentityDto): Promise<User> {
    this.logger.debug(
      `Resolving identity - Channel: ${dto.channel}, ChannelUserId: ${dto.channelUserId}`,
    );

    // Check if identity already exists
    const existingIdentity = await this.prisma.userIdentity.findUnique({
      where: {
        channelUserId_channel: {
          channelUserId: dto.channelUserId,
          channel: dto.channel,
        },
      },
      include: { user: true },
    });

    let user: User;
    let isNewUser = false;

    if (existingIdentity) {
      this.logger.debug(`Identity already exists for user ${existingIdentity.userId}`);
      await this.updateUserIdentity(existingIdentity.id, dto);
      user = existingIdentity.user;
    } else {
      // Try to match with existing user by phone, email, or username
      const match = await this.findMatchingUser(dto);
      if (match && match.userId) {
        this.logger.debug(`Found matching user ${match.userId} via ${match.matchType}`);
        user = await this.linkIdentityToUser(match.userId, dto);
      } else {
        this.logger.debug(`No match found, creating new user for identity ${dto.channelUserId}`);
        user = await this.createNewUser(dto);
        isNewUser = true;
      }
      // Create user contact records (only on first sight; existing-identity path doesn't change contacts)
      await this.createUserContacts(user.id, dto);
    }

    // ─── CQRS: emit events after ALL Postgres writes succeed ───
    // Postgres is source of truth; sync-service projects this into Mongo.
    await this.publishUserSnapshot(user.id, dto.channel, dto.channelUserId, { isNewUser });
    return user;
  }

  /// Find matching user by phone, email, or username (priority order)
  private async findMatchingUser(dto: ResolveIdentityDto): Promise<MatchResult | null> {
    // Priority: phone > email > username
    if (dto.phone) {
      const match = await this.prisma.userContact.findFirst({
        where: {
          type: 'phone',
          value: dto.phone,
          user: { deletedAt: null },
        },
        include: { user: true },
      });

      if (match) {
        return {
          userId: match.userId,
          matchType: 'phone',
          confidence: 0.95,
        };
      }
    }

    if (dto.email) {
      const match = await this.prisma.userContact.findFirst({
        where: {
          type: 'email',
          value: dto.email,
          user: { deletedAt: null },
        },
        include: { user: true },
      });

      if (match) {
        return {
          userId: match.userId,
          matchType: 'email',
          confidence: 0.85,
        };
      }
    }

    if (dto.username) {
      const match = await this.prisma.userContact.findFirst({
        where: {
          type: 'username',
          value: dto.username,
          user: { deletedAt: null },
        },
        include: { user: true },
      });

      if (match) {
        return {
          userId: match.userId,
          matchType: 'username',
          confidence: 0.75,
        };
      }
    }

    return null;
  }

  /// Link an identity to an existing user
  private async linkIdentityToUser(userId: string, dto: ResolveIdentityDto): Promise<User> {
    const trustScore = this.CHANNEL_TRUST_SCORES[dto.channel] || 0.5;

    // Create the user identity con username en metadata
    const metadata = {
      ...dto.metadata,
      username: dto.username,
    };

    await this.prisma.userIdentity.create({
      data: {
        channelUserId: dto.channelUserId,
        channel: dto.channel,
        displayName: dto.displayName,
        avatarUrl: dto.avatarUrl,
        trustScore,
        metadata,
        userId,
      },
    });

    // Update user name if new source has higher trust score
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new Error(`User ${userId} not found`);

    // Agregar username como nickname si no está incluido
    let nicknamesToAdd: string[] = [];
    if (dto.username && !user.nicknames.includes(dto.username)) {
      nicknamesToAdd.push(dto.username);
    }

    if (dto.displayName && trustScore > (user.nameTrustScore || 0)) {
      this.logger.debug(
        `Updating user name from ${user.realName} to ${dto.displayName} (source: ${dto.channel})`
      );

      // Record name history
      await this.prisma.nameHistory.create({
        data: {
          userId,
          previousName: user.realName,
          newName: dto.displayName,
          reason: `Updated from ${dto.channel}`,
          source: dto.channel,
          trustScore,
        },
      });

      // Update user with new name y nicknames
      const nicknamesToPush = [user.realName || dto.displayName, ...nicknamesToAdd].filter(
        (n): n is string => n !== null && n !== undefined && !user.nicknames.includes(n)
      );

      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          realName: dto.displayName,
          nameTrustScore: trustScore,
          nameSource: dto.channel,
          nicknames: {
            push: nicknamesToPush,
          },
        },
      });
      return updatedUser;
    } else if (dto.displayName && !user.nicknames.includes(dto.displayName)) {
      // Add as nickname if not already there
      const nicknamesToPush = [dto.displayName, ...nicknamesToAdd].filter(
        (n): n is string => n !== null && n !== undefined && !user.nicknames.includes(n)
      );

      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          nicknames: {
            push: nicknamesToPush,
          },
        },
      });
      return updatedUser;
    } else if (nicknamesToAdd.length > 0) {
      // Solo agregar username como nickname si no hay cambio de nombre
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          nicknames: {
            push: nicknamesToAdd,
          },
        },
      });
      return updatedUser;
    }

    return user;
  }

  /// Create a new user with initial identity
  private async createNewUser(dto: ResolveIdentityDto): Promise<User> {
    const trustScore = this.CHANNEL_TRUST_SCORES[dto.channel] || 0.5;
    const userId = uuid();

    // Crear lista de nicknames con displayName y username si están disponibles
    const nicknames: string[] = [];
    if (dto.displayName) {
      nicknames.push(dto.displayName);
    }
    // Agregar username como nickname si es diferente al displayName
    if (dto.username && dto.username !== dto.displayName && !nicknames.includes(dto.username)) {
      nicknames.push(dto.username);
    }

    const user = await this.prisma.user.create({
      data: {
        id: userId,
        realName: dto.displayName,
        nicknames,
        nameTrustScore: trustScore,
        nameSource: dto.channel,
      },
    });

    // Create the user identity con username en metadata
    const metadata = {
      ...dto.metadata,
      username: dto.username,
    };

    await this.prisma.userIdentity.create({
      data: {
        channelUserId: dto.channelUserId,
        channel: dto.channel,
        displayName: dto.displayName,
        avatarUrl: dto.avatarUrl,
        trustScore,
        metadata,
        userId,
      },
    });

    return user;
  }

  /// Update an existing user identity
  private async updateUserIdentity(identityId: string, dto: ResolveIdentityDto): Promise<void> {
    const trustScore = this.CHANNEL_TRUST_SCORES[dto.channel] || 0.5;

    await this.prisma.userIdentity.update({
      where: { id: identityId },
      data: {
        displayName: dto.displayName,
        avatarUrl: dto.avatarUrl,
        trustScore,
        metadata: dto.metadata,
      },
    });
  }

  /// Create or update user contact records (phone, email, username)
  private async createUserContacts(userId: string, dto: ResolveIdentityDto): Promise<void> {
    const trustScore = this.CHANNEL_TRUST_SCORES[dto.channel] || 0.5;

    // Phone
    if (dto.phone) {
      try {
        await this.prisma.userContact.upsert({
          where: {
            userId_type_value: {
              userId,
              type: 'phone',
              value: dto.phone,
            },
          },
          create: {
            userId,
            type: 'phone',
            value: dto.phone,
            trustScore,
            source: dto.channel,
          },
          update: {
            trustScore,
            source: dto.channel,
            updatedAt: new Date(),
          },
        });
      } catch (error) {
        this.logger.warn(`Error creating phone contact: ${(error as Error).message}`);
      }
    }

    // Email
    if (dto.email) {
      try {
        await this.prisma.userContact.upsert({
          where: {
            userId_type_value: {
              userId,
              type: 'email',
              value: dto.email,
            },
          },
          create: {
            userId,
            type: 'email',
            value: dto.email,
            trustScore,
            source: dto.channel,
          },
          update: {
            trustScore,
            source: dto.channel,
            updatedAt: new Date(),
          },
        });
      } catch (error) {
        this.logger.warn(`Error creating email contact: ${(error as Error).message}`);
      }
    }

    // Username
    if (dto.username) {
      try {
        await this.prisma.userContact.upsert({
          where: {
            userId_type_value: {
              userId,
              type: 'username',
              value: dto.username,
            },
          },
          create: {
            userId,
            type: 'username',
            value: dto.username,
            trustScore,
            source: dto.channel,
          },
          update: {
            trustScore,
            source: dto.channel,
            updatedAt: new Date(),
          },
        });
      } catch (error) {
        this.logger.warn(`Error creating username contact: ${(error as Error).message}`);
      }
    }
  }

  /// Get user by ID with all related data
  async getUser(userId: string): Promise<User & { identities: UserIdentity[]; contacts: UserContact[] } | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        identities: true,
        contacts: true,
      },
    });
  }

  /// Get all users (with optional filters)
  async getAllUsers(filters?: {
    channel?: string;
    includeDeleted?: boolean;
  }): Promise<User[]> {
    return this.prisma.user.findMany({
      where: {
        deletedAt: filters?.includeDeleted ? undefined : null,
      },
      include: {
        identities: filters?.channel ? {
          where: { channel: filters.channel },
        } : true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /// Merge two users (secondary into primary)
  async mergeUsers(dto: MergeUsersDto): Promise<User> {
    const { primaryUserId, secondaryUserId, reason } = dto;

    this.logger.debug(
      `Merging user ${secondaryUserId} into ${primaryUserId}. Reason: ${reason}`,
    );

    // Get both users
    const primary = await this.prisma.user.findUnique({
      where: { id: primaryUserId },
      include: { identities: true, contacts: true },
    });

    const secondary = await this.prisma.user.findUnique({
      where: { id: secondaryUserId },
      include: { identities: true, contacts: true },
    });

    if (!primary || !secondary) {
      throw new Error('One or both users not found');
    }

    // Move all identities from secondary to primary
    for (const identity of secondary.identities) {
      await this.prisma.userIdentity.update({
        where: { id: identity.id },
        data: { userId: primaryUserId },
      });
    }

    // Move all contacts from secondary to primary (avoid duplicates)
    for (const contact of secondary.contacts) {
      try {
        await this.prisma.userContact.upsert({
          where: {
            userId_type_value: {
              userId: primaryUserId,
              type: contact.type,
              value: contact.value,
            },
          },
          create: {
            userId: primaryUserId,
            type: contact.type,
            value: contact.value,
            trustScore: contact.trustScore,
            source: contact.source,
          },
          update: {
            trustScore: Math.max(contact.trustScore, 0.5),
          },
        });
      } catch (error) {
        this.logger.warn(`Error merging contact: ${(error as Error).message}`);
      }
    }

    // Merge nicknames
    const mergedNicknames = Array.from(
      new Set([...primary.nicknames, ...secondary.nicknames, secondary.realName].filter((n): n is string => n !== null && n !== undefined)),
    );

    // Update primary user
    const updated = await this.prisma.user.update({
      where: { id: primaryUserId },
      data: {
        nicknames: mergedNicknames,
      },
      include: {
        identities: true,
        contacts: true,
      },
    });

    // Soft delete secondary user
    await this.prisma.user.update({
      where: { id: secondaryUserId },
      data: { deletedAt: new Date() },
    });

    this.logger.debug(`Successfully merged users. Primary now has ${updated.identities.length} identities`);

    // ─── CQRS: announce the moved identities + the deleted secondary ───
    // For each identity that just got reparented, emit a user.linked event so
    // the read model attaches it to the primary's UnifiedUser. Then mark the
    // secondary as deleted so it disappears from query results.
    for (const identity of secondary.identities) {
      await this.publishUserSnapshot(primaryUserId, identity.channel, identity.channelUserId)
        .catch((e) =>
          this.logger.warn(
            `Failed to publish post-merge linked event for ${identity.channel}:${identity.channelUserId}: ${(e as Error).message}`,
          ),
        );
    }
    await this.publishUserDeleted(secondaryUserId, 'merged', { mergedInto: primaryUserId, reason })
      .catch((e) =>
        this.logger.warn(`Failed to publish user.deleted for merged secondary: ${(e as Error).message}`),
      );

    return updated;
  }

  /// Soft delete a user
  async deleteUser(userId: string): Promise<User> {
    const deleted = await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });

    await this.publishUserDeleted(userId, 'soft-delete').catch((e) =>
      this.logger.warn(`Failed to publish user.deleted: ${(e as Error).message}`),
    );

    return deleted;
  }

  /// Get identity report
  async getReport(): Promise<any> {
    const totalUsers = await this.prisma.user.count({
      where: { deletedAt: null },
    });

    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      include: { identities: true, contacts: true },
    });

    const channels = await this.prisma.userIdentity.groupBy({
      by: ['channel'],
      _count: {
        id: true,
      },
      where: {
        user: { deletedAt: null },
      },
    });

    return {
      totalUsers,
      usersByChannel: channels.map((c) => ({
        channel: c.channel,
        count: c._count.id,
      })),
      report: {
        usersWithMultipleIdentities: users.filter((u) => u.identities.length > 1).length,
        usersWithoutName: users.filter((u) => !u.realName).length,
        averageIdentitiesPerUser: users.length > 0
          ? (users.reduce((acc, u) => acc + u.identities.length, 0) / users.length).toFixed(2)
          : 0,
      },
    };
  }

  /// Update user AI settings
  async updateAISettings(userId: string, aiEnabled: boolean): Promise<User> {
    this.logger.log(`Updating AI settings for user ${userId}: aiEnabled=${aiEnabled}`);

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        aiEnabled,
        aiEnabledAt: new Date(),
      },
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // CQRS event publishers
  //
  // These run AFTER Postgres writes have committed. Sync-service consumes
  // `data.#` and projects into MongoDB. We always re-read the user/identity
  // from Postgres to make sure the payload reflects the final state — never
  // construct the event from DTO fields alone (those may not be the latest).
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Emit a snapshot of (user + identity-just-touched). Idempotent: sync's
   * IdentityProjector upserts and dedupes the identities array, so replaying
   * is safe. We also emit a `user.created` event the first time only.
   */
  private async publishUserSnapshot(
    userId: string,
    channel: string,
    channelUserId: string,
    opts: { isNewUser?: boolean } = {},
  ): Promise<void> {
    const [user, identity] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.userIdentity.findUnique({
        where: { channelUserId_channel: { channelUserId, channel } },
      }),
    ]);

    if (!user || !identity) {
      this.logger.warn(
        `publishUserSnapshot: missing user (${!!user}) or identity (${!!identity}) for ${userId} ${channel}:${channelUserId}`,
      );
      return;
    }

    const payload = {
      userId: user.id,
      channel: identity.channel,
      channelUserId: identity.channelUserId,
      displayName: identity.displayName ?? user.realName ?? null,
      realName: user.realName ?? null,
      avatarUrl: identity.avatarUrl ?? null,
      linkedAt: identity.updatedAt.toISOString(),
    };

    if (opts.isNewUser) {
      await this.rabbitmq.publish(DATA_EVENTS.USER_CREATED, payload);
    }
    await this.rabbitmq.publish(DATA_EVENTS.USER_LINKED, payload);
  }

  /** Announce a (soft) deletion to the read model. */
  private async publishUserDeleted(
    userId: string,
    reason: 'soft-delete' | 'merged',
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.rabbitmq.publish(DATA_EVENTS.USER_DELETED, {
      userId,
      reason,
      deletedAt: new Date().toISOString(),
      ...extra,
    });
  }
}
