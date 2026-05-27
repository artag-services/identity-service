# Identity Service

> Unifica las identidades de un mismo usuario humano a través de múltiples canales (WhatsApp, Slack, Instagram, Email, etc.).

## Qué hace

Un mismo usuario humano puede escribirte por WhatsApp con un número, por Instagram con un IGSID, por Slack con otro ID, y por email con su dirección. Sin **identity**, cada uno es un "usuario" separado en tu sistema — no sabés que es la misma persona.

**Identity resuelve esto:** mantiene un grafo `User → Identity[]` donde:
- `User` es el humano único (1 row por persona real)
- `Identity` es cómo aparece en cada canal (N rows por User, una por canal)

Cuando llega un mensaje nuevo, los demás microservicios publican `channels.identity.resolve` con `(channel, channelUserId)` y este servicio:
1. Busca si ya existe esa Identity → devuelve el `userId` asociado
2. Si no existe, crea Identity nueva + (opcionalmente) crea User nuevo
3. Si se detecta que dos Identities pertenecen al mismo humano, podés ejecutar `merge_users` para fusionarlas

## Stack

| Pieza | Valor |
|---|---|
| Framework | NestJS 10 |
| Lenguaje | TypeScript 5 |
| DB | PostgreSQL (`identity_db`) |
| Mensajería | RabbitMQ — exchange `channels` |
| Puerto | `3010` |

## Modelo Prisma (simplificado)

```prisma
model User {
  id          String     @id @default(uuid())
  aiEnabled   Boolean    @default(true)
  identities  Identity[]
  ...
}

model Identity {
  id              String   @id @default(uuid())
  channel         String                       // "whatsapp", "instagram", "slack", "email", ...
  channelUserId   String                       // número, IGSID, slack user id, email, etc.
  displayName     String?
  phone           String?
  email           String?
  avatarUrl       String?
  trustScore      Float    @default(0.5)
  user            User     @relation(...)
  ...
  @@unique([channel, channelUserId])
}
```

`trustScore` (0-1): qué tan seguro estás que esa Identity pertenece a ese User. Útil cuando vinculás identidades por inferencia (ej: dos teléfonos diferentes que parecen ser de la misma persona por similitud de nombre).

## Routing keys (RPC + fire-and-forget)

| Routing key | Tipo | Descripción |
|---|---|---|
| `channels.identity.resolve` | fire-and-forget | Crear o vincular identidad |
| `channels.identity.get_user` | RPC | Get user por id |
| `channels.identity.get_all_users` | RPC | List users con filtros |
| `channels.identity.merge_users` | fire-and-forget | Fusionar dos users |
| `channels.identity.delete_user` | fire-and-forget | Soft-delete |
| `channels.identity.get_report` | RPC | Stats agregadas |
| `channels.identity.update_ai_settings` | fire-and-forget | Toggle AI per-user |

Las RPC responses se publican a `identity.responses` (queue del gateway).

## Endpoints HTTP (vía gateway)

Documentados en [../docs/api/identity.md](../docs/api/identity.md). Resumen:

| Método | Path | Patrón |
|---|---|---|
| POST | `/api/v1/identity/resolve` | 202 fire-and-forget |
| GET | `/api/v1/identity/users` | 200 RPC |
| GET | `/api/v1/identity/users/:id` | 200 RPC |
| POST | `/api/v1/identity/merge` | 202 fire-and-forget |
| DELETE | `/api/v1/identity/users/:id` | 202 |
| GET | `/api/v1/identity/report` | 200 RPC |
| PATCH | `/api/v1/identity/users/:id/ai-settings` | 202 |

## Configuración (`.env`)

```env
IDENTITY_PORT=3010
IDENTITY_DATABASE_URL=postgresql://postgres:postgres123@postgres:5432/identity_db
RABBITMQ_URL=amqp://admin:password@rabbitmq:5672
```

## Cómo correrlo

```bash
docker-compose up -d identity
```

Dev local:
```bash
cd identity
pnpm install
pnpm prisma:generate
pnpm start:dev
```

## Quién lo usa (consumidores típicos)

- **whatsapp/instagram/slack/etc.** — cuando llega un mensaje nuevo, publican `identity.resolve` para vincular al humano
- **email** — cuando llega un email entrante (vía Cloudflare Worker), resuelve identity con `channel="email"`
- **agent** — usa la tool `find_or_create_user` (que internamente llama a `identity.resolve`)
- **gateway** — expone los endpoints HTTP

## Ver también

- **[../docs/api/identity.md](../docs/api/identity.md)** — API reference completa
- **[../AGENTS.md](../AGENTS.md)** — flujos de mensajería que usan identity
