/** 연속 통과일이 이 값 이상이면 "매수 타이밍 근접" 신호로 본다. 서버(집계)와
 * 클라이언트(배지 강조) 양쪽에서 같은 값을 쓰기 위해 별도 파일로 둔다 — 이
 * 파일은 prisma 등 서버 전용 의존성을 가지면 안 된다. */
export const STRATEGY2_STREAK_ALERT_THRESHOLD = 3;
