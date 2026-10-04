# 데일리 트레이딩 종목 스크리너

DESIGN.md의 요구사항에 따라 구현한 매수 후보 종목 자동 스크리닝 앱. 정규장 마감
후 3개 매수 전략을 자동 실행해 리포트를 생성하고, 웹페이지에서 전략별/단계별
결과와 히스토리를 확인할 수 있다.

## 기술 스택

- Next.js 16 (App Router, TypeScript) — Vercel 배포 전제, 함수 리전은 `icn1`(서울)
- Prisma ORM 7 + PostgreSQL (Vercel Postgres, Neon 등 아무 Postgres 호환 DB)
- Google Gemini API(기본, 무료 티어) / Anthropic API(Claude) / Ollama(로컬) — 전략1의
  재료(뉴스/공시) 판단 Agent, `MATERIAL_JUDGE_PROVIDER`로 전환
- Resend — 리포트 생성 완료 이메일 알림
- 카카오톡 "나에게 보내기" API — 리포트 생성 완료 카카오톡 알림 (수신자별 설정)
- Vercel Cron — 매일 자동 리포트 생성 스케줄
- lightweight-charts — 종목 일봉 차트 + 추천시점/전략별 추천일 마커 + 거래량 히스토그램

## 데이터 소스와 그 한계 (중요)

- **시세/거래량/랭킹/테마/투자자동향**: `stock.naver.com`의 비공식 내부 API를
  스크래핑한다 (`src/lib/dataSources/naver.ts`). 문서화된 공식 API가 아니며,
  네이버가 예고 없이 응답 구조를 바꾸면 이 모듈이 가장 먼저 깨진다.
  엔드포인트 목록은 2026-09-22 기준 실제 호출로 검증했다.
- **뉴스**: DESIGN.md §5는 원래 "이데일리"만 명시했지만, 실제 검증 과정에서
  이데일리 자체 검색은 관련성 낮은 결과를 섞어 내거나 최신 기사를 놓치는 문제가
  있었고, 이데일리 한 곳으로 한정하면 커버리지가 부족했다(당일 상한가 관련
  기사를 다른 언론사만 다룬 경우 등). 그래서 네이버 종목뉴스 API
  (`stock.naver.com/api/domestic/detail/news`)를 사용하되, 네이버가 같은
  사건의 중복 보도를 묶어주는 클러스터 구조를 활용해 클러스터당 대표 기사
  1건만 취하는 방식으로 바꿨다(`src/lib/dataSources/stockNews.ts`). 이러면
  전체 언론사를 커버하면서도 중복 기사 문제가 없다. 이것도 비공식 API다.
- **공시**: DART 전자공시시스템 Open API(공식, `opendart.fss.or.kr`)를 사용한다.
  `DART_API_KEY` 발급이 필요하다.
- DESIGN.md §5의 미결 항목대로, 네이버 스크래핑 방식의 안정성/이용약관은
  운영 전 별도 검토가 필요하다.

## 환경변수 설정

`.env.example`을 복사해 `.env`를 만들고 값을 채운다.

```bash
cp .env.example .env
```

| 변수 | 설명 |
| --- | --- |
| `DATABASE_URL` | Postgres 연결 문자열 |
| `SITE_PASSWORD` | 사이트 접근용 고정 비밀번호 |
| `SESSION_SECRET` | 세션 쿠키 서명용 랜덤 문자열 (`openssl rand -hex 32`) |
| `MATERIAL_JUDGE_PROVIDER` | `gemini`(기본, 무료 티어로 로컬/운영 모두 사용 가능, 권장) / `anthropic`(유료) / `ollama`(로컬 전용, 클라우드에서는 접근 불가) |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | provider=gemini일 때 필요. 키는 https://aistudio.google.com/apikey 에서 무료 발급 |
| `ANTHROPIC_API_KEY` | provider=anthropic일 때 필요한 Claude API 키 |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | provider=ollama일 때 사용할 로컬 Ollama 서버 주소/모델 |
| `DART_API_KEY` | DART Open API 키 |
| `RESEND_API_KEY` / `ALERT_EMAIL_FROM` / `ALERT_EMAIL_TO` | 리포트 완료 이메일 알림 |
| `KAKAO_REST_API_KEY` / `KAKAO_CLIENT_SECRET` / `KAKAO_REDIRECT_URI` / `KAKAO_REFRESH_TOKEN_*` | 리포트 완료 카카오톡 알림. 설정 방법은 아래 "카카오톡 알림 설정" 참고 |
| `NEXT_PUBLIC_BASE_URL` | 이메일·카카오 메시지에 넣을 웹페이지 기본 URL (실제 배포 도메인이어야 링크가 열린다) |
| `CRON_SECRET` | `/api/cron/generate-report` 인증용 (Vercel이 자동 주입하는 값을 그대로 써도 됨) |

