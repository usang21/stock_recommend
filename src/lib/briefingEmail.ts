/**
 * 당일 상한가 / 거래량 브리핑 이메일 (DESIGN.md §14).
 *
 * §7의 리포트 완료 알림과 달리 본문에 종목 목록을 그대로 담는다. 스크리너
 * 리포트는 웹에서 퍼널을 눌러가며 봐야 의미가 있어 링크만 보내지만, 이 브리핑은
 * 메일만 읽고 끝낼 수 있어야 하는 것이 목적이기 때문이다 (§14 참고).
 */
import { Resend } from "resend";
import type { BriefingStock, DailyBriefing } from "@/lib/dailyBriefing";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function changeLabel(changeRate: number): string {
  return `${changeRate > 0 ? "+" : ""}${changeRate}%`;
}

function changeColor(changeRate: number): string {
  if (changeRate > 0) return "#d92d4d";
  if (changeRate < 0) return "#1d6fd0";
  return "#64748b";
}

function textLines(briefing: DailyBriefing): string {
  const lines = [`[${briefing.tradeDate} KOSPI·KOSDAQ 종목 브리핑]`, ""];
  if (briefing.stocks.length === 0) {
    lines.push("오늘 조건에 해당하는 종목이 없습니다.");
    return lines.join("\n");
  }
  for (const stock of briefing.stocks) {
    lines.push(
      `${stock.name} (${stock.market} · ${stock.code}) · ${stock.price.toLocaleString()}원 · ` +
        `${changeLabel(stock.changeRate)} · 거래량 ${stock.volume.toLocaleString()}주 · ${stock.tags.join(" / ")}`,
      `뉴스: ${stock.newsUrl}`,
      `공시: ${stock.dartUrl}`,
      ""
    );
  }
  return lines.join("\n");
}

function htmlRow(stock: BriefingStock): string {
  return (
    "<tr>" +
    `<td style="padding:8px 6px;border-bottom:1px solid #e2e8f0"><strong>${escapeHtml(stock.name)}</strong>` +
    `<br><small style="color:#64748b">${stock.market} · ${stock.code} · ${escapeHtml(stock.tags.join(" / "))}</small></td>` +
    `<td style="padding:8px 6px;border-bottom:1px solid #e2e8f0">${stock.price.toLocaleString()}원` +
    `<br><strong style="color:${changeColor(stock.changeRate)}">${changeLabel(stock.changeRate)}</strong>` +
    `<br><small style="color:#64748b">${stock.volume.toLocaleString()}주</small></td>` +
    `<td style="padding:8px 6px;border-bottom:1px solid #e2e8f0">` +
    `<a href="${escapeHtml(stock.newsUrl)}">관련 뉴스</a> &nbsp; <a href="${escapeHtml(stock.dartUrl)}">DART 공시</a></td>` +
    "</tr>"
  );
}

function htmlBody(briefing: DailyBriefing): string {
  const rows =
    briefing.stocks.length > 0
      ? briefing.stocks.map(htmlRow).join("")
      : `<tr><td colspan="3" style="padding:16px 6px;color:#64748b">오늘 조건에 해당하는 종목이 없습니다.</td></tr>`;

  return `<div style="font-family:Arial,sans-serif;max-width:720px;color:#172033">
<h2>${briefing.tradeDate} KOSPI·KOSDAQ 종목 브리핑</h2>
<p style="color:#64748b">상한가 ${briefing.limitUpCount}개 · 거래량 ${briefing.volumeThreshold.toLocaleString()}주 이상 ${briefing.highVolumeCount}개 · 시세 목록: 네이버 금융</p>
<table style="border-collapse:collapse;width:100%">
<thead><tr style="background:#edf2ff"><th align="left" style="padding:8px 6px">종목</th><th align="left" style="padding:8px 6px">종가 · 등락 · 거래량</th><th align="left" style="padding:8px 6px">확인 링크</th></tr></thead>
<tbody>${rows}</tbody></table>
<p style="margin-top:22px;color:#64748b;font-size:12px">ETF·ETN은 제외한 개별 종목 기준입니다. 수치는 지연되거나 변동될 수 있습니다.</p></div>`;
}

/**
 * 브리핑 메일을 보낸다. 설정이 없어 건너뛴 경우 `null`을 돌려준다 — 호출부가
 * "보냄"과 "건너뜀"을 구분해 보고해야, 환경변수가 빠진 채로 조용히 발송이
 * 멈추는 상황을 Cron 응답만 보고 알아챌 수 있다.
 */
export async function sendDailyBriefingEmail(briefing: DailyBriefing): Promise<{ to: string } | null> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM;

  if (!apiKey || !to || !from) {
    console.warn("RESEND_API_KEY/ALERT_EMAIL_TO/ALERT_EMAIL_FROM 미설정으로 브리핑 메일을 건너뜁니다.");
    return null;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to,
    subject: `[${briefing.tradeDate}] KOSPI·KOSDAQ 브리핑 (상한가 ${briefing.limitUpCount}개 · 거래량 1천만주↑ ${briefing.highVolumeCount}개)`,
    text: textLines(briefing),
    html: htmlBody(briefing),
  });
  return { to };
}
