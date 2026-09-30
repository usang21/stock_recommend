import Link from "next/link";
import { StrategyTabs } from "@/components/StrategyTabs";
import { FinalRecommendationView } from "@/components/FinalRecommendationView";
import { FinalRegenerateButton } from "@/components/FinalRegenerateButton";
import { FINAL_RECOMMENDATION_TAB } from "@/lib/strategyMeta";

export default function FinalRecommendationPage() {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">전략 종합 최종 추천</h1>
        <FinalRegenerateButton />
      </div>
      <StrategyTabs basePath="/dashboard" active="final" extraTabs={[FINAL_RECOMMENDATION_TAB]} />
      <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="mb-2 font-semibold">전략 1~4를 종합해 매수 우선순위 상위 5개를 추천합니다</p>
        <ol className="list-decimal space-y-1 pl-5 text-neutral-600 dark:text-neutral-400">
          <li>각 전략의 최종 단계를 통과한 종목만 후보로 삼습니다 (여러 전략 중복 통과 = 강한 신호)</li>
          <li>과거 추천의 상승/하락 결과에서 얻은 학습 기록을 판단에 반영합니다</li>
          <li>상위 5개는 순위와 근거를, 나머지 후보는 제외 사유를 함께 보여줍니다</li>
        </ol>
        <p className="mt-3 text-xs text-neutral-500">
          판단 기준과 학습 기록은{" "}
          <Link href="/recommendation-logic" className="underline underline-offset-2">
            추천 로직 화면
          </Link>
          에서 확인하고 수정할 수 있습니다.
        </p>
      </div>
      <FinalRecommendationView />
    </div>
  );
}
