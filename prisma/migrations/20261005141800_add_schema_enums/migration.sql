-- CreateEnum
CREATE TYPE "GoldStatus" AS ENUM ('active', 'dismissed');

-- CreateEnum
CREATE TYPE "LearningStatus" AS ENUM ('active', 'dismissed');

-- CreateEnum
CREATE TYPE "LearningKind" AS ENUM ('voice', 'fact', 'unknown');

-- CreateEnum
CREATE TYPE "ClassificationSource" AS ENUM ('same_call', 'separate_call', 'heuristic', 'fallback');

-- CreateEnum
CREATE TYPE "GenerationOutcome" AS ENUM ('pending', 'kept', 'edited', 'rejected');

-- AlterTable
ALTER TABLE "Gold" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Gold" ALTER COLUMN "status" TYPE "GoldStatus" USING ("status"::"GoldStatus");
ALTER TABLE "Gold" ALTER COLUMN "status" SET DEFAULT 'active';

-- AlterTable
ALTER TABLE "Learning" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Learning" ALTER COLUMN "status" TYPE "LearningStatus" USING ("status"::"LearningStatus");
ALTER TABLE "Learning" ALTER COLUMN "status" SET DEFAULT 'active';

ALTER TABLE "Learning" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "Learning" ALTER COLUMN "kind" TYPE "LearningKind" USING ("kind"::"LearningKind");
ALTER TABLE "Learning" ALTER COLUMN "kind" SET DEFAULT 'unknown';

ALTER TABLE "Learning" ALTER COLUMN "classificationSource" DROP DEFAULT;
ALTER TABLE "Learning" ALTER COLUMN "classificationSource" TYPE "ClassificationSource" USING ("classificationSource"::"ClassificationSource");
ALTER TABLE "Learning" ALTER COLUMN "classificationSource" SET DEFAULT 'fallback';

-- AlterTable
ALTER TABLE "GenerationLog" ALTER COLUMN "outcome" DROP DEFAULT;
ALTER TABLE "GenerationLog" ALTER COLUMN "outcome" TYPE "GenerationOutcome" USING ("outcome"::"GenerationOutcome");
ALTER TABLE "GenerationLog" ALTER COLUMN "outcome" SET DEFAULT 'pending';