## 로컬 개발

```bash
npm install
npx prisma migrate dev --name init   # DB 스키마 최초 적용 (DATABASE_URL 필요)
npm run dev
```

`npx prisma migrate dev`는 실제로 연결 가능한 Postgres가 있어야 동작한다.
로컬에 Postgres가 없다면 Docker로 하나 띄우거나(`docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres`),
Neon/Vercel Postgres의 무료 티어를 바로 써도 된다.

## 재료 판단 모델 (Gemini 기본)

로컬/운영 모두 `MATERIAL_JUDGE_PROVIDER="gemini"`를 기본값으로 쓴다. 무료 티어라
비용이 없고, Anthropic과 달리 로컬 개발과 Vercel 운영 양쪽에서 동일하게 동작한다
(Ollama는 로컬 서버라 Vercel 같은 클라우드 환경에서는 애초에 접근이 불가능하다).
키는 https://aistudio.google.com/apikey 에서 신용카드 등록 없이 무료로 발급받는다.

주의할 점:

- Gemini는 모델 세대 교체가 잦다. 코드 기본값(`gemini-3.5-flash`)이 지원 종료되면
  `GEMINI_API_KEY`로 `GET https://generativelanguage.googleapis.com/v1beta/models?key=...`를
  호출해 사용 가능한 모델 목록을 확인하고 `GEMINI_MODEL` 환경변수로 교체한다.
- 무료 티어는 가끔 일시적으로 503("high demand")을 반환한다. `materialJudge.ts`의
  `completeWithGemini`가 503에 한해 최대 2회 자동 재시도하므로 리포트 실행 자체가
  깨지지는 않지만, 완전히 없어지지는 않는 특성이니 참고한다.

### Anthropic(Claude)으로 전환하려면

`MATERIAL_JUDGE_PROVIDER="anthropic"` + `ANTHROPIC_API_KEY`로 바꾸면 된다. Gemini보다
한국어 판단 품질이 살짝 더 안정적일 수 있으나 유료다.

### 완전 오프라인 로컬 테스트 (Ollama)

인터넷 연결 없이 전략1 로직만 테스트하고 싶을 때 쓴다. 운영에는 쓸 수 없다(로컬
서버라 Vercel에서 접근 불가).

```bash
winget install Ollama.Ollama   # 최초 1회 설치
ollama pull llama3.1:8b        # 최초 1회 모델 다운로드 (약 4.9GB)
```

`.env`에서 `MATERIAL_JUDGE_PROVIDER="ollama"`로 설정한다. 실제 비교 테스트 결과:
`qwen2.5:7b`는 뉴스/공시 원문이 여러 건 주어지면 요청한 JSON 스키마를 무시하거나
(`{"재료": [...]}` 같은 임의 형식), 횡령·배임 혐의처럼 명백한 악재도 "재료 없음"으로
놓치는 등 판단 품질이 낮았다. `llama3.1:8b`는 같은 입력에서 정확한 판단
(`verdict: "negative"`, 근거 요약, 관련 없는 공시 제외)을 냈다 — 그래도 Gemini/Claude
대비 품질은 떨어질 수 있다.

## 리포트 생성 실행 방법

- **자동**: `vercel.json`에 등록된 Vercel Cron이 평일 07:00 UTC(KST 16:00)에
  `/api/cron/generate-report`를 호출하고, 08:00 UTC(KST 17:00)에
  `/api/cron/final-recommendation`을 호출한다. Vercel Cron 스케줄은 항상 UTC
  기준이라 KST로 바꾸려면 9시간을 빼서 계산해야 한다.
