/**
 * 리포트 생성 완료 이메일 알림 (DESIGN.md §7).
 * 본문에는 완료 안내와 웹페이지 링크만 포함하고, 종목 리스트 요약은 넣지 않는다.
 */
import { Resend } from "resend";

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function sendReportReadyEmail(runDate: Date): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  if (!apiKey || !to || !from) {
    console.warn("RESEND_API_KEY/ALERT_EMAIL_TO/ALERT_EMAIL_FROM 미설정으로 이메일 발송을 건너뜁니다.");
    return;
  }

  const dateStr = formatDate(runDate);
  const link = `${baseUrl ?? ""}/dashboard/strategy1`;

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to,
    subject: `[데일리 스크리너] ${dateStr} 리포트가 준비되었습니다`,
    html: `<p>${dateStr}자 매수 후보 종목 리포트 생성이 완료되었습니다.</p><p><a href="${link}">${link}</a> 에서 확인하세요.</p>`,
  });
}
