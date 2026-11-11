/**
 * 카카오톡 "나에게 보내기" 알림 (리포트 생성 완료 시).
 *
 * 사람 수만큼(본인/와이프) 각자 카카오 로그인으로 발급받은 리프레시 토큰을
 * DB(`KakaoToken`)에 저장해두고, 필요할 때마다 access_token으로 교환해
 * "나에게 보내기" API를 호출한다. "친구에게 보내기"가 아니라 각자 자기
 * 자신에게 보내는 방식이라 카카오 친구 목록 연동이나 앱 심사 없이 쓸 수 있다.
 *
 * 리프레시 토큰은 발급 후 2개월이 지나면 하드 만료된다. 콘솔에 "자동 연장"
 * 설정 같은 건 없고, 대신 카카오가 액세스 토큰 갱신 응답에 새 refresh_token을
 * 실어 보내준다(유효기간이 1개월 미만으로 남았을 때만). 그 값을 받아서 DB에
 * 덮어쓰는 것까지가 우리 책임이라, 여기서 매번 갱신 응답을 확인해 저장한다.
 */
import { prisma } from "@/lib/prisma";

function getRestApiKey(): string {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error("KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.");
  return key;
}

/** 카카오 로그인의 "클라이언트 시크릿" 활성화 여부는 콘솔에서 켜고 끌 수 있는데,
 * 켜져 있으면 토큰 요청에 이 값을 안 넣을 경우 KOE010(Bad client credentials)로
 * 실패한다. 활성화하지 않았다면 KAKAO_CLIENT_SECRET을 비워두면 된다. */
function getClientSecret(): string | undefined {
  return process.env.KAKAO_CLIENT_SECRET || undefined;
}

interface KakaoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  refresh_token_expires_in?: number;
}

export async function exchangeKakaoCodeForToken(code: string, redirectUri: string): Promise<KakaoTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: getRestApiKey(),
    redirect_uri: redirectUri,
    code,
  });
  const clientSecret = getClientSecret();
  if (clientSecret) body.set("client_secret", clientSecret);
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`카카오 토큰 발급 실패: ${JSON.stringify(data)}`);
  return data as KakaoTokenResponse;
}

/** 해당 라벨로 저장된 refresh_token을 DB에서 읽는다. */
export async function getStoredKakaoRefreshToken(label: string): Promise<string | null> {
  const row = await prisma.kakaoToken.findUnique({ where: { label } });
  return row?.refreshToken ?? null;
}

/** 동의 직후 또는 갱신 응답으로 받은 refresh_token을 DB에 저장(덮어쓰기)한다. */
export async function saveKakaoRefreshToken(label: string, refreshToken: string): Promise<void> {
  await prisma.kakaoToken.upsert({
    where: { label },
    create: { label, refreshToken },
    update: { refreshToken },
  });
}

async function refreshKakaoAccessToken(label: string): Promise<string> {
  const refreshToken = await getStoredKakaoRefreshToken(label);
  if (!refreshToken) {
    throw new Error(`저장된 카카오 리프레시 토큰이 없습니다 (${label}). /api/kakao/oauth-callback으로 재인증하세요.`);
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: getRestApiKey(),
    refresh_token: refreshToken,
  });
  const clientSecret = getClientSecret();
  if (clientSecret) body.set("client_secret", clientSecret);
  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`카카오 액세스 토큰 갱신 실패: ${JSON.stringify(data)}`);
  const result = data as KakaoTokenResponse;
  // 리프레시 토큰 유효기간이 1개월 미만으로 남으면 카카오가 새 refresh_token을
  // 같이 내려준다. 저장해두지 않으면 원래 발급일 기준 2개월 뒤 하드 만료된다.
  if (result.refresh_token) {
    await saveKakaoRefreshToken(label, result.refresh_token);
  }
  return result.access_token;
}

/** label로 저장된 refresh_token을 찾아 "나에게 보내기"를 호출해 텍스트 메시지를 보낸다. */
export async function sendKakaoMemoToSelf(label: string, text: string, linkUrl?: string): Promise<void> {
  const accessToken = await refreshKakaoAccessToken(label);
  const templateObject = {
    object_type: "text",
    text,
    link: linkUrl ? { web_url: linkUrl, mobile_web_url: linkUrl } : { web_url: "", mobile_web_url: "" },
    button_title: "리포트 보기",
  };
  const res = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({ template_object: JSON.stringify(templateObject) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`카카오톡 메시지 전송 실패: ${JSON.stringify(data)}`);
  }
}

/** 등록된 모든 수신자(본인/와이프 등)에게 보낸다. 하나가 실패해도 나머지는 계속 보낸다.
 * 새 수신자를 추가했다면 여기에도 { label, displayName } 항목을 추가해야 한다
 * (label은 /api/kakao/oauth-callback 동의 시 쓴 state 값과 일치해야 한다). */
export async function notifyAllKakaoRecipients(text: string, linkUrl?: string): Promise<void> {
  const recipients = [
    { label: "me", displayName: "본인" },
    { label: "wife", displayName: "와이프" },
  ];

  for (const r of recipients) {
    const hasToken = await getStoredKakaoRefreshToken(r.label);
    if (!hasToken) continue;
    try {
      await sendKakaoMemoToSelf(r.label, text, linkUrl);
    } catch (err) {
      console.error(`카카오톡 알림 실패 (${r.displayName}):`, err);
    }
  }
}
