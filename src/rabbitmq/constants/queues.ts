/**
 * Identity Service RabbitMQ constants
 * Importa las constantes del gateway para mantener consistencia
 */

export const IDENTITY_ROUTING_KEYS = {
  /// Event: Channel sends user identity data (resolve/create/update user)
  RESOLVE_IDENTITY: 'channels.identity.resolve',
  
  /// Queries (Request-Response pattern with correlationId)
  GET_USER: 'channels.identity.get_user',
  GET_ALL_USERS: 'channels.identity.get_all_users',
  MERGE_USERS: 'channels.identity.merge_users',
  DELETE_USER: 'channels.identity.delete_user',
  GET_REPORT: 'channels.identity.get_report',
  
  /// Update events from channels
  UPDATE_PHONE: 'channels.identity.update_phone',
  UPDATE_EMAIL: 'channels.identity.update_email',
  UPDATE_AI_SETTINGS: 'channels.identity.update_ai_settings',
  
  /// Response routing key (identity-service → gateway)
  RESPONSE: 'identity.responses',
} as const;

export const IDENTITY_QUEUES = {
  RESOLVE_IDENTITY: 'identity.resolve',
  GET_USER: 'identity.get_user',
  GET_ALL_USERS: 'identity.get_all_users',
  MERGE_USERS: 'identity.merge_users',
  DELETE_USER: 'identity.delete_user',
  GET_REPORT: 'identity.get_report',
  UPDATE_PHONE: 'identity.update_phone',
  UPDATE_EMAIL: 'identity.update_email',
  UPDATE_AI_SETTINGS: 'identity.update_ai_settings',
  RESPONSES: 'gateway.identity.responses',
} as const;

