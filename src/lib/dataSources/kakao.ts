/**
 * 카카오톡 "나에게 보내기" 알림 (리포트 생성 완료 시).
 *
 * 사람 수만큼(본인/와이프) 각자 카카오 로그인으로 발급받은 리프레시 토큰을
 * env에 저장해두고, 필요할 때마다 access_token으로 교환해 "나에게 보내기"
 * API를 호출한다. "친구에게 보내기"가 아니라 각자 자기 자신에게 보내는
 * 방식이라 카카오 친구 목록 연동이나 앱 심사 없이 쓸 수 있다.
 *
 * 참고: 리프레시 토큰은 기본적으로 발급 후 약 2개월간 유효하다. 카카오
 * 개발자 콘솔에서 "리프레시 토큰 자동 연장"을 켜두면 사용할 때마다 만료일이
 * 늘어나지만, 그렇지 않으면 만료 후 각자 다시 로그인해서 새 토큰을 받아야
 * 한다.
 */

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

async function refreshKakaoAccessToken(refreshToken: string): Promise<string> {
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
  return (data as KakaoTokenResponse).access_token;
}

/** refreshToken 하나로 "나에게 보내기"를 호출해 텍스트 메시지를 보낸다. */
export async function sendKakaoMemoToSelf(refreshToken: string, text: string, linkUrl?: string): Promise<void> {
  const accessToken = await refreshKakaoAccessToken(refreshToken);
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

/** 등록된 모든 수신자(본인/와이프 등)에게 보낸다. 하나가 실패해도 나머지는 계속 보낸다. */
export async function notifyAllKakaoRecipients(text: string, linkUrl?: string): Promise<void> {
  const recipients: { label: string; refreshToken: string }[] = [
    { label: "본인", refreshToken: process.env.KAKAO_REFRESH_TOKEN_ME ?? "" },
    { label: "와이프", refreshToken: process.env.KAKAO_REFRESH_TOKEN_WIFE ?? "" },
  ].filter((r) => r.refreshToken);

  for (const r of recipients) {
    try {
      await sendKakaoMemoToSelf(r.refreshToken, text, linkUrl);
    } catch (err) {
      console.error(`카카오톡 알림 실패 (${r.label}):`, err);
    }
  }
}
