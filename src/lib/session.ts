/**
 * 세션 토큰 발급/검증 (Edge Runtime의 middleware에서도 동작해야 하므로
 * Node.js 전용 모듈(crypto 등)에 의존하지 않는다. 비밀번호 비교는 password.ts 참고.
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30일
export const SESSION_MAX_AGE = SESSION_DURATION_SECONDS;

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET 환경변수가 설정되지 않았습니다.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ authorized: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload.authorized === true;
  } catch {
    return false;
  }
}
