import { AppNav } from "@/components/AppNav";
import { RecommendationLogicView } from "@/components/RecommendationLogicView";

export default function RecommendationLogicPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 text-xl font-semibold">추천 로직</h1>
        <p className="mb-6 text-sm text-neutral-500">
          최종 추천이 사용하는 판단 기준과 학습 기록입니다. 수정하면 새 버전으로 쌓이고, 이전 버전은 지워지지 않습니다.
        </p>
        <RecommendationLogicView />
      </main>
    </div>
  );
}
