/**
 * 종목별 뉴스 조회 (DESIGN.md §5, §4 재료 판단용 원문 입력).
 *
 * 세 번의 시행착오를 거쳤다:
 * 1. 이데일리 자체 검색 페이지(edaily.co.kr/search/news)를 종목명으로 키워드
 *    검색 — 관련성 낮은 결과가 섞이고 최신 관련 기사를 놓치는 경우가 많았다.
 * 2. 네이버 종목뉴스 중 이데일리만 필터 — 이데일리 단독으로는 커버리지가
 *    부족했다(당일 상한가 관련 기사를 다른 언론사만 다룬 경우 등).
 * 3. 네이버 종목뉴스 전체 언론사 사용, 클러스터(같은 사건 중복보도)당 대표
 *    기사 1건만 취함 — 그런데 이 API 자체가 약 13개 주요 파트너 언론사만
 *    태깅하고 있어(서울신문, 뉴스1, 이데일리, 한국경제 등), 핀포인트뉴스처럼
 *    그 밖의 언론사 기사는 실제로 존재해도 전혀 안 잡히는 문제가 있었다.
 *
 * 그래서 네이버 종목뉴스(파트너 언론사, 정확도 높음)에 더해, 네이버 뉴스
 * 통합검색(모든 언론사 커버, 정확도는 상대적으로 낮음)을 보조로 사용한다.
 * 통합검색 결과는 제목에 종목명이 직접 들어간 것만 후보로 삼아 정확도를 지킨다.
 * (종목코드까지 본문에 언급됐는지 추가로 확인하는 것도 시도했으나, 한국 뉴스
 * 기사는 종목코드 없이 회사명만 쓰는 경우가 대부분이라 오히려 진짜 관련
 * 기사까지 걸러져서 제외했다.)
 */
import * as cheerio from "cheerio";

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

const STOCK_API_HEADERS = { ...COMMON_HEADERS, Referer: "https://stock.naver.com/" };

export interface StockNewsArticle {
  title: string;
  body: string;
  url: string;
  publishedAt: string; // YYYY.MM.DD
  source: string; // 언론사명
}

// ── 1) 네이버 종목뉴스(파트너 언론사, itemCode 태깅) ──────────────────────

interface NaverStockNewsItem {
  officeId: string;
  articleId: string;
  officeName: string;
  datetime: string; // YYYYMMDDHHmm
  title: string;
  body: string;
}

function parseDatetime(datetime: string): Date | null {
  const m = datetime.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
}

function stripHtmlTags(text: string): string {
  return cheerio.load(text).text();
}

/** 네이버 종목뉴스는 전체 시장 마감시황·거래상위 종목 요약처럼 특정 종목과
 * 무관한 일반 기사도 그 종목에 태깅해서 섞어 보낸다(예: "[마감시황]코스닥 1.21%
 * 오른 844.48 마감..."). 이런 기사가 재료 판단 입력에 섞이면 모델이 정작
 * 중요한 공시/뉴스를 무시하는 현상이 실제로 확인되어, 제목에 종목명이 직접
 * 등장하는 기사만 남긴다. */
function titleMentionsStock(title: string, stockName: string): boolean {
  return title.includes(stockName);
}

