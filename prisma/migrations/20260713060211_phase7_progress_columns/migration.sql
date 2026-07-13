-- AlterTable
ALTER TABLE "player_progress" ADD COLUMN     "elite_kills" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_defeats" INTEGER NOT NULL DEFAULT 0;
