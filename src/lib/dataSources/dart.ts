/**
 * DART(금융감독원 전자공시시스템) Open API 클라이언트 (DESIGN.md §5).
 * https://opendart.fss.or.kr/ 에서 발급받은 API 키(DART_API_KEY)가 필요하다.
 *
 * DART는 종목코드(6자리)가 아니라 자체 corp_code(8자리)로 공시를 조회하므로,
 * corpCode.xml 전체 매핑을 내려받아 캐싱한 뒤 종목코드 -> corp_code로 변환한다.
 */
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

const DART_BASE = "https://opendart.fss.or.kr/api";

function getApiKey(): string {
  const key = process.env.DART_API_KEY;
  if (!key) throw new Error("DART_API_KEY 환경변수가 설정되지 않았습니다.");
  return key;
}

let corpCodeCache: { map: Map<string, string>; fetchedAt: number } | null = null;
const CORP_CODE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

async function loadCorpCodeMap(): Promise<Map<string, string>> {
  if (corpCodeCache && Date.now() - corpCodeCache.fetchedAt < CORP_CODE_TTL_MS) {
    return corpCodeCache.map;
  }
  const res = await fetch(`${DART_BASE}/corpCode.xml?crtfc_key=${getApiKey()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`DART corpCode.xml 다운로드 실패 (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const entry = zip.getEntries()[0];
  const xml = entry.getData().toString("utf-8");
  // parseTagValue: false — 기본값(true)이면 "005930"처럼 앞자리 0이 있는 코드가
  // 숫자로 강제 변환되면서 자릿수가 깨진다(예: corp_code "00664048" -> 664048).
  // corp_code/stock_code는 계산용 숫자가 아니라 고정 자릿수 문자열 ID라 반드시 문자열로 유지해야 한다.
  const parsed = new XMLParser({ parseTagValue: false }).parse(xml) as {
    result: { list: { corp_code: string; corp_name: string; stock_code: string }[] };
  };
  const map = new Map<string, string>();
  for (const item of parsed.result.list) {
    const stockCode = String(item.stock_code ?? "").trim();
    if (stockCode) map.set(stockCode, String(item.corp_code).trim());
  }
  corpCodeCache = { map, fetchedAt: Date.now() };
  return map;
}

export async function getCorpCode(stockCode: string): Promise<string | null> {
  const map = await loadCorpCodeMap();
  return map.get(stockCode) ?? null;
}

export interface DartDisclosure {
  rcept_no: string;
  corp_name: string;
  report_nm: string;
  rcept_dt: string; // YYYYMMDD
  flr_nm: string;
}

/** 최근 N일 이내 공시 목록. corp_code 매핑이 없는 종목(코넥스 등)은 빈 배열을 반환한다. */
export async function getRecentDisclosures(
  stockCode: string,
  days = 3
): Promise<DartDisclosure[]> {
  const corpCode = await getCorpCode(stockCode);
  if (!corpCode) return [];

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

  const params = new URLSearchParams({
    crtfc_key: getApiKey(),
    corp_code: corpCode,
    bgn_de: fmt(start),
    end_de: fmt(end),
    page_no: "1",
    page_count: "30",
  });
  const res = await fetch(`${DART_BASE}/list.json?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`DART 공시 조회 실패 (${res.status}): ${stockCode}`);
  const data = (await res.json()) as { status: string; list?: DartDisclosure[] };
  if (data.status !== "000") return []; // "013" = 조회된 데이터 없음 등
  return data.list ?? [];
}

export function disclosureUrl(rceptNo: string): string {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`;
}
