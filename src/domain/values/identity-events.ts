export const DATA_EVENTS = {
  USER_CREATED: 'data.identity.user.created',
  USER_LINKED: 'data.identity.user.linked',
  USER_NAME_UPDATED: 'data.identity.user.name-updated',
  USER_AI_UPDATED: 'data.identity.user.ai-settings-updated',
  USER_DELETED: 'data.identity.user.deleted',
} as const

export function buildUserLinkedPayload(
  userId: string,
  identity: { channel: string; channelUserId: string; displayName: string | null; avatarUrl: string | null; updatedAt: string },
  user: { realName: string | null; aiEnabled: boolean },
): Record<string, unknown> {
  return {
    userId,
    channel: identity.channel,
    channelUserId: identity.channelUserId,
    displayName: identity.displayName ?? user.realName ?? null,
    realName: user.realName ?? null,
    avatarUrl: identity.avatarUrl ?? null,
    aiEnabled: user.aiEnabled,
    linkedAt: identity.updatedAt,
  }
}
