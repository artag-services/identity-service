-- Identity Service Schema Migration
-- Generated from Prisma schema

-- Create User table
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "realName" TEXT,
    "nicknames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nameTrustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "nameSource" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create UserIdentity table
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelUserId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "metadata" JSONB,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- Create UserContact table
CREATE TABLE "UserContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "source" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- Create NameHistory table
CREATE TABLE "NameHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "previousName" TEXT,
    "newName" TEXT,
    "reason" TEXT,
    "source" TEXT,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NameHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE
);

-- Create unique indices
CREATE UNIQUE INDEX "UserIdentity_channelUserId_channel_key" ON "UserIdentity"("channelUserId", "channel");
CREATE UNIQUE INDEX "UserContact_userId_type_value_key" ON "UserContact"("userId", "type", "value");

-- Create regular indices for queries
CREATE INDEX "User_realName_idx" ON "User"("realName");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity"("userId");
CREATE INDEX "UserIdentity_channel_idx" ON "UserIdentity"("channel");
CREATE INDEX "UserIdentity_trustScore_idx" ON "UserIdentity"("trustScore");
CREATE INDEX "UserContact_userId_idx" ON "UserContact"("userId");
CREATE INDEX "UserContact_type_value_idx" ON "UserContact"("type", "value");
CREATE INDEX "UserContact_trustScore_idx" ON "UserContact"("trustScore");
CREATE INDEX "NameHistory_userId_idx" ON "NameHistory"("userId");
CREATE INDEX "NameHistory_createdAt_idx" ON "NameHistory"("createdAt");
