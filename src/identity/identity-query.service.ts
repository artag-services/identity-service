import { Injectable, Inject, Logger } from '@nestjs/common'
import { IUserRepository, UserRecord } from '../domain/ports/IUserRepository'

@Injectable()
export class IdentityQueryService {
  private readonly logger = new Logger(IdentityQueryService.name)

  constructor(
    @Inject('IUserRepository') private readonly repo: IUserRepository,
  ) {}

  async getUser(userId: string): Promise<UserRecord | null> {
    return this.repo.findUserById(userId, { identities: true, contacts: true })
  }

  async getAllUsers(filters?: { channel?: string; includeDeleted?: boolean }): Promise<UserRecord[]> {
    return this.repo.findUsers(filters)
  }

  async getReport(): Promise<any> {
    const totalUsers = await this.repo.countActiveUsers()
    const users = await this.repo.findUsers({ includeRelations: true })
    const channels = await this.repo.groupIdentitiesByChannel()

    return {
      totalUsers,
      usersByChannel: channels,
      report: {
        usersWithMultipleIdentities: users.filter((u) => (u.identities?.length ?? 0) > 1).length,
        usersWithoutName: users.filter((u) => !u.realName).length,
        averageIdentitiesPerUser:
          users.length > 0
            ? (
                users.reduce((acc, u) => acc + (u.identities?.length ?? 0), 0) / users.length
              ).toFixed(2)
            : 0,
      },
    }
  }
}