- **카카오톡 알림은 최종 추천 cron이 끝난 뒤 하루 한 번만** 간다. 리포트가 끝난
  16시에 알리면 들어가도 최종 추천이 아직 비어 있어서, 하루 일과의 마지막으로
  옮겼다. 최종 추천이 건너뛰어졌거나 실패한 경우도 그 사실을 담아 보낸다.
- **수동**: 로그인 후 대시보드의 "리포트 재생성" 버튼, 또는
  `POST /api/reports/regenerate` 직접 호출.

## 휴장일에는 모든 스케줄이 건너뛴다 (DESIGN.md §15)

평일이어도 국경일·임시공휴일이면 시장이 열리지 않는다. 그런 날 스케줄이 돌면 전
거래일 수치를 그날 날짜로 기록하게 되므로, 모든 cron이 실행 전에 개장 여부를 확인한다.

판정 근거는 네이버 랭킹 응답의 `marketStatus`인데, 이 값은 **장중에만** 쓸 수 있다 —
장 마감 후에는 휴장일과 정상 거래일이 모두 `CLOSE`로 보인다. 그래서 정규장 한가운데인
**13:00에 확인 전용 cron**(`/api/cron/market-status`)을 두고 결과를 `MarketDayStatus`
테이블에 남기고, 이후 cron들이 그 기록을 읽는다.

| 시각(KST) | cron | 하는 일 |
| --- | --- | --- |
| 13:00 | `/api/cron/market-status` | 개장 여부 확인·기록 |
| 15:45 | `/api/cron/daily-briefing` | 브리핑 Notion 기록 |
| 16:00 | `/api/cron/generate-report` | 리포트 생성 |
| 17:00 | `/api/cron/final-recommendation` | 최종 추천 + 카카오톡 알림 |

휴장일이면 뒤의 세 작업이 `{"status":"skipped","reason":"non-trading-day"}`를 돌려주고
끝낸다. 카카오톡도 가지 않는다. 13시 기록이 없으면(cron 누락) **실행하는 쪽으로**
판단하고 응답에 `marketDayCheck: "no-record"`를 남긴다 — 정상 거래일을 잃는 것이
휴장일에 잘못 실행하는 것보다 나쁘기 때문이다.

**화면의 재생성 버튼에는 이 가드를 두지 않는다.** 사람이 누른 것은 의도로 본다.
13시 판정이 잘못돼 그날 자동 실행이 모두 건너뛰어졌을 때 이 버튼들이 복구 수단이
된다. 버튼은 세 곳에 있다.

| 화면 | 버튼 | 호출 |
| --- | --- | --- |
| 전략 1~4 리포트 | 리포트 재생성 | `POST /api/reports/regenerate` |
| 종합 추천 | 종합 추천 다시 실행 | `POST /api/final-recommendation/regenerate` |
| 오늘의 브리핑 | Notion에 다시 기록 | `POST /api/briefing/regenerate` |

브리핑 버튼의 이름이 "재생성"이 아닌 이유는, 화면이 열 때마다 네이버를 조회해 늘
최신이기 때문이다. 이 버튼이 고치는 대상은 Notion 기록이다.

이 기능은 **DB 마이그레이션이 필요하다.** 배포 전에 `npx prisma migrate deploy`를 실행한다.

## 당일 상한가 / 거래량 브리핑 (DESIGN.md §14)

스크리너와 **별개 기능**이다. 당일 상한가 종목과 거래량 1,000만 주 이상 종목을
걸러내지 않고 그대로 모아 보여준다. 전략 1~4와 로직을 공유하지 않으며
(`naver.ts`의 읽기 전용 함수 두 개만 사용), DB도 쓰지 않는다.

- **화면**: 상단 네비게이션의 **오늘의 브리핑** 탭(`/briefing`). 이메일로 보내던 것과
  같은 구성으로 상한가 묶음과 거래량 묶음을 표로 보여주고, 종목마다 뉴스·공시·시세
  링크를 붙인다. 열 때마다 네이버에서 바로 조회하므로 항상 최신 수치다.
