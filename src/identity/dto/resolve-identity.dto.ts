/// DTO for resolving/creating an identity
export class ResolveIdentityDto {
  /// Channel name (whatsapp, instagram, slack, email, etc)
  channel!: string;

  /// User ID from the channel
  channelUserId!: string;

  /// Display name as provided by channel
  displayName?: string;

  /// Phone number (optional, used for matching)
  phone?: string;

  /// Email address (optional, used for matching)
  email?: string;

  /// Username/handle (optional, used for matching)
  username?: string;

  /// Avatar/profile picture URL
  avatarUrl?: string;

  /// Trust score for the identity (0.0-1.0)
  trustScore?: number;

  /// Additional metadata
  metadata?: Record<string, any>;
}
