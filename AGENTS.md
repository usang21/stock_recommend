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
