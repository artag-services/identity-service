import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common'
import { RabbitMQService } from '../rabbitmq/rabbitmq.service'
import { IDENTITY_ROUTING_KEYS, IDENTITY_QUEUES } from '../rabbitmq/constants/queues'
import { ResolveIdentityUseCase, ResolveIdentityCommand } from '../domain/services/resolve-identity.usecase'
import { MergeUsersUseCase, MergeUsersCommand } from '../domain/services/merge-users.usecase'
import { DeleteUserUseCase, DeleteUserCommand } from '../domain/services/delete-user.usecase'
import { UpdateAISettingsUseCase, UpdateAISettingsCommand } from '../domain/services/update-ai-settings.usecase'
import { IdentityQueryService } from './identity-query.service'

@Injectable()
export class IdentityListener implements OnModuleInit {
  private readonly logger = new Logger(IdentityListener.name)

  constructor(
    @Inject(RabbitMQService) private rabbitmqService: RabbitMQService,
    @Inject(ResolveIdentityUseCase) private resolveIdentity: ResolveIdentityUseCase,
    @Inject(MergeUsersUseCase) private mergeUsers: MergeUsersUseCase,
    @Inject(DeleteUserUseCase) private deleteUser: DeleteUserUseCase,
    @Inject(UpdateAISettingsUseCase) private updateAISettings: UpdateAISettingsUseCase,
    @Inject(IdentityQueryService) private queryService: IdentityQueryService,
  ) {}