- **Notion 링크**: 페이지 우측 상단의 `Notion에서 보기` 버튼이 `NOTION_VIEW_URL`로
  이동한다. 과거 날짜 조회는 Notion의 누적 기록이 담당한다.
- **알림은 보내지 않는다.** 하루에 카카오톡이 두 번 오는 것이 번거로워, 알림은 16:00
  리포트 완료 카카오톡 하나로 통일했다. 브리핑 Cron은 Notion 기록만 한다.
- **자동**: Vercel Cron이 평일 06:45 UTC(KST 15:45)에 `/api/cron/daily-briefing`을
  호출해 그날 행을 Notion에 기록한다. Hobby 플랜은 Cron 시각 정밀도가 ±59분이라
  실제로는 KST 15:45~16:44 사이에 실행되는데, 15:30 장 마감 이후라 어느 시점에
  실행돼도 같은 종가를 읽는다.
- **수동 확인**: 배포 후 아래처럼 직접 호출하면 결과를 바로 볼 수 있다. 응답에
  종목 목록과 `notion` 상태(`ok` / `skipped` / `failed`)가 담긴다.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<배포주소>/api/cron/daily-briefing
```

### Notion 설정

`NOTION_TOKEN`과 `NOTION_DATABASE_ID`가 없으면 Notion 기록을 건너뛴다(`skipped`).
웹 탭은 저장된 값을 읽지 않으므로 Notion 설정과 무관하게 그대로 동작한다. 기록하려면:

1. <https://www.notion.com/my-integrations>에서 통합을 만들고 `ntn_`으로 시작하는
   토큰을 복사한다.
2. 대상 데이터베이스를 열고 `•••` → `연결 추가`로 그 통합을 연결한다.
   **이 단계를 빠뜨리면 토큰이 맞아도 404가 난다.**
3. 데이터베이스 속성을 아래와 같이 구성한다. 이름과 형식이 정확히 일치해야 한다.

| 속성 | 형식 | 속성 | 형식 |
| --- | --- | --- | --- |
| `종목명` | 제목(title) | `거래량` | 숫자 |
| `코드` | 텍스트 | `구분` | 다중 선택 |
| `시장` | 선택 | `뉴스` | URL |
| `날짜` | 날짜 | `공시` | URL |
| `종가` | 숫자 | `시세` | URL |
| `등락률` | 숫자 | | |

`시장`과 `구분`의 선택 항목은 미리 만들지 않아도 Notion이 자동 추가한다.

같은 거래일에 다시 실행하면 그날 행을 휴지통으로 옮기고 다시 쓴다. Cron 재시도나
수동 재호출에서 행이 중복되지 않는다.

### 웹 페이지의 Notion 버튼이 열 뷰 (NOTION_VIEW_URL)

데이터베이스 **기본 주소**로 보내면 모든 날짜의 행이 한 표에 섞여 보여서 그날 종목을
직접 찾아야 한다. 그래서 Notion에 아래 뷰를 만들고 그 링크를 `NOTION_VIEW_URL`에 넣는다.
비워두면 버튼 자체가 표시되지 않는다.

1. 데이터베이스 뷰 탭의 `+`로 표 뷰를 추가하고 이름을 `오늘`로 둔다.
2. `필터` → `날짜` → `오늘`(상대 날짜)을 건다. 매일 그날 행만 보인다.
3. `속성`에서 `종목명`·`구분`·`등락률`·`거래량`만 켜고 나머지는 끈다 — 모바일에서
   가로 스크롤이 사라진다. 끈 속성은 행을 열면 그대로 보인다.
4. `정렬`을 `거래량` 내림차순으로 둔다.
5. 그 뷰의 `•••` → `링크 복사` 값을 `NOTION_VIEW_URL`로 등록한다.

복사한 링크의 도메인이 `app.notion.com`으로 나올 수 있다. 동작에는 문제가 없지만,
`https://www.notion.so/<페이지ID>?v=<뷰ID>` 형태로 바꿔 쓰면 카카오 콘솔의 웹 도메인
등록(`www.notion.so`)과 일치해 카카오 메시지에서 열 때도 같은 링크를 쓸 수 있다.
`&source=copy_link`는 복사 추적용 파라미터라 떼어내도 된다.

### 열람 권한

