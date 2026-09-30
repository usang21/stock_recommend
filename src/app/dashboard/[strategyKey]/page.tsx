import { notFound } from "next/navigation";
import { StrategyTabs } from "@/components/StrategyTabs";
import { StrategyInfoBox } from "@/components/StrategyInfoBox";
import { ReportView } from "@/components/ReportView";
import { RegenerateButton } from "@/components/RegenerateButton";
import { FINAL_RECOMMENDATION_TAB, isStrategyKey } from "@/lib/strategyMeta";

export default async function DashboardStrategyPage({
  params,
}: {
  params: Promise<{ strategyKey: string }>;
}) {
  const { strategyKey } = await params;
  if (!isStrategyKey(strategyKey)) notFound();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">오늘의 매수 후보 리포트</h1>
        <RegenerateButton />
      </div>
      <StrategyTabs basePath="/dashboard" active={strategyKey} extraTabs={[FINAL_RECOMMENDATION_TAB]} />
      <StrategyInfoBox strategyKey={strategyKey} />
      <ReportView key={strategyKey} date="latest" activeTab={strategyKey} />
    </div>
  );
}
