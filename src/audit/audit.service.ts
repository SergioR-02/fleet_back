import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId: string;
    metadata?: Prisma.InputJsonValue | null;
  }) {
    // No guardar user_id sintético de API Key
    const userId =
      params.userId && params.userId !== 'service' ? params.userId : null;

    return this.prisma.auditLog.create({
      data: {
        userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        metadata:
          params.metadata === undefined || params.metadata === null
            ? undefined
            : params.metadata,
      },
    });
  }

  async findAll(page = 1, limit = 15) {
    const skip = (page - 1) * limit;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              driver: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    return {
      data: data.map((log) => ({
        id: log.id,
        userId: log.userId,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        metadata: log.metadata,
        createdAt: log.createdAt.toISOString(),
        user: log.user
          ? {
              id: log.user.id,
              email: log.user.email,
              name: log.user.driver?.name ?? log.user.email.split('@')[0],
            }
          : null,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  actorMetadata(
    user?: AuthUser | null,
    extra?: Record<string, unknown>,
  ): Prisma.InputJsonValue | undefined {
    if (!user) {
      return extra ? (extra as Prisma.InputJsonValue) : undefined;
    }
    if (user.isService) {
      return {
        actor: 'N8N',
        source: 'API_KEY',
        ...(extra ?? {}),
      } as Prisma.InputJsonValue;
    }
    return {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      ...(extra ?? {}),
    } as Prisma.InputJsonValue;
  }
}
