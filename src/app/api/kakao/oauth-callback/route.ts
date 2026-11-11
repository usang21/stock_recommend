import { NextRequest, NextResponse } from "next/server";
import { exchangeKakaoCodeForToken, saveKakaoRefreshToken } from "@/lib/dataSources/kakao";

/**
 * 카카오 로그인 동의 후 돌아오는 콜백. 토큰을 교환해 바로 DB(`KakaoToken`)에
 * 저장한다 — 더 이상 사람이 refresh_token을 복사해 환경변수에 붙여넣을 필요가
 * 없다(그 수동 단계가 갱신분을 못 받아 2개월마다 재인증해야 했던 원인이었다).
 *
 * state 값이 곧 저장 키(label)다. `notifyAllKakaoRecipients`(kakao.ts)의
 * recipients 배열과 맞춰 "me" / "wife"를 쓴다.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") || "me";
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "code가 없습니다." }, { status: 400 });
  }

  // request.nextUrl.origin 대신 고정값을 쓴다 — Vercel 배포 URL/별칭 도메인
  // 차이로 실제 요청 도메인이 카카오에 등록한 Redirect URI와 미묘하게
  // 어긋나면 KOE010(Bad client credentials)이 발생하기 때문이다.
  const redirectUri = process.env.KAKAO_REDIRECT_URI || `${request.nextUrl.origin}/api/kakao/oauth-callback`;

  try {
    const token = await exchangeKakaoCodeForToken(code, redirectUri);
    if (!token.refresh_token) {
      return NextResponse.json({ error: "카카오 응답에 refresh_token이 없습니다." }, { status: 500 });
    }
    await saveKakaoRefreshToken(state, token.refresh_token);
    const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>카카오 토큰 저장 완료</title></head>
<body style="font-family: sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px;">
  <h2>저장 완료 (label: ${state})</h2>
  <p>DB에 바로 저장했습니다. 환경변수를 따로 건드릴 필요 없습니다.</p>
  <p style="color:#888;font-size:13px;">이 화면은 새로고침하면 재사용 안 됩니다 (code는 1회용). 다시 받으려면 로그인 링크부터 다시 진행하세요.</p>
</body></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
