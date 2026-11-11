-- CreateTable
CREATE TABLE "KakaoToken" (
    "label" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KakaoToken_pkey" PRIMARY KEY ("label")
);
