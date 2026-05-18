import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { AdminGuard } from './admin.guard';

const PAGE = 500;
const SLEEP_MS_EVERY_N = 100;

/**
 * One-shot CQRS backfill. Re-emits `data.identity.*` events for every
 * existing User + Identity so the sync-service can populate Mongo from
 * a producer DB that already has data.
 *
 * Safe to run multiple times — projectors are idempotent. Safe to run
 * during normal operation — newer-data wins on most fields.
 *
 * Auth: `X-Admin-Token: <ADMIN_BACKFILL_TOKEN>` header.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class BackfillController {
  private readonly logger = new Logger(BackfillController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  @Post('backfill-events')
  @HttpCode(HttpStatus.OK)
  async backfill() {
    const started = Date.now();
    let scanned = 0;
    let published = 0;

    // Pass 1 — alive users: emit one user.linked per (user, identity).
    for (let skip = 0; ; skip += PAGE) {
      const users = await this.prisma.user.findMany({
        skip,
        take: PAGE,
        where: { deletedAt: null },
        include: { identities: true },
        orderBy: { createdAt: 'asc' },
      });
      if (users.length === 0) break;
      scanned += users.length;

      for (const u of users) {
        for (const identity of u.identities) {
          await this.rabbitmq.publish('data.identity.user.linked', {
            userId: u.id,
            channel: identity.channel,
            channelUserId: identity.channelUserId,
            displayName: identity.displayName ?? u.realName ?? null,
            realName: u.realName ?? null,
            avatarUrl: identity.avatarUrl ?? null,
            linkedAt: identity.updatedAt.toISOString(),
          });
          published++;
          if (published % SLEEP_MS_EVERY_N === 0) await this.sleep(10);
        }
      }
    }

    // Pass 2 — soft-deleted users: emit user.deleted tombstones so the
    // read model hides them.
    for (let skip = 0; ; skip += PAGE) {
      const deleted = await this.prisma.user.findMany({
        skip,
        take: PAGE,
        where: { deletedAt: { not: null } },
        orderBy: { deletedAt: 'asc' },
      });
      if (deleted.length === 0) break;
      for (const u of deleted) {
        await this.rabbitmq.publish('data.identity.user.deleted', {
          userId: u.id,
          reason: 'soft-delete',
          deletedAt: (u.deletedAt as Date).toISOString(),
        });
        published++;
        if (published % SLEEP_MS_EVERY_N === 0) await this.sleep(10);
      }
    }

    const durationMs = Date.now() - started;
    this.logger.log(
      `Backfill done: scanned=${scanned} published=${published} durationMs=${durationMs}`,
    );
    return { service: 'identity', scanned, published, durationMs };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
