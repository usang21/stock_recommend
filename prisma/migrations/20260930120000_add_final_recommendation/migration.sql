-- CreateTable
CREATE TABLE "FinalRecommendationRun" (
    "id" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "errorMessage" TEXT,
    "criteriaVersion" INTEGER,
    "lessonVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinalRecommendationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationPick" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "rank" INTEGER,
    "isRecommended" BOOLEAN NOT NULL,
    "stockCode" TEXT NOT NULL,
    "stockName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "strategyKeys" JSONB NOT NULL,
    "recommendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationOutcome" (
    "id" TEXT NOT NULL,
    "pickId" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tradingDays" INTEGER NOT NULL,
    "currentPrice" INTEGER NOT NULL,
    "changeRate" DOUBLE PRECISION NOT NULL,
    "verdict" TEXT NOT NULL,
    "analysis" TEXT,
    "analyzedAt" TIMESTAMP(3),

    CONSTRAINT "RecommendationOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationLogicVersion" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changeReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationLogicVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinalRecommendationRun_runDate_idx" ON "FinalRecommendationRun"("runDate");

-- CreateIndex
CREATE UNIQUE INDEX "FinalRecommendationRun_runDate_key" ON "FinalRecommendationRun"("runDate");

-- CreateIndex
CREATE INDEX "RecommendationPick_runId_idx" ON "RecommendationPick"("runId");

-- CreateIndex
CREATE INDEX "RecommendationPick_stockCode_idx" ON "RecommendationPick"("stockCode");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationOutcome_pickId_key" ON "RecommendationOutcome"("pickId");

-- CreateIndex
CREATE INDEX "RecommendationOutcome_verdict_idx" ON "RecommendationOutcome"("verdict");

-- CreateIndex
CREATE INDEX "RecommendationLogicVersion_kind_createdAt_idx" ON "RecommendationLogicVersion"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationLogicVersion_kind_version_key" ON "RecommendationLogicVersion"("kind", "version");

-- AddForeignKey
ALTER TABLE "RecommendationPick" ADD CONSTRAINT "RecommendationPick_runId_fkey" FOREIGN KEY ("runId") REFERENCES "FinalRecommendationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationOutcome" ADD CONSTRAINT "RecommendationOutcome_pickId_fkey" FOREIGN KEY ("pickId") REFERENCES "RecommendationPick"("id") ON DELETE CASCADE ON UPDATE CASCADE;
