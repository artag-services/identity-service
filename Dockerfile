FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json nest-cli.json ./

# Generate Prisma client and build
RUN pnpm prisma:generate
RUN pnpm build

# Production stage
FROM node:20-alpine

# Install OpenSSL and other runtime dependencies for Prisma
RUN apk add --no-cache openssl netcat-openbsd bash

WORKDIR /app

RUN npm install -g pnpm

# Copy entrypoint first
COPY entrypoint.sh ./

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.pnpm /app/node_modules/.pnpm

RUN chmod +x /app/entrypoint.sh

EXPOSE 3010

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/main"]
