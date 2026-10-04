import { AppNav } from "@/components/AppNav";
import { BriefingRegenerateButton } from "@/components/BriefingRegenerateButton";
import {
  buildDailyBriefing,
  HIGH_VOLUME_TAG,
  LIMIT_UP_TAG,
  type BriefingStock,
  type DailyBriefing,
} from "@/lib/dailyBriefing";

// 장중/장후 수치를 그때그때 읽어야 하므로 정적 생성하지 않는다.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "오늘의 브리핑 | 데일리 트레이딩 스크리너",
};

function fmtNum(n: number): string {
  return n.toLocaleString();
}

/** 거래대금은 조/억 단위로 줄여 쓴다. 원 단위 그대로는 자릿수가 많아 읽기 어렵다. */
function fmtMoney(n: number): string {
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}조`;
  return `${Math.round(n / 100_000_000).toLocaleString()}억`;
}

/** 평소 대비 배수. 판정하지 못한 경우(일봉 부족)는 표시하지 않는다. */
function fmtRatio(n: number | null): string | null {
  if (n === null || !Number.isFinite(n)) return null;
  return `평소 ${n.toFixed(1)}배`;
}

function fmtRate(n: number): string {
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function rateColor(n: number): string {
  if (n > 0) return "text-red-600";
  if (n < 0) return "text-blue-600";
  return "text-neutral-500";
}

function LinkCell({ stock }: { stock: BriefingStock }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      <a href={stock.newsUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:no-underline">
        관련 뉴스
      </a>
      <a href={stock.dartUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:no-underline">
        DART 공시
      </a>
      <a href={stock.quoteUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:no-underline">
        시세
      </a>
    </div>
  );
}

function StockSection({
  title,
  stocks,
  emptyText,
  showVolume,
}: {
  title: string;
  stocks: BriefingStock[];
  emptyText: string;
  showVolume: boolean;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-base font-semibold">
        {title} <span className="font-normal text-neutral-500">({stocks.length}개)</span>
      </h2>
      {stocks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          {emptyText}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2 font-medium">종목</th>
                <th className="px-3 py-2 font-medium">종가</th>
                <th className="px-3 py-2 font-medium">등락률</th>
                {showVolume && <th className="px-3 py-2 font-medium">거래량</th>}
                {showVolume && <th className="px-3 py-2 font-medium">거래대금</th>}
                <th className="px-3 py-2 font-medium">확인 링크</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock) => (
                <tr key={stock.code} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="px-3 py-2">
                    <div className="font-medium">{stock.name}</div>
                    <div className="text-xs text-neutral-500">
                      {stock.market} · {stock.code}
                    </div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmtNum(stock.price)}원</td>
                  <td className={`px-3 py-2 font-semibold tabular-nums ${rateColor(stock.changeRate)}`}>
                    {fmtRate(stock.changeRate)}
                  </td>
                  {showVolume && (
                    <td className="px-3 py-2 tabular-nums">
                      {fmtNum(stock.volume)}주
                      {fmtRatio(stock.volumeRatio) && (
                        <div className="text-xs text-neutral-500">{fmtRatio(stock.volumeRatio)}</div>
                      )}
                    </td>
                  )}
                  {showVolume && (
                    <td className="px-3 py-2 tabular-nums">
                      {fmtMoney(stock.tradingValue)}
                      {fmtRatio(stock.tradingValueRatio) && (
                        <div className="text-xs text-neutral-500">
                          {fmtRatio(stock.tradingValueRatio)}
                        </div>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <LinkCell stock={stock} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NotionLink() {
  const url = process.env.NOTION_VIEW_URL;
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
    >
      Notion에서 보기 →
    </a>
  );
}

function Briefing({ briefing }: { briefing: DailyBriefing }) {
  // 이메일과 같은 구성으로 두 묶음을 나눠 보여준다. 두 조건에 모두 해당하는 종목은
  // 양쪽에 나타난다 — 어느 조건으로 걸렸는지가 섹션 자체로 드러나야 하기 때문이다.
  const limitUp = briefing.stocks.filter((s) => s.tags.includes(LIMIT_UP_TAG));
  const highVolume = briefing.stocks.filter((s) => s.tags.includes(HIGH_VOLUME_TAG));
  // 두 조건이 OR이므로 제목에 둘 다 적는다. 어느 쪽으로 들어왔는지는 표의
  // 거래량·거래대금 열을 보면 드러난다.
  const volumeLabel = `${fmtNum(briefing.volumeThreshold)}주`;
  const moneyLabel = fmtMoney(briefing.tradingValueThreshold);
  // 절대치와 급증배수를 함께 만족해야 하므로 제목에 둘 다 적는다.
  const surge = `직전 ${briefing.baselineTradingDays}거래일 평균의 ${briefing.surgeMultiplier}배 이상`;
  const conditionLabel = `거래량 ${volumeLabel} 또는 거래대금 ${moneyLabel} 이상 + ${surge}`;

  return (
    <>
      <p className="mb-6 text-sm text-neutral-500">
        {briefing.tradeDate} 기준 · 시세 목록: 네이버 금융 · 관리종목·거래정지·SPAC·투자경고·ETF/ETN 제외 · 시가총액 제한 없음 · 장중 수치는 지연되거나 변동될 수 있습니다.
      </p>
      <StockSection
        title="상한가 종목"
        stocks={limitUp}
        emptyText="오늘 KOSPI·KOSDAQ 상한가 종목이 없습니다."
        showVolume
      />
      <StockSection
        title={`대량거래 종목 — ${conditionLabel}`}
        stocks={highVolume}
        emptyText={`오늘 KOSPI·KOSDAQ ${conditionLabel} 종목이 없습니다.`}
        showVolume
      />
    </>
  );
}

export default async function BriefingPage() {
  let briefing: DailyBriefing | null = null;
  let error: string | null = null;
  try {
    briefing = await buildDailyBriefing();
  } catch (err) {
    // 네이버 비공식 API가 막히거나 응답 구조가 바뀌면 여기서 걸린다. 화면 전체를
    // 깨뜨리지 않고 무엇이 실패했는지 보여준다.
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">오늘의 브리핑</h1>
          <div className="flex items-center gap-2">
            <BriefingRegenerateButton />
            <NotionLink />
          </div>
        </div>
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <p className="mb-1 font-semibold">시세 데이터를 불러오지 못했습니다.</p>
            <p className="text-xs opacity-80">{error}</p>
          </div>
        ) : (
          briefing && <Briefing briefing={briefing} />
        )}
      </main>
    </div>
  );
}
