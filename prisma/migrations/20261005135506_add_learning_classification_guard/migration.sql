-- AlterTable
ALTER TABLE "Learning" ADD COLUMN     "classificationMismatch" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "classificationSource" TEXT NOT NULL DEFAULT 'fallback';
