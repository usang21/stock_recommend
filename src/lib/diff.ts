/**
 * 추천 로직 변경 이력 화면에서 버전 간 차이를 보여주기 위한 라인 단위 diff
 * (DESIGN.md §13). 대상이 md 문서 한 편이라 라인 수가 많지 않아, 외부 의존성을
 * 더하는 대신 LCS를 직접 계산한다.
 */

export interface DiffLine {
  type: "add" | "remove" | "same";
  text: string;
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");

  // lcs[i][j] = a[i..], b[j..]의 최장 공통 부분수열 길이
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ type: "remove", text: a[i] });
      i++;
    } else {
      result.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < a.length) result.push({ type: "remove", text: a[i++] });
  while (j < b.length) result.push({ type: "add", text: b[j++] });

  return result;
}

/** 변경 없는 구간이 길면 접어서, 바뀐 줄 주변 context줄만 남긴다. */
export function collapseUnchanged(lines: DiffLine[], context = 2): (DiffLine | { type: "gap"; count: number })[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, idx) => {
    if (line.type === "same") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) keep[k] = true;
  });

  const out: (DiffLine | { type: "gap"; count: number })[] = [];
  let gap = 0;
  lines.forEach((line, idx) => {
    if (keep[idx]) {
      if (gap > 0) {
        out.push({ type: "gap", count: gap });
        gap = 0;
      }
      out.push(line);
    } else {
      gap++;
    }
  });
  if (gap > 0) out.push({ type: "gap", count: gap });
  return out;
}
