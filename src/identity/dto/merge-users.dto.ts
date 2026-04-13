/// DTO for merging two users
export class MergeUsersDto {
  /// Primary user ID (the one to keep)
  primaryUserId!: string;

  /// Secondary user ID (the one to merge into primary)
  secondaryUserId!: string;

  /// Reason for the merge
  reason!: string;
}
