/**
 * Notion 데이터베이스에 당일 브리핑을 종목당 한 행으로 기록한다 (DESIGN.md §14).
 *
 * 같은 거래일에 다시 실행하면 그날 행을 먼저 휴지통으로 옮기고 다시 쓴다. Cron
 * 재시도나 수동 재실행에서 행이 중복되지 않게 하기 위한 것이다.
 *
 * Notion은 동작을 `Notion-Version` 헤더에 고정한다. 2025-09-03부터 데이터베이스가
 * 하나 이상의 "데이터 소스"로 나뉘고 행 조회·생성이 그쪽으로 옮겨갔는데, 공식
 * 문서의 레퍼런스 페이지와 업그레이드 가이드가 서로 다르게 안내하고 있어
 * (2026-10-04 확인) 어느 쪽인지 가정하지 않고 런타임에 판별한다.
 */
import type { BriefingStock, DailyBriefing } from "@/lib/dailyBriefing";

const API_ROOT = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";

/** 무료·Plus 워크스페이스는 초당 평균 3요청까지 허용된다. */
const MIN_INTERVAL_MS = 400;
const MAX_RETRIES = 4;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

/** Notion 데이터베이스의 속성 이름. Notion 쪽 이름을 바꾸면 여기도 같이 바꿔야 한다. */
const PROP = {
  name: "종목명",
  code: "코드",
  market: "시장",
  date: "날짜",
  price: "종가",
  changeRate: "등락률",
  volume: "거래량",
  tradingValue: "거래대금",
  kind: "구분",
  news: "뉴스",
  dart: "공시",
  quote: "시세",
} as const;

export class NotionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(`Notion ${status} ${code}: ${message}`);
    this.name = "NotionError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class NotionClient {
  private lastCallAt = 0;

  constructor(private readonly token: string) {}

  private async waitTurn() {
    const elapsed = Date.now() - this.lastCallAt;
    if (elapsed < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - elapsed);
    this.lastCallAt = Date.now();
  }

  async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await this.waitTurn();
      const res = await fetch(API_ROOT + path, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });

      if (res.ok) return (await res.json()) as T;

      const payload = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!RETRY_STATUSES.has(res.status) || attempt === MAX_RETRIES - 1) {
        throw new NotionError(
          res.status,
          String(payload.code ?? "unknown"),
          String(payload.message ?? res.statusText)
        );
      }
      await sleep(retryDelayMs(res, attempt));
    }
    throw new Error("unreachable");
  }
}

/** 429면 Retry-After를 따르고, 그 밖의 일시 오류는 지수적으로 물러난다. */
function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get("Retry-After");
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 60_000);
  return 2 ** attempt * 1000;
}

interface Target {
  queryPath: string;
  parent: Record<string, string>;
}

/**
 * 행을 쓸 위치를 정한다. 설정한 ID가 데이터베이스 ID든 데이터 소스 ID든 받아들인다
 * — Notion UI와 검색 결과가 버전에 따라 둘 중 아무거나 내주기 때문이다.
 */
async function resolveTarget(client: NotionClient, targetId: string): Promise<Target> {
  const asDataSource = (id: string): Target => ({
    queryPath: `/data_sources/${id}/query`,
    parent: { type: "data_source_id", data_source_id: id },
  });

  try {
    const database = await client.request<{ data_sources?: { id: string }[] }>(
      "GET",
      `/databases/${targetId}`
    );
    const sources = database.data_sources ?? [];
    if (sources.length > 0) return asDataSource(sources[0].id);
    return {
      queryPath: `/databases/${targetId}/query`,
      parent: { type: "database_id", database_id: targetId },
    };
  } catch (err) {
    if (err instanceof NotionError && err.status === 404) return asDataSource(targetId);
    throw err;
  }
}

function propertiesFor(stock: BriefingStock, tradeDate: string) {
  return {
    [PROP.name]: { title: [{ text: { content: stock.name } }] },
    [PROP.code]: { rich_text: [{ text: { content: stock.code } }] },
    [PROP.market]: { select: { name: stock.market } },
    [PROP.date]: { date: { start: tradeDate } },
    [PROP.price]: { number: stock.price },
    [PROP.changeRate]: { number: stock.changeRate },
    [PROP.volume]: { number: stock.volume },
    [PROP.tradingValue]: { number: stock.tradingValue },
    [PROP.kind]: { multi_select: stock.tags.map((tag) => ({ name: tag })) },
    [PROP.news]: { url: stock.newsUrl },
    [PROP.dart]: { url: stock.dartUrl },
    [PROP.quote]: { url: stock.quoteUrl },
  };
}

/** 쿼리 결과를 끝까지 넘긴다. 구버전은 POST, 신버전은 PATCH를 받는다. */
async function queryAllRows(
  client: NotionClient,
  target: Target,
  body: Record<string, unknown>
): Promise<{ id: string }[]> {
  const results: { id: string }[] = [];
  let cursor: string | undefined;
  for (;;) {
    const payload = cursor ? { ...body, start_cursor: cursor } : body;
    let page: { results?: { id: string }[]; has_more?: boolean; next_cursor?: string };
    try {
      page = await client.request("POST", target.queryPath, payload);
    } catch (err) {
      if (!(err instanceof NotionError) || err.status !== 405) throw err;
      page = await client.request("PATCH", target.queryPath, payload);
    }
    results.push(...(page.results ?? []));
    if (!page.has_more) return results;
    cursor = page.next_cursor;
  }
}

async function trashRow(client: NotionClient, pageId: string): Promise<void> {
  try {
    await client.request("PATCH", `/pages/${pageId}`, { in_trash: true });
  } catch (err) {
    // 구버전은 in_trash 대신 archived를 받는다.
    if (!(err instanceof NotionError) || err.status !== 400) throw err;
    await client.request("PATCH", `/pages/${pageId}`, { archived: true });
  }
}

export interface NotionPushResult {
  written: number;
  replaced: number;
}

/**
 * 브리핑을 Notion에 기록한다. 환경변수가 없으면 조용히 건너뛴다 (이메일처럼
 * 설정이 안 된 환경에서 Cron 전체를 실패시키지 않기 위해).
 */
export async function pushBriefingToNotion(
  briefing: DailyBriefing
): Promise<NotionPushResult | null> {
  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;
  if (!token || !databaseId) {
    console.warn("NOTION_TOKEN/NOTION_DATABASE_ID 미설정으로 Notion 기록을 건너뜁니다.");
    return null;
  }

  const client = new NotionClient(token);
  const target = await resolveTarget(client, databaseId.replace(/-/g, ""));

  const existing = await queryAllRows(client, target, {
    filter: { property: PROP.date, date: { equals: briefing.tradeDate } },
  });
  for (const row of existing) await trashRow(client, row.id);

  for (const stock of briefing.stocks) {
    await client.request("POST", "/pages", {
      parent: target.parent,
      properties: propertiesFor(stock, briefing.tradeDate),
    });
  }

  return { written: briefing.stocks.length, replaced: existing.length };
}
