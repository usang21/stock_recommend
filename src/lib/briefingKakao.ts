/**
 * 당일 브리핑 카카오톡 알림 (DESIGN.md §14).
 *
 * 전달 채널을 카카오톡으로 고른 이유: 이 프로젝트의 실제 알림 채널이 카카오톡이고
 * (Resend 환경변수는 운영에 등록되어 있지 않다), 수신자 토큰이 두 명 분 이미
 * 등록되어 있어 추가 설정 없이 두 사람 모두 받을 수 있다.
 *
 * `kakao.ts`의 `sendKakaoMemoToSelf`를 그대로 재사용하고 그 파일은 수정하지 않는다.
 * 대신 `notifyAllKakaoRecipients`를 쓰지 않는데, 그 함수는 수신자별 실패를 삼켜서
 * (로그만 남기고) 호출부가 성공/실패를 구분할 수 없기 때문이다. 브리핑은 Cron 응답에
 * 전달 결과를 남겨야 해서 수신자별 결과를 직접 모은다.
 */
import { sendKakaoMemoToSelf } from "@/lib/dataSources/kakao";
import type { DailyBriefing } from "@/lib/dailyBriefing";
import { LIMIT_UP_TAG } from "@/lib/dailyBriefing";

/**
 * 카카오 기본 템플릿(텍스트)의 `text` 최대 길이. 공식 문서 기준 200자이고 초과하면
 * 전송이 거부되므로, 종목이 많은 날에도 이 안에 들어오도록 이름 수를 줄여 담는다.
 */
const MAX_TEXT_LENGTH = 200;

/** 한 묶음에 이름을 몇 개까지 적을지. 나머지는 "외 N개"로 접는다. */
const MAX_NAMES_PER_GROUP = 5;

function nameSummary(names: string[]): string {
  if (names.length === 0) return "없음";
  const shown = names.slice(0, MAX_NAMES_PER_GROUP);
  const hidden = names.length - shown.length;
  return hidden > 0 ? `${shown.join(", ")} 외 ${hidden}개` : shown.join(", ");
}

/**
 * 카카오 버튼이 열 주소.
 *
 * 데이터베이스 기본 주소로 보내면 모든 날짜의 행이 한 표에 섞여 보여서, 받은
 * 사람이 그날 종목을 직접 찾아야 한다. 그래서 Notion에서 "날짜 = 오늘" 필터를
 * 걸어둔 뷰를 만들고 그 뷰의 링크를 `NOTION_VIEW_URL`에 넣는 것을 전제로 한다
 * (뷰별로 표시 속성도 줄일 수 있어 모바일에서 가로 스크롤이 사라진다).
 *
 * 설정하지 않으면 데이터베이스 기본 주소로, 그것도 없으면 사이트 주소로 돌아간다
 * — 빈 URL을 넘기면 카카오가 거부할 수 있어 항상 무언가를 주도록 한다.
 */
function linkUrl(): string | undefined {
  const viewUrl = process.env.NOTION_VIEW_URL;
  if (viewUrl) return viewUrl;
  const databaseId = process.env.NOTION_DATABASE_ID?.replace(/-/g, "");
  if (databaseId) return `https://www.notion.so/${databaseId}`;
  return process.env.NEXT_PUBLIC_BASE_URL || undefined;
}

export function buildBriefingMessage(briefing: DailyBriefing): string {
  const limitUpNames = briefing.stocks.filter((s) => s.tags.includes(LIMIT_UP_TAG)).map((s) => s.name);
  const volumeNames = briefing.stocks.filter((s) => !s.tags.includes(LIMIT_UP_TAG)).map((s) => s.name);
  const dateLabel = briefing.tradeDate.slice(5).replace("-", "/");

  const text = [
    `[${dateLabel}] 상한가 ${briefing.limitUpCount} · 거래량1천만↑ ${briefing.highVolumeCount}`,
    `상한가: ${nameSummary(limitUpNames)}`,
    `거래량: ${nameSummary(volumeNames)}`,
  ].join("\n");

  // 종목명이 유난히 긴 날에도 200자를 넘기지 않도록 마지막에 한 번 더 자른다.
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text;
}

export interface KakaoNotifyResult {
  sent: number;
  failed: number;
}

/**
 * 등록된 수신자 전원에게 브리핑 알림을 보낸다. 토큰이 하나도 없으면 `null`을 돌려준다
 * — 호출부가 "보냄"과 "설정 없어 건너뜀"을 구분해 보고하기 위한 것이다.
 */
export async function notifyBriefingToKakao(briefing: DailyBriefing): Promise<KakaoNotifyResult | null> {
  const recipients = [
    { label: "본인", refreshToken: process.env.KAKAO_REFRESH_TOKEN_ME ?? "" },
    { label: "와이프", refreshToken: process.env.KAKAO_REFRESH_TOKEN_WIFE ?? "" },
  ].filter((r) => r.refreshToken);

  if (recipients.length === 0) {
    console.warn("KAKAO_REFRESH_TOKEN_* 미설정으로 브리핑 카카오톡 알림을 건너뜁니다.");
    return null;
  }

  const text = buildBriefingMessage(briefing);
  const link = linkUrl();
  let sent = 0;
  let failed = 0;

  // 한 수신자의 실패가 다른 수신자의 발송을 막지 않도록 각각 처리한다.
  for (const recipient of recipients) {
    try {
      await sendKakaoMemoToSelf(recipient.refreshToken, text, link);
      sent += 1;
    } catch (err) {
      failed += 1;
      console.error(`브리핑 카카오톡 알림 실패 (${recipient.label}):`, err);
    }
  }

  return { sent, failed };
}