  async onModuleInit(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 1000))
    await this.setupListeners()
  }

  private async setupListeners(): Promise<void> {
    try {
      await this.rabbitmqService.declareQueue(IDENTITY_QUEUES.RESOLVE_IDENTITY, IDENTITY_ROUTING_KEYS.RESOLVE_IDENTITY)
      await this.rabbitmqService.declareQueue(IDENTITY_QUEUES.UPDATE_PHONE, IDENTITY_ROUTING_KEYS.UPDATE_PHONE)
      await this.rabbitmqService.declareQueue(IDENTITY_QUEUES.UPDATE_EMAIL, IDENTITY_ROUTING_KEYS.UPDATE_EMAIL)
      await this.rabbitmqService.declareQueue(IDENTITY_QUEUES.UPDATE_AI_SETTINGS, IDENTITY_ROUTING_KEYS.UPDATE_AI_SETTINGS)
      await this.rabbitmqService.declareQueue(IDENTITY_QUEUES.GET_USER, IDENTITY_ROUTING_KEYS.GET_USER)
      await this.rabbitmqService.declareQueue(IDENTITY_QUEUES.GET_ALL_USERS, IDENTITY_ROUTING_KEYS.GET_ALL_USERS)
      await this.rabbitmqService.declareQueue(IDENTITY_QUEUES.GET_REPORT, IDENTITY_ROUTING_KEYS.GET_REPORT)
      await this.rabbitmqService.declareQueue(IDENTITY_QUEUES.MERGE_USERS, IDENTITY_ROUTING_KEYS.MERGE_USERS)
      await this.rabbitmqService.declareQueue(IDENTITY_QUEUES.DELETE_USER, IDENTITY_ROUTING_KEYS.DELETE_USER)

      // Write operations (fire-and-forget)
      await this.rabbitmqService.consume(IDENTITY_QUEUES.RESOLVE_IDENTITY, (m) => this.handleResolveIdentity(m))
      await this.rabbitmqService.consume(IDENTITY_QUEUES.UPDATE_PHONE, (m) => this.handlePhoneNumberUpdate(m))
      await this.rabbitmqService.consume(IDENTITY_QUEUES.UPDATE_EMAIL, (m) => this.handleEmailUpdate(m))
      await this.rabbitmqService.consume(IDENTITY_QUEUES.UPDATE_AI_SETTINGS, (m) => this.handleUpdateAISettings(m))
      await this.rabbitmqService.consume(IDENTITY_QUEUES.MERGE_USERS, (m) => this.handleMergeUsers(m))
      await this.rabbitmqService.consume(IDENTITY_QUEUES.DELETE_USER, (m) => this.handleDeleteUser(m))

      // Read operations (request-response)
      await this.rabbitmqService.consume(IDENTITY_QUEUES.GET_USER, (m) => this.handleGetUser(m))
      await this.rabbitmqService.consume(IDENTITY_QUEUES.GET_ALL_USERS, (m) => this.handleGetAllUsers(m))
      await this.rabbitmqService.consume(IDENTITY_QUEUES.GET_REPORT, (m) => this.handleGetReport(m))

      this.logger.log('Identity listeners initialized')
    } catch (error) {
      this.logger.error(`Failed to setup listeners: ${(error as Error).message}`)
      throw error
    }
  }

  // ─── Write Operations (Fire-and-forget) ───

  private async handleResolveIdentity(message: any): Promise<void> {
    try {
      this.logger.debug(`Processing resolve identity event: ${JSON.stringify(message)}`)
      const cmd: ResolveIdentityCommand = {
        channel: message.channel,
        channelUserId: message.channelUserId,
        displayName: message.displayName,
        phone: message.phone,
        email: message.email,
        username: message.username,
        avatarUrl: message.avatarUrl,
        trustScore: message.trustScore,
        metadata: message.metadata,
      }
      const user = await this.resolveIdentity.execute(cmd)
      this.logger.log(`Identity resolved - User ID: ${user.id}, Channel: ${message.channel}`)
    } catch (error) {
      const err = error as Error
      this.logger.error(`Error handling resolve identity: ${err.message}`, err.stack)
      throw error
    }
  }

  private async handlePhoneNumberUpdate(message: any): Promise<void> {
    try {
      this.logger.debug(`Processing phone number update: ${JSON.stringify(message)}`)
      const { oldPhoneNumber, newPhoneNumber, userId } = message
      if (newPhoneNumber) {
        await this.resolveIdentity.execute({
          channel: 'whatsapp',
          channelUserId: userId || newPhoneNumber,
          phone: newPhoneNumber,
        })
        this.logger.log(`Phone number update processed: ${oldPhoneNumber} -> ${newPhoneNumber}`)
      }
    } catch (error) {
      const err = error as Error
      this.logger.error(`Error handling phone number update: ${err.message}`, err.stack)
      throw error
    }
  }

  private async handleEmailUpdate(message: any): Promise<void> {
    try {
      this.logger.debug(`Processing email update: ${JSON.stringify(message)}`)
      const { oldEmail, newEmail, userId } = message
      if (newEmail) {
        await this.resolveIdentity.execute({
          channel: 'email',
          channelUserId: userId || newEmail,
          email: newEmail,
        })
        this.logger.log(`Email updated: ${oldEmail} -> ${newEmail} for user ${userId}`)
      }
    } catch (error) {
      const err = error as Error
      this.logger.error(`Error handling email update: ${err.message}`, err.stack)
      throw error
    }
  }

  private async handleUpdateAISettings(message: any): Promise<void> {
    try {
      this.logger.debug(`Processing update AI settings: ${JSON.stringify(message)}`)
      const { userId, aiEnabled } = message
      const result = await this.updateAISettings.execute({ userId, aiEnabled })
      this.logger.log(`AI settings updated for user ${userId}: aiEnabled=${result.aiEnabled}`)
    } catch (error) {
      const err = error as Error
      this.logger.error(`Error handling update AI settings: ${err.message}`, err.stack)
      throw error
    }
  }

  private async handleMergeUsers(message: any): Promise<void> {
    try {
      this.logger.debug(`Processing merge users: ${JSON.stringify(message)}`)
      const { primaryUserId, secondaryUserId, reason } = message
      const result = await this.mergeUsers.execute({ primaryUserId, secondaryUserId, reason })
      this.logger.log(`Users merged successfully: ${result.id}`)
    } catch (error) {
      const err = error as Error
      this.logger.error(`Error handling merge users: ${err.message}`, err.stack)
      throw error
    }
  }

  private async handleDeleteUser(message: any): Promise<void> {
    try {
      this.logger.debug(`Processing delete user: ${JSON.stringify(message)}`)
      const { userId } = message
      const result = await this.deleteUser.execute({ userId })
      this.logger.log(`User deleted: ${result.id}`)
    } catch (error) {
      const err = error as Error
      this.logger.error(`Error handling delete user: ${err.message}`, err.stack)
      throw error
    }
  }

  // ─── Read Operations (Request-Response) ───

  private async handleGetUser(message: any): Promise<void> {
    try {
      this.logger.debug(`Processing get user: ${JSON.stringify(message)}`)
      const { correlationId, userId } = message
      const user = await this.queryService.getUser(userId)
      await this.rabbitmqService.publish(IDENTITY_ROUTING_KEYS.RESPONSE, { correlationId, user, success: true })
      this.logger.log(`Get user response sent for correlationId: ${correlationId}`)
    } catch (error) {
      const err = error as Error
      this.logger.error(`Error handling get user: ${err.message}`, err.stack)
      if (message.correlationId) {
        await this.rabbitmqService.publish(IDENTITY_ROUTING_KEYS.RESPONSE, {
          correlationId: message.correlationId, success: false, error: err.message,
        })
      }
      throw error
    }
  }

  private async handleGetAllUsers(message: any): Promise<void> {
    try {
      this.logger.debug(`Processing get all users: ${JSON.stringify(message)}`)
      const { correlationId, filters } = message
      const users = await this.queryService.getAllUsers(filters)
      await this.rabbitmqService.publish(IDENTITY_ROUTING_KEYS.RESPONSE, { correlationId, users, success: true })
      this.logger.log(`Get all users response sent for correlationId: ${correlationId}`)
    } catch (error) {
      const err = error as Error
      this.logger.error(`Error handling get all users: ${err.message}`, err.stack)
      if (message.correlationId) {
        await this.rabbitmqService.publish(IDENTITY_ROUTING_KEYS.RESPONSE, {
          correlationId: message.correlationId, success: false, error: err.message,
        })
      }
      throw error
    }
  }

  private async handleGetReport(message: any): Promise<void> {
    try {
      this.logger.debug(`Processing get report: ${JSON.stringify(message)}`)
      const { correlationId } = message
      const report = await this.queryService.getReport()
      await this.rabbitmqService.publish(IDENTITY_ROUTING_KEYS.RESPONSE, { correlationId, report, success: true })
      this.logger.log(`Get report response sent for correlationId: ${correlationId}`)
    } catch (error) {
      const err = error as Error
      this.logger.error(`Error handling get report: ${err.message}`, err.stack)
      if (message.correlationId) {
        await this.rabbitmqService.publish(IDENTITY_ROUTING_KEYS.RESPONSE, {
          correlationId: message.correlationId, success: false, error: err.message,
        })
      }
      throw error
    }
  }
}
