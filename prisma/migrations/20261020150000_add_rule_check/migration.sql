-- AlterEnum
ALTER TYPE "LearningStatus" ADD VALUE 'blocked';
ALTER TYPE "LearningStatus" ADD VALUE 'merged';
ALTER TYPE "LearningStatus" ADD VALUE 'retired';

-- AlterTable
ALTER TABLE "Learning" ADD COLUMN "autoAction" TEXT;
ALTER TABLE "Learning" ADD COLUMN "autoReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Learning" ADD COLUMN "autoTargetId" TEXT;
ALTER TABLE "Learning" ADD COLUMN "autoAt" TIMESTAMP(3);
ALTER TABLE "Learning" ADD COLUMN "undoneAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Learning_profileId_autoAt_idx" ON "Learning"("profileId", "autoAt");
