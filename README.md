# 데일리 트레이딩 종목 스크리너

DESIGN.md의 요구사항에 따라 구현한 매수 후보 종목 자동 스크리닝 앱. 정규장 마감
후 3개 매수 전략을 자동 실행해 리포트를 생성하고, 웹페이지에서 전략별/단계별
결과와 히스토리를 확인할 수 있다.

## 기술 스택

- Next.js 16 (App Router, TypeScript) — Vercel 배포 전제
- Prisma ORM 7 + PostgreSQL (Vercel Postgres, Neon 등 아무 Postgres 호환 DB)
- Anthropic API (Claude) — 전략1의 재료(뉴스/공시) 판단 Agent
- Resend — 리포트 생성 완료 이메일 알림
- Vercel Cron — 매일 자동 리포트 생성 스케줄
- lightweight-charts — 종목 일봉 차트 + 추천 마커

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
| `MATERIAL_JUDGE_PROVIDER` | `anthropic`(운영 권장) 또는 `ollama`(로컬 개발/테스트, 무료) |
| `ANTHROPIC_API_KEY` | provider=anthropic일 때 필요한 Claude API 키 |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | provider=ollama일 때 사용할 로컬 Ollama 서버 주소/모델 |
| `DART_API_KEY` | DART Open API 키 |
| `RESEND_API_KEY` / `ALERT_EMAIL_FROM` / `ALERT_EMAIL_TO` | 리포트 완료 이메일 알림 |
| `NEXT_PUBLIC_BASE_URL` | 이메일에 넣을 웹페이지 기본 URL |
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

## 재료 판단 로컬 테스트 (Ollama)

`ANTHROPIC_API_KEY` 없이 전략1 로직을 테스트하고 싶을 때는 로컬 LLM으로 대체할 수 있다.

```bash
winget install Ollama.Ollama   # 최초 1회 설치
ollama pull llama3.1:8b        # 최초 1회 모델 다운로드 (약 4.9GB)
```

`.env`에서 `MATERIAL_JUDGE_PROVIDER="ollama"`로 설정하면 된다(로컬 개발용 기본값).
실제 비교 테스트 결과: `qwen2.5:7b`는 뉴스/공시 원문이 여러 건 주어지면 요청한 JSON
스키마를 무시하거나(`{"재료": [...]}` 같은 임의 형식), 횡령·배임 혐의처럼 명백한
악재도 "재료 없음"으로 놓치는 등 판단 품질이 낮았다. `llama3.1:8b`는 같은 입력에서
정확한 판단(`verdict: "negative"`, 근거 요약, 관련 없는 공시 제외)을 냈다 — 로컬로
테스트할 거면 `llama3.1:8b`를 권장한다. 둘 다 VRAM이 작은 GPU(예: 6GB)에서는 일부가
CPU로 오프로드되어 느리다(종목당 수십 초). 그래도 Claude 대비 품질은 떨어질 수 있어
운영 배포 시에는 반드시 `MATERIAL_JUDGE_PROVIDER="anthropic"` + `ANTHROPIC_API_KEY`로
전환한다.

## 리포트 생성 실행 방법

- **자동**: `vercel.json`에 등록된 Vercel Cron이 평일 09:00 UTC(KST 18:00, 정규장
  마감 후 20:00 이전)에 `/api/cron/generate-report`를 호출한다.
- **수동**: 로그인 후 대시보드의 "리포트 재생성" 버튼, 또는
  `POST /api/reports/regenerate` 직접 호출.

## 재료 판단 기준 수정

전략1의 호재/악재 판단 기준은 코드가 아니라 `skills/material-judgment/SKILL.md`
파일로 관리한다 (DESIGN.md §8). 이 파일을 수정하면 다음 리포트 생성부터 바로
반영된다.

## 전략 파라미터 조정

`/settings` 페이지에서 전략별 숫자 파라미터(거래량 배수, 이동평균 기간 등)를
조정할 수 있다. 저장 즉시 다음 실행부터 반영된다 (DESIGN.md §8).

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

## 알려진 제약

- 리포트 생성 API(`/api/cron/generate-report`, `/api/reports/regenerate`)는
  `maxDuration: 300`(초)로 설정되어 있다. Vercel Hobby 플랜은 함수 실행 시간
  제한이 더 짧을 수 있으므로, 종목 수가 많아 300초 근처까지 걸린다면 Pro
  플랜 이상이 필요할 수 있다.

## 알려진 TODO

- Next.js 16이 `middleware.ts` 대신 `proxy.ts` 파일 컨벤션을 권장한다는 경고가
  빌드 시 출력된다(동작에는 문제없음). 필요 시
  `npx @next/codemod@canary middleware-to-proxy .`로 마이그레이션한다.
"# stock_recommend" 