async function searchTaggedNews(
  stockCode: string,
  stockName: string,
  cutoff: Date,
  maxResults: number
): Promise<StockNewsArticle[]> {
  const url = `https://stock.naver.com/api/domestic/detail/news?itemCode=${stockCode}&page=1&pageSize=30`;
  const res = await fetch(url, { headers: STOCK_API_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`네이버 종목뉴스 조회 실패 (${res.status}): ${stockCode}`);
  const data = (await res.json()) as { clusters?: { items: NaverStockNewsItem[] }[] };

  const articles: StockNewsArticle[] = [];
  for (const cluster of data.clusters ?? []) {
    if (articles.length >= maxResults) break;
    const item = cluster.items[0]; // 클러스터 대표 기사 1건
    if (!item) continue;
    if (!titleMentionsStock(item.title, stockName)) continue;
    const publishedAt = parseDatetime(item.datetime);
    if (!publishedAt || publishedAt < cutoff) continue;
    articles.push({
      title: stripHtmlTags(item.title),
      body: stripHtmlTags(item.body),
      url: `https://n.news.naver.com/article/${item.officeId}/${item.articleId}`,
      publishedAt: item.datetime.replace(/^(\d{4})(\d{2})(\d{2}).*$/, "$1.$2.$3"),
      source: item.officeName,
    });
  }
  return articles;
}

// ── 2) 네이버 뉴스 통합검색(전체 언론사) 보조 검색 ─────────────────────────

interface GeneralSearchCandidate {
  title: string;
  url: string;
  source: string;
  relativeTime: string;
  snippet: string;
}

/** "16분 전"/"2시간 전"/"1일 전"/"1주 전" 등을 "지금으로부터 며칠 전"으로 근사한다. */
function relativeTimeToDaysAgo(text: string): number | null {
  const m = text.match(/^(\d+)(분|시간|일|주|개월|년)\s*전$/);
  if (!m) return null; // 절대 날짜 형식 등은 오래된 것으로 간주해 제외
  const n = Number(m[1]);
  switch (m[2]) {
    case "분":
    case "시간":
      return 0;
    case "일":
      return n;
    case "주":
      return n * 7;
    case "개월":
      return n * 30;
    case "년":
      return n * 365;
    default:
      return null;
  }
}

/** 네이버 통합검색 결과는 정규식으로 직접 파싱하기 때문에(HTML 파서를 거치지
 * 않음) 제목/본문에 섞인 &quot; 같은 HTML 엔티티가 디코딩되지 않은 채로 남는다. */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseGeneralSearchHtml(html: string): GeneralSearchCandidate[] {
  const blocks = html.split('{"props":{"clickLog"').slice(1);
  const results: GeneralSearchCandidate[] = [];
  for (const block of blocks) {
    const titleMatch = block.match(/"title":"([^"]*)","titleHref":"([^"]*)","type":"searchBasic"/);
    if (!titleMatch) continue;
    const sourceMatch = block.match(/"sourceProfile":\{[\s\S]{0,2000}?"title":"([^"]*)","titleHref"/);
    const timeMatch = block.match(/"subTexts":\[\{"text":"([^"]*)"/);
    const contentMatch = block.match(/"content":"([^"]*)"/);
    results.push({
      title: decodeHtmlEntities(titleMatch[1].replace(/<\/?mark>/g, "")),
      url: titleMatch[2],
      source: decodeHtmlEntities(sourceMatch?.[1] ?? ""),
      relativeTime: timeMatch?.[1] ?? "",
      snippet: decodeHtmlEntities((contentMatch?.[1] ?? "").replace(/<\/?mark>/g, "")),
    });
  }
  return results;
}

/** 후보 기사 원문 페이지를 열어 본문 전체 텍스트를 가져온다(검색 결과 스니펫은
 * 1~2문장으로 짧아 판단 근거로 부족하다). 원래는 종목코드가 본문에 실제로
 * 언급되는지까지 확인해 정확도를 더 높이려 했으나, 실제로 확인해보니 한국
 * 뉴스 기사는 종목코드 없이 회사명만 쓰는 경우가 대부분이라(예: "HT로보틱스"를
 * 7번 언급한 기사에도 "396300"은 단 한 번도 안 나옴) 그 조건을 걸면 진짜
 * 관련 기사까지 걸러져 버렸다. 그래서 코드 언급 여부는 요구하지 않고, 본문
 * 확보에만 쓴다. */
async function fetchArticleBody(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: COMMON_HEADERS, cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
    return cheerio.load(html)("body").text().replace(/\s+/g, " ").trim();
  } catch {
    return null;
  }
}

async function searchGeneralNews(
  stockName: string,
  cutoff: Date,
  maxResults: number
): Promise<StockNewsArticle[]> {
  const url = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(stockName)}&sort=1`;
  const res = await fetch(url, { headers: COMMON_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`네이버 뉴스 통합검색 실패 (${res.status}): ${stockName}`);
  const html = await res.text();

  const now = Date.now();
  const withinWindow = parseGeneralSearchHtml(html).filter((c) => {
    if (!titleMentionsStock(c.title, stockName)) return false;
    const daysAgo = relativeTimeToDaysAgo(c.relativeTime);
    if (daysAgo == null) return false;
    return now - daysAgo * 24 * 60 * 60 * 1000 >= cutoff.getTime();
  });

  const articles: StockNewsArticle[] = [];
  for (const c of withinWindow) {
    if (articles.length >= maxResults) break;
    const fullBody = await fetchArticleBody(c.url);
    const daysAgo = relativeTimeToDaysAgo(c.relativeTime) ?? 0;
    const approxDate = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    articles.push({
      title: c.title,
      body: (fullBody || c.snippet).slice(0, 2000),
      url: c.url,
      publishedAt: approxDate.toISOString().slice(0, 10).replace(/-/g, "."),
      source: c.source || "확인 필요",
    });
  }
  return articles;
}

// ── 통합 ──────────────────────────────────────────────────────────────

export async function searchRecentNews(
  stockCode: string,
  stockName: string,
  lookbackDays = 3,
  maxResults = 10
): Promise<StockNewsArticle[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const [tagged, general] = await Promise.all([
    searchTaggedNews(stockCode, stockName, cutoff, maxResults).catch(() => []),
    searchGeneralNews(stockName, cutoff, maxResults).catch(() => []),
  ]);

  const seen = new Set<string>();
  const merged: StockNewsArticle[] = [];
  for (const article of [...tagged, ...general]) {
    if (seen.has(article.url)) continue;
    seen.add(article.url);
    merged.push(article);
    if (merged.length >= maxResults) break;
  }
  return merged;
}
