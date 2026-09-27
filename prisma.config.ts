import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Next.js와 동일한 우선순위: .env 먼저 로드 후 .env.local로 덮어쓴다
// (vercel link / vercel integration add가 DB 접속정보를 .env.local에 기록함).
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
