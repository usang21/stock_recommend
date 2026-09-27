-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyResult" (
    "id" TEXT NOT NULL,
    "reportRunId" TEXT NOT NULL,
    "strategyKey" TEXT NOT NULL,
    "strategyName" TEXT NOT NULL,
    "paramsSnapshot" JSONB NOT NULL,

    CONSTRAINT "StrategyResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunnelStep" (
    "id" TEXT NOT NULL,
    "strategyResultId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FunnelStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockPick" (
    "id" TEXT NOT NULL,
    "funnelStepId" TEXT NOT NULL,
    "stockCode" TEXT NOT NULL,
    "stockName" TEXT NOT NULL,
    "price" INTEGER,
    "changeRate" DOUBLE PRECISION,
    "volume" BIGINT,
    "tradingValue" BIGINT,
    "materialVerdict" TEXT,
    "materialSummary" TEXT,
    "materialSources" JSONB,

    CONSTRAINT "StockPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyParams" (
    "id" TEXT NOT NULL,
    "strategyKey" TEXT NOT NULL,
    "paramsJson" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyParams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportRun_runDate_idx" ON "ReportRun"("runDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRun_runDate_key" ON "ReportRun"("runDate");

-- CreateIndex
CREATE INDEX "StrategyResult_reportRunId_idx" ON "StrategyResult"("reportRunId");

-- CreateIndex
CREATE INDEX "FunnelStep_strategyResultId_idx" ON "FunnelStep"("strategyResultId");

-- CreateIndex
CREATE INDEX "StockPick_funnelStepId_idx" ON "StockPick"("funnelStepId");

-- CreateIndex
CREATE INDEX "StockPick_stockCode_idx" ON "StockPick"("stockCode");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyParams_strategyKey_key" ON "StrategyParams"("strategyKey");

-- AddForeignKey
ALTER TABLE "StrategyResult" ADD CONSTRAINT "StrategyResult_reportRunId_fkey" FOREIGN KEY ("reportRunId") REFERENCES "ReportRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelStep" ADD CONSTRAINT "FunnelStep_strategyResultId_fkey" FOREIGN KEY ("strategyResultId") REFERENCES "StrategyResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPick" ADD CONSTRAINT "StockPick_funnelStepId_fkey" FOREIGN KEY ("funnelStepId") REFERENCES "FunnelStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