Notion 계정이 없는 사람에게 보여줘야 하면 **웹 탭을 쓰면 된다.** 사이트 전체가 고정
비밀번호 하나로 보호되므로 계정 없이 비밀번호만 공유하면 되고, 모바일 인앱 브라우저에서도
입력 칸 하나라 확실히 동작한다.

Notion 자체 공유로는 "계정 없는 특정인에게만 공개"가 불가능하다. 웹 공개 링크는 계정이
필요 없지만 링크를 가진 누구나 볼 수 있고 비밀번호를 걸 수 없다. 게스트 초대는 특정인만
보지만 상대방의 Notion 계정이 필요하다(무료 플랜 게스트 10명, 구글 로그인으로 가입
가능). 게스트는 초대받은 데이터베이스만 보고 워크스페이스의 다른 페이지는 보지
못하며, 권한을 `읽기 허용`으로 두면 수정도 막힌다.

## 카카오톡 알림 설정

리포트 생성이 끝나면 등록된 수신자 전원에게 카카오톡 "나에게 보내기"로 알림을
보낸다(`src/lib/dataSources/kakao.ts`). "친구에게 보내기"가 아니라 각자 자기
자신에게 보내는 방식이라, 카카오 친구 목록 연동이나 정식 앱 심사 없이 쓸 수 있다.
발송이 실패해도 리포트 생성 자체는 실패하지 않는다(로그만 남기고 넘어간다).

1. https://developers.kakao.com 에서 앱을 만들고 "카카오 로그인"을 활성화한 뒤,
   플랫폼(Web)에 배포 도메인을 등록한다.
   - **"제품 링크 관리 > 웹 도메인"에도 배포 도메인을 등록해야 한다.** 이걸 빼먹으면
     카카오톡 메시지의 버튼은 보이는데 눌러도 링크가 안 열리는 증상이 생긴다.
   - 리다이렉트 URI는 `<배포 도메인>/api/kakao/oauth-callback`으로 등록한다
     (`KAKAO_REDIRECT_URI`와 정확히 일치해야 한다).
   - "카카오 로그인 > 보안"에서 클라이언트 시크릿을 켰다면 `KAKAO_CLIENT_SECRET`도
     반드시 채워야 한다. 안 채우면 토큰 발급이 `KOE010 Bad client credentials`로
     실패한다.
2. 수신자를 늘리려면(가족 등) 카카오 개발자 콘솔의 "팀 관리"에서 그 사람 이메일을
   Viewer로 초대한다. 휴면 카카오 계정은 초대 메일을 못 받을 수 있으니, 카카오
   앱/웹에 한 번 로그인해 휴면 해제부터 시키는 게 먼저다.
3. 수신자마다 아래 링크를 열어 "카카오톡 메시지 전송" 항목에 동의하게 한다
   (`state` 값은 수신자 구분용 라벨, 아무 문자열이나 가능):
   ```
   https://kauth.kakao.com/oauth/authorize?client_id=<KAKAO_REST_API_KEY>&redirect_uri=<KAKAO_REDIRECT_URI>&response_type=code&scope=talk_message&state=<라벨>
   ```
4. 동의가 끝나면 `/api/kakao/oauth-callback` 페이지에 refresh_token이 표시된다.
   그 값을 `KAKAO_REFRESH_TOKEN_<라벨>` 환경변수로 로컬 `.env`와 Vercel 양쪽에
   등록한다. 새 수신자를 추가했다면 `notifyAllKakaoRecipients`(`kakao.ts`)의
   `recipients` 배열에도 항목을 추가해야 한다.
5. 리프레시 토큰은 발급 후 약 2개월간 유효하다. 카카오 개발자 콘솔에서
   "리프레시 토큰 자동 연장"을 켜두면 사용할 때마다 만료일이 늘어난다.

## 재료 판단 기준 수정

전략1의 호재/악재 판단 기준은 코드가 아니라 `skills/material-judgment/SKILL.md`
파일로 관리한다 (DESIGN.md §8). 이 파일을 수정하면 다음 리포트 생성부터 바로
반영된다.

## 전략 파라미터 조정

