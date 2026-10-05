-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "guide" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "bannedForPrompt" TEXT NOT NULL DEFAULT '[]',
    "surfaces" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gold" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "rejected" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "surface" TEXT NOT NULL DEFAULT 'other',
    "architecture" TEXT NOT NULL DEFAULT '',
    "canonical" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Learning" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "before" TEXT NOT NULL DEFAULT '',
    "after" TEXT NOT NULL DEFAULT '',
    "why" TEXT NOT NULL DEFAULT '',
    "surface" TEXT NOT NULL DEFAULT '',
    "sourceDraftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Learning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "profileId" TEXT NOT NULL,
    "surfaceId" TEXT NOT NULL,
    "architecture" TEXT,
    "seed" TEXT,
    "model" TEXT,
    "facts" TEXT NOT NULL,
    "generatedBody" TEXT NOT NULL,
    "selectedGoldIds" TEXT[],
    "selectedLearningIds" TEXT[],
    "warnings" TEXT[],
    "retried" BOOLEAN NOT NULL DEFAULT false,
    "retryReason" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'pending',
    "editedBody" TEXT,
    "userNote" TEXT,

    CONSTRAINT "GenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gold_profileId_status_surface_idx" ON "Gold"("profileId", "status", "surface");

-- CreateIndex
CREATE INDEX "Learning_profileId_status_createdAt_idx" ON "Learning"("profileId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationLog_profileId_createdAt_idx" ON "GenerationLog"("profileId", "createdAt");

-- AddForeignKey
ALTER TABLE "Gold" ADD CONSTRAINT "Gold_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Learning" ADD CONSTRAINT "Learning_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationLog" ADD CONSTRAINT "GenerationLog_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

