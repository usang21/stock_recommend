/**
 * 고정 비밀번호 검증 (DESIGN.md §10). Node.js crypto를 사용하므로 Edge Runtime인
 * middleware에서는 임포트하지 않는다 — 세션 토큰 발급/검증은 session.ts를 사용한다.
 */
import { timingSafeEqual } from "crypto";

export function checkSitePassword(input: string): boolean {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) {
    throw new Error("SITE_PASSWORD 환경변수가 설정되지 않았습니다.");
  }
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
