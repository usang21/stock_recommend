-- AlterTable
ALTER TABLE "StockPick" ADD COLUMN     "institutionalBuyDaysCount" INTEGER,
ADD COLUMN     "institutionalDays" JSONB,
ADD COLUMN     "institutionalMeetsThreshold" BOOLEAN,
ADD COLUMN     "institutionalMinBuyDays" INTEGER,
ADD COLUMN     "institutionalWindowDays" INTEGER;