`/settings` 페이지에서 전략별 숫자 파라미터(거래량 배수, 이동평균 기간 등)를
조정할 수 있다. 저장 즉시 다음 실행부터 반영된다 (DESIGN.md §8).

## 종목 상세 차트

`/stock/[code]`는 일봉 캔들차트 아래에 거래량 히스토그램을 함께 보여준다
(`src/components/CandleChart.tsx`, lightweight-charts v5의 별도 `HistogramSeries` +
`scaleMargins`로 두 영역을 분리). 마커는 두 종류다:

- **주황 화살표**: 이 종목이 각 전략의 최종 추천 목록에 포함됐던 모든 날짜
  (`/api/stock/[code]/candles`가 DB의 `isFinal` 스텝 픽을 조회해서 계산).
- **초록 화살표("추천시점")**: 히스토리/대시보드에서 종목을 클릭해 들어온 그
  특정 날짜. `StockTable`이 링크에 `?date=YYYY-MM-DD`를 붙이고, 페이지가
  `useSearchParams`로 읽어 `CandleChart`의 `highlightDate`로 넘긴다. 최종 추천이
  아닌 단계(예: 전략1 2단계의 호재/악재/중립 전체 목록)에서 클릭해도 표시된다 —
  DB 조회 없이 클릭 시점의 날짜를 그대로 쓰기 때문이다.

## 설계상 주요 가정 (DESIGN.md에 명시되지 않아 구현 시 채택한 결정)

- 전략2 "강세장 확인"의 지수는 KOSPI를 사용한다.
- "역사적 신고가"는 최근 약 10년치 일봉 데이터 범위 내 최고가 경신으로 근사한다
  (상장 이후 전체 역사를 다 확인하는 것은 아님).
- "신용거래 불가 종목" 제외는 공식 API가 없어 네이버의 투자유의/경고/위험 지정
  종목으로 대체(근사)한다.
- 전략3 1단계 거래량 급증 후보군은 네이버 "거래량 급증" 랭킹 상위 100종목을
  1차 필터로 사용한다 (전체 종목을 매일 스캔하지 않음).

## 배포 (Vercel)

1. Vercel 프로젝트 생성 후 위 환경변수를 모두 등록한다.
2. Postgres DB(Vercel Postgres 등)를 연결하고 `DATABASE_URL`을 설정한다.
3. 최초 배포 전 `npx prisma migrate deploy`로 스키마를 적용한다.
4. `vercel.json`의 Cron이 자동으로 등록된다.
5. Vercel 프로젝트 설정에서 `CRON_SECRET`을 등록하면 Vercel이 Cron 요청에
   자동으로 `Authorization: Bearer $CRON_SECRET` 헤더를 붙인다.
6. `vercel.json`에 `"regions": ["icn1"]`(서울)이 지정되어 있다. 네이버/DART API가
   전부 한국 서버라, 기본 리전(미국 동부 iad1)에서 실행하면 API 호출마다 태평양
   왕복 지연이 누적돼 리포트 생성이 4분 이상 걸린다(서울 리전에서는 30~40초).
   **이 설정을 지우지 말 것.**
7. Vercel에 새 환경변수를 추가/변경한 뒤에는 반드시 재배포해야 반영된다(기존에
   떠 있는 배포는 그대로 예전 값을 쓴다). `NEXT_PUBLIC_*` 변수는 빌드 시점에
   번들에 박히므로 특히 더 그렇다.

## 알려진 제약

- 리포트 생성 API(`/api/cron/generate-report`, `/api/reports/regenerate`)는
  `maxDuration: 300`(초)로 설정되어 있다. Vercel Hobby 플랜은 함수 실행 시간
  제한이 더 짧을 수 있으므로, 종목 수가 많아 300초 근처까지 걸린다면 Pro
  플랜 이상이 필요할 수 있다. (서울 리전 적용 후에는 보통 40초 내외로 끝나
  여유가 크다.)

## 알려진 TODO

- Next.js 16이 `middleware.ts` 대신 `proxy.ts` 파일 컨벤션을 권장한다는 경고가
  빌드 시 출력된다(동작에는 문제없음). 필요 시
  `npx @next/codemod@canary middleware-to-proxy .`로 마이그레이션한다.
"# stock_recommend" 
