import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { IdentityService } from './identity.service';
import { IDENTITY_ROUTING_KEYS, IDENTITY_QUEUES } from '../rabbitmq/constants/queues';
import { ResolveIdentityDto } from './dto';

@Injectable()
export class IdentityListener implements OnModuleInit {
  private readonly logger = new Logger(IdentityListener.name);

  constructor(
    @Inject(RabbitMQService) private rabbitmqService: RabbitMQService,
    @Inject(IdentityService) private identityService: IdentityService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Wait a bit to ensure RabbitMQService is connected
    // OnModuleInit hooks run in dependency order, but we add extra safety
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.setupListeners();
  }

  private async setupListeners(): Promise<void> {
    try {
      // Declare queues for write operations (fire-and-forget)
      await this.rabbitmqService.declareQueue(
        IDENTITY_QUEUES.RESOLVE_IDENTITY,
        IDENTITY_ROUTING_KEYS.RESOLVE_IDENTITY,
      );

      await this.rabbitmqService.declareQueue(
        IDENTITY_QUEUES.UPDATE_PHONE,
        IDENTITY_ROUTING_KEYS.UPDATE_PHONE,
      );

       await this.rabbitmqService.declareQueue(
         IDENTITY_QUEUES.UPDATE_EMAIL,
         IDENTITY_ROUTING_KEYS.UPDATE_EMAIL,
       );

       await this.rabbitmqService.declareQueue(
         IDENTITY_QUEUES.UPDATE_AI_SETTINGS,
         IDENTITY_ROUTING_KEYS.UPDATE_AI_SETTINGS,
       );

      // Declare queues for read operations (request-response)
      await this.rabbitmqService.declareQueue(
        IDENTITY_QUEUES.GET_USER,
        IDENTITY_ROUTING_KEYS.GET_USER,
      );

      await this.rabbitmqService.declareQueue(
        IDENTITY_QUEUES.GET_ALL_USERS,
        IDENTITY_ROUTING_KEYS.GET_ALL_USERS,
      );

      await this.rabbitmqService.declareQueue(
        IDENTITY_QUEUES.GET_REPORT,
        IDENTITY_ROUTING_KEYS.GET_REPORT,
      );

      // Declare queues for update operations (fire-and-forget)
      await this.rabbitmqService.declareQueue(
        IDENTITY_QUEUES.MERGE_USERS,
        IDENTITY_ROUTING_KEYS.MERGE_USERS,
      );

      await this.rabbitmqService.declareQueue(
        IDENTITY_QUEUES.DELETE_USER,
        IDENTITY_ROUTING_KEYS.DELETE_USER,
      );

      // Start consuming write operations
      await this.rabbitmqService.consume(
        IDENTITY_QUEUES.RESOLVE_IDENTITY,
        (message) => this.handleResolveIdentity(message),
      );

      await this.rabbitmqService.consume(
        IDENTITY_QUEUES.UPDATE_PHONE,
        (message) => this.handlePhoneNumberUpdate(message),
      );

       await this.rabbitmqService.consume(
         IDENTITY_QUEUES.UPDATE_EMAIL,
         (message) => this.handleEmailUpdate(message),
       );

       await this.rabbitmqService.consume(
         IDENTITY_QUEUES.UPDATE_AI_SETTINGS,
         (message) => this.handleUpdateAISettings(message),
       );

      // Start consuming read operations (request-response)
      await this.rabbitmqService.consume(
        IDENTITY_QUEUES.GET_USER,
        (message) => this.handleGetUser(message),
      );

      await this.rabbitmqService.consume(
        IDENTITY_QUEUES.GET_ALL_USERS,
        (message) => this.handleGetAllUsers(message),
      );

      await this.rabbitmqService.consume(
        IDENTITY_QUEUES.GET_REPORT,
        (message) => this.handleGetReport(message),
      );

      // Start consuming update operations
      await this.rabbitmqService.consume(
        IDENTITY_QUEUES.MERGE_USERS,
        (message) => this.handleMergeUsers(message),
      );

      await this.rabbitmqService.consume(
        IDENTITY_QUEUES.DELETE_USER,
        (message) => this.handleDeleteUser(message),
      );

      this.logger.log('Identity listeners initialized');
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to setup listeners: ${err.message}`);
      throw error;
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Write Operations (Fire-and-forget)
  // ────────────────────────────────────────────────────────────────

  private async handleResolveIdentity(message: any): Promise<void> {
    try {
      this.logger.debug(`Processing resolve identity event: ${JSON.stringify(message)}`);

      const dto: ResolveIdentityDto = {
        channel: message.channel,
        channelUserId: message.channelUserId,
        displayName: message.displayName,
        phone: message.phone,
        email: message.email,
        username: message.username,
        avatarUrl: message.avatarUrl,
        trustScore: message.trustScore,
        metadata: message.metadata,
      };

      const user = await this.identityService.resolveIdentity(dto);
      this.logger.log(
        `Identity resolved - User ID: ${user.id}, Channel: ${message.channel}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error handling resolve identity: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  private async handlePhoneNumberUpdate(message: any): Promise<void> {
    try {
      this.logger.debug(
        `Processing phone number update: ${JSON.stringify(message)}`,
      );

      const { oldPhoneNumber, newPhoneNumber, userId } = message;

      // For now, skip the complex contacts lookup
      // In production, implement proper phone number migration
      if (newPhoneNumber) {
        await this.identityService.resolveIdentity({
          channel: 'whatsapp',
          channelUserId: userId || newPhoneNumber,
          phone: newPhoneNumber,
        });

        this.logger.log(
          `Phone number update processed: ${oldPhoneNumber} -> ${newPhoneNumber}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error handling phone number update: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  private async handleEmailUpdate(message: any): Promise<void> {
    try {
      this.logger.debug(
        `Processing email update: ${JSON.stringify(message)}`,
      );

      const { oldEmail, newEmail, userId } = message;

      if (newEmail) {
        await this.identityService.resolveIdentity({
          channel: 'email',
          channelUserId: userId || newEmail,
          email: newEmail,
        });

        this.logger.log(
          `Email updated: ${oldEmail} -> ${newEmail} for user ${userId}`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error handling email update: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  private async handleUpdateAISettings(message: any): Promise<void> {
    try {
      this.logger.debug(
        `Processing update AI settings: ${JSON.stringify(message)}`,
      );

      const { userId, aiEnabled, timestamp } = message;

      const result = await this.identityService.updateAISettings(userId, aiEnabled);

      this.logger.log(
        `AI settings updated for user ${userId}: aiEnabled=${result.aiEnabled}`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error handling update AI settings: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  private async handleMergeUsers(message: any): Promise<void> {
    try {
      this.logger.debug(
        `Processing merge users: ${JSON.stringify(message)}`,
      );

      const { primaryUserId, secondaryUserId, reason } = message;

      const result = await this.identityService.mergeUsers({
        primaryUserId,
        secondaryUserId,
        reason,
      });

      this.logger.log(`Users merged successfully: ${result.id}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error handling merge users: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  private async handleDeleteUser(message: any): Promise<void> {
    try {
      this.logger.debug(
        `Processing delete user: ${JSON.stringify(message)}`,
      );

      const { userId } = message;

      const result = await this.identityService.deleteUser(userId);

      this.logger.log(`User deleted: ${result.id}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error handling delete user: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Read Operations (Request-Response)
  // ────────────────────────────────────────────────────────────────

  private async handleGetUser(message: any): Promise<void> {
    try {
      this.logger.debug(`Processing get user: ${JSON.stringify(message)}`);

      const { correlationId, userId } = message;

      const user = await this.identityService.getUser(userId);

      // Publish response back to gateway
      await this.rabbitmqService.publish(IDENTITY_ROUTING_KEYS.RESPONSE, {
        correlationId,
        user,
        success: true,
      });

      this.logger.log(`Get user response sent for correlationId: ${correlationId}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error handling get user: ${err.message}`,
        err.stack,
      );

      // Publish error response
      if (message.correlationId) {
        await this.rabbitmqService.publish(IDENTITY_ROUTING_KEYS.RESPONSE, {
          correlationId: message.correlationId,
          success: false,
          error: err.message,
        });
      }

      throw error;
    }
  }

  private async handleGetAllUsers(message: any): Promise<void> {
    try {
      this.logger.debug(`Processing get all users: ${JSON.stringify(message)}`);

      const { correlationId, filters } = message;

      const users = await this.identityService.getAllUsers(filters);

      // Publish response back to gateway
      await this.rabbitmqService.publish(IDENTITY_ROUTING_KEYS.RESPONSE, {
        correlationId,
        users,
        success: true,
      });

      this.logger.log(`Get all users response sent for correlationId: ${correlationId}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error handling get all users: ${err.message}`,
        err.stack,
      );

      // Publish error response
      if (message.correlationId) {
        await this.rabbitmqService.publish(IDENTITY_ROUTING_KEYS.RESPONSE, {
          correlationId: message.correlationId,
          success: false,
          error: err.message,
        });
      }

      throw error;
    }
  }

  private async handleGetReport(message: any): Promise<void> {
    try {
      this.logger.debug(`Processing get report: ${JSON.stringify(message)}`);

      const { correlationId } = message;

      const report = await this.identityService.getReport();

      // Publish response back to gateway
      await this.rabbitmqService.publish(IDENTITY_ROUTING_KEYS.RESPONSE, {
        correlationId,
        report,
        success: true,
      });

      this.logger.log(`Get report response sent for correlationId: ${correlationId}`);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error handling get report: ${err.message}`,
        err.stack,
      );

      // Publish error response
      if (message.correlationId) {
        await this.rabbitmqService.publish(IDENTITY_ROUTING_KEYS.RESPONSE, {
          correlationId: message.correlationId,
          success: false,
          error: err.message,
        });
      }

      throw error;
    }
  }
}
