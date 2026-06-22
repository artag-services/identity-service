export interface UserRecord {
  id: string
  realName: string | null
  nicknames: string[]
  nameTrustScore: number
  nameSource: string | null
  aiEnabled: boolean
  aiEnabledAt: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  identities?: UserIdentityRecord[]
  contacts?: UserContactRecord[]
}

export interface UserIdentityRecord {
  id: string
  channelUserId: string
  channel: string
  displayName: string | null
  avatarUrl: string | null
  metadata: Record<string, unknown> | null
  trustScore: number
  userId: string
  createdAt: string
  updatedAt: string
}

export interface UserContactRecord {
  id: string
  type: string
  value: string
  trustScore: number
  source: string | null
  userId: string
  createdAt: string
  updatedAt: string
}

export interface CreateUserData {
  realName?: string | null
  nicknames: string[]
  nameTrustScore: number
  nameSource?: string | null
}

export interface CreateIdentityData {
  channelUserId: string
  channel: string
  displayName?: string | null
  avatarUrl?: string | null
  metadata?: Record<string, unknown> | null
  trustScore: number
  userId: string
}

export interface CreateNameHistoryData {
  userId: string
  previousName?: string | null
  newName?: string | null
  reason?: string | null
  source?: string | null
  trustScore: number
}

export interface IdentityWithUser {
  identity: UserIdentityRecord
  user: UserRecord
}

export interface ContactWithUser {
  contact: UserContactRecord
  user: UserRecord
}

export interface IUserRepository {
  findIdentityByChannel(channelUserId: string, channel: string): Promise<IdentityWithUser | null>
  findContactByTypeValue(type: string, value: string): Promise<ContactWithUser | null>
  findUserById(id: string, include?: { identities?: boolean; contacts?: boolean }): Promise<UserRecord | null>
  findUsers(filters?: { channel?: string; includeDeleted?: boolean; includeRelations?: boolean }): Promise<UserRecord[]>
  countActiveUsers(): Promise<number>
  groupIdentitiesByChannel(): Promise<Array<{ channel: string; count: number }>>
  createUser(data: CreateUserData): Promise<UserRecord>
  createIdentity(data: CreateIdentityData): Promise<UserIdentityRecord>
  updateIdentity(id: string, data: Record<string, unknown>): Promise<void>
  updateUser(id: string, data: Record<string, unknown>): Promise<UserRecord>
  upsertContact(userId: string, type: string, value: string, trustScore: number, source?: string | null): Promise<UserContactRecord>
  createNameHistory(data: CreateNameHistoryData): Promise<void>
}
