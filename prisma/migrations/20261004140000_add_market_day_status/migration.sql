-- CreateTable
CREATE TABLE "MarketDayStatus" (
    "tradeDate" DATE NOT NULL,
    "isOpen" BOOLEAN NOT NULL,
    "marketStatus" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketDayStatus_pkey" PRIMARY KEY ("tradeDate")
);
