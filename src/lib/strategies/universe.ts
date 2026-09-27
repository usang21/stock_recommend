/**
 * 스크리닝 대상에서 제외할 종목 판정 (DESIGN.md §5).
 * 제외 대상: 관리종목, 거래정지 종목, SPAC, 신용거래 불가 종목, ETF, ETN.
 *
 * ETF/ETN은 네이버 데이터 소스에서 애초에 개별주식(type="ST") 랭킹 API로만
 * 후보를 가져오므로 대부분 자연히 제외되지만, 방어적으로 한 번 더 걸러낸다.
 * "신용거래 불가"를 직접 제공하는 공개 API를 찾지 못해 투자유의/경고/위험
 * 지정 종목을 대리 지표로 사용한다 (DESIGN.md §12 미결 항목, naver.ts 주석 참고).
 */
import {
  getInvestmentAlertStocks,
  getManagementStocks,
  getTradingHaltStocks,
  NaverStockRow,
} from "@/lib/dataSources/naver";

const SPAC_NAME_PATTERN = /스팩|기업인수목적/;

export interface Universe {
  excludedCodes: Set<string>;
}

export async function buildExcludedUniverse(): Promise<Universe> {
  const [management, tradingHalt, alerts] = await Promise.all([
    getManagementStocks(),
    getTradingHaltStocks(),
    getInvestmentAlertStocks(),
  ]);
  const excludedCodes = new Set<string>();
  for (const row of [...management, ...tradingHalt, ...alerts]) {
    excludedCodes.add(row.itemcode);
  }
  return { excludedCodes };
}

export function isExcluded(row: NaverStockRow, universe: Universe): boolean {
  if (universe.excludedCodes.has(row.itemcode)) return true;
  if (row.type && row.type !== "ST") return true; // ETF/ETN 등 방어적 제외
  if (SPAC_NAME_PATTERN.test(row.itemname)) return true;
  if (row.manageStatusGb !== "0") return true;
  if (row.tradeStopYn === "Y") return true;
  return false;
}

export function filterUniverse(rows: NaverStockRow[], universe: Universe): NaverStockRow[] {
  return rows.filter((r) => !isExcluded(r, universe));
}
