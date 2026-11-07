@AGENTS.md

# 코드 수정 후 검증

프로그램 코드를 수정했으면 커밋/머지 전에 아래 세 가지를 모두 실행해 통과를
확인한다:

1. `npx tsc --noEmit` — 타입 에러 없음
2. `npm run lint` — 린트 에러 없음
3. `npm run build` — 빌드 성공
