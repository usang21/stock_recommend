"use client";

import { useEffect, useState } from "react";
import { collapseUnchanged, diffLines } from "@/lib/diff";

type LogicKind = "criteria" | "lesson";

interface LogicVersion {
  version: number;
  content: string;
  changedBy: string;
  changeReason: string;
  createdAt: string;
}

interface LogicData {
  kind: LogicKind;
  current: { version: number; content: string };
  versions: LogicVersion[];
}

const KIND_TABS: { key: LogicKind; label: string; description: string }[] = [
  {
    key: "criteria",
    label: "판단 기준",
    description:
      "사람이 정한 추천 기준입니다. 처음에는 skills/final-recommendation/SKILL.md에서 가져오며, 여기서 수정하면 다음 실행부터 반영됩니다.",
  },
  {
    key: "lesson",
    label: "학습 기록",
    description:
      "피드백 루프가 과거 추천의 상승/하락 사유를 분석해 누적한 관찰입니다. 잘못 학습된 내용은 여기서 직접 덜어낼 수 있습니다.",
  },
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function VersionDiff({ current, previous }: { current: LogicVersion; previous: LogicVersion | undefined }) {
  if (!previous) {
    return (
      <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-neutral-50 p-3 text-xs dark:bg-neutral-900">
        {current.content}
      </pre>
    );
  }
  const rows = collapseUnchanged(diffLines(previous.content, current.content));
  return (
    <div className="overflow-x-auto rounded bg-neutral-50 p-3 font-mono text-xs dark:bg-neutral-900">
      {rows.map((row, i) => {
        if (row.type === "gap") {
          return (
            <div key={i} className="py-1 text-center text-neutral-400">
              ··· 변경 없는 {row.count}줄 ···
            </div>
          );
        }
        const className =
          row.type === "add"
            ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
            : row.type === "remove"
              ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
              : "text-neutral-500";
        const prefix = row.type === "add" ? "+" : row.type === "remove" ? "-" : " ";
        return (
          <div key={i} className={`whitespace-pre-wrap ${className}`}>
            {prefix} {row.text || " "}
          </div>
        );
      })}
    </div>
  );
}

export function RecommendationLogicView() {
  const [kind, setKind] = useState<LogicKind>("criteria");
  const [loaded, setLoaded] = useState<LogicData | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [draft, setDraft] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/recommendation-logic/${kind}`)
      .then((res) => res.json())
      .then((json: LogicData) => {
        if (cancelled) return;
        setLoaded(json);
        setDraft(json.current.content);
        setChangeReason("");
        setExpandedVersion(null);
      })
      .catch(() => {
        if (!cancelled) setLoaded(null);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, reloadToken]);

  // 탭을 막 바꾼 직후에는 아직 이전 탭의 내용이 들려 있으므로, 종류가 일치할
  // 때만 내용을 보여준다 (그 사이에는 "불러오는 중"이 뜬다).
  const data = loaded?.kind === kind ? loaded : null;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/recommendation-logic/${kind}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft, changeReason }),
      });
      if (!res.ok) throw new Error();
      setReloadToken((v) => v + 1);
    } catch {
      alert("저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const activeTab = KIND_TABS.find((t) => t.key === kind)!;
  const dirty = data != null && draft !== data.current.content;

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
        {KIND_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setKind(tab.key)}
            className={`px-4 py-2 text-sm font-medium ${
              kind === tab.key
                ? "border-b-2 border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-100"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-neutral-500">{activeTab.description}</p>

      {data == null ? (
        <p className="py-12 text-center text-sm text-neutral-500">불러오는 중...</p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              현재 내용 <span className="text-neutral-400">v{data.current.version}</span>
            </h2>
            {dirty && <span className="text-xs text-amber-600">저장하지 않은 변경이 있습니다</span>}
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={20}
            className="w-full rounded-lg border border-neutral-300 bg-transparent p-3 font-mono text-xs dark:border-neutral-700"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              placeholder="변경 사유 (이력에 남습니다)"
              className="min-w-64 flex-1 rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
            />
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
            >
              {saving ? "저장 중..." : "새 버전으로 저장"}
            </button>
          </div>

          <h2 className="mb-2 mt-10 text-sm font-semibold">변경 이력 ({data.versions.length}개 버전)</h2>
          <ul className="space-y-2">
            {data.versions.map((version, idx) => (
              <li key={version.version} className="rounded-lg border border-neutral-200 dark:border-neutral-800">
                <button
                  onClick={() => setExpandedVersion((v) => (v === version.version ? null : version.version))}
                  className="flex w-full items-start gap-3 p-3 text-left"
                >
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    v{version.version}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{version.changeReason}</span>
                    <span className="mt-0.5 block text-xs text-neutral-400">
                      {formatDateTime(version.createdAt)} ·{" "}
                      {version.changedBy === "human" ? "사람이 직접 수정" : "시스템"}
                    </span>
                  </span>
                  <span className="text-xs text-neutral-400">{expandedVersion === version.version ? "접기" : "차이 보기"}</span>
                </button>
                {expandedVersion === version.version && (
                  <div className="px-3 pb-3">
                    <VersionDiff current={version} previous={data.versions[idx + 1]} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
