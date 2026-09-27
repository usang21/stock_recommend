import { NextRequest, NextResponse } from "next/server";
import { exchangeKakaoCodeForToken } from "@/lib/dataSources/kakao";

/**
 * 카카오 로그인 동의 후 돌아오는 콜백. 토큰을 교환해 화면에 그대로 보여준다.
 * (자동으로 env에 저장하지 않는다 — 시크릿 값이라 사람이 직접 확인하고
 * .env / Vercel 환경변수에 붙여넣도록 한다.)
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state") ?? "";
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
    const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>카카오 토큰 발급 완료</title></head>
<body style="font-family: sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px;">
  <h2>발급 완료 (${state || "이름 미지정"})</h2>
  <p>아래 refresh_token 값을 복사해서 환경변수에 붙여넣으세요.</p>
  <p><b>로컬 .env</b>: ${state === "wife" ? "KAKAO_REFRESH_TOKEN_WIFE" : "KAKAO_REFRESH_TOKEN_ME"}="..."</p>
  <p><b>Vercel</b>: <code>vercel env add ${state === "wife" ? "KAKAO_REFRESH_TOKEN_WIFE" : "KAKAO_REFRESH_TOKEN_ME"} production</code></p>
  <textarea readonly style="width:100%;height:80px;font-family:monospace;">${token.refresh_token ?? "(refresh_token 없음)"}</textarea>
  <p style="color:#888;font-size:13px;">이 화면은 새로고침하면 재사용 안 됩니다 (code는 1회용). 다시 받으려면 로그인 링크부터 다시 진행하세요.</p>
</body></html>`;
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
