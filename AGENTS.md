<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Git 브랜치 워크플로우 (필독)

- `main`은 GitHub Branch protection rule로 보호되어 있다. **`main`에 직접
  `git push`는 서버에서 거부된다** (저장소 소유자 포함, 우회 불가). 이 문서를
  읽지 않았어도 push 시도 자체가 막히지만, 막힌 다음에 알아채면 이미 `main`
  기준으로 작업을 진행한 커밋들을 다시 정리해야 하므로 처음부터 아래 순서를
  따른다.
- 개발은 항상 `dev` 브랜치(또는 `dev`에서 딴 기능 브랜치)에서 진행한다:
  ```bash
  git checkout dev
  git pull origin dev
  # 작업 ...
  git push origin dev
  ```
- `main`에 반영하려면 PR을 만들어 merge한다(`gh pr create --base main --head dev`,
  또는 GitHub 웹에서). 별도 승인자 리뷰는 요구되지 않지만(혼자 작업하는
  저장소이므로), **merge 전에 반드시 아래를 검증**한다:
  1. `npx tsc --noEmit` — 타입 에러 없음
  2. `npm run build` — 빌드 성공
  3. 가능하면 실제로 동작을 확인한다(로컬 리포트 재생성, 또는 배포 후
     `/api/cron/generate-report`를 직접 호출해 `status`/`errorMessage` 확인 등).
     README의 각 기능 절 참고.

# 백로그

할 일·아이디어·추적 중인 리스크는 `BACKLOG.md`에 있다. 다음에 무엇을 할지 고를
때는 이 문서를 먼저 읽는다. 작업 중에 새로 알게 된 할 일이나 리스크는 README에
흩어 적지 말고 `BACKLOG.md`에 항목으로 추가한다(사용 규칙은 문서 안에 있다).
구현이 끝난 항목은 백로그에서 지우고 `DESIGN.md`/`README.md`로 옮긴다 — 완료
기록은 git 이력이 담당한다.

# 검토 서브에이전트

코드·구조·보안·테스트·문서·성능·리팩터링·데이터 모델을 각각 보는 리뷰어
서브에이전트 8종이 있다. **이 저장소에는 없다** — `~/.claude/agents/`(전역,
모든 프로젝트 공용)에 있고, 이 프로젝트 전용 내용은 담지 않는 프로젝트
비종속 정의라 git으로 추적하지 않는다. 다른 저장소를 열어도 그대로
쓸 수 있다.

이들은 **파일을 고치지 않는다** — `review-result/<agent>-<YYYY-MM-DD>.md`로
보고서만 쓰고, 무엇을 적용할지는 보고서를 읽은 메인 세션이 판단한다.
`review-result/`는 이 프로젝트의 디렉터리이고 git에서 제외된다(특정 커밋
시점 기준이라 금방 낡는다).

에이전트를 추가하거나 고칠 때는 `~/.claude/agents/`의 기존 파일을 복사해
`name`·`description`·`역할`·`점검 항목`만 바꾸고, `산출물`·`하지 않는 것`
절의 규약(보고서 경로, 머리말 필드, `Edit` 미부여)은 그대로 둔다 — 8종이
같은 규약을 공유하는 것이 이 구조의 전제다. 정의를 고친 뒤에는 세션을
재시작해야 반영된다(세션 시작 시점에만 로드).
