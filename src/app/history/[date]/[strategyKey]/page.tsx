import { notFound } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { StrategyTabs } from "@/components/StrategyTabs";
import { StrategyInfoBox } from "@/components/StrategyInfoBox";
import { ReportView } from "@/components/ReportView";
import { isStrategyKey } from "@/lib/strategyMeta";

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ date: string; strategyKey: string }>;
}) {
  const { date, strategyKey } = await params;
  if (!isStrategyKey(strategyKey)) notFound();

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <AppNav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-4 text-xl font-semibold">{date} 리포트</h1>
        <StrategyTabs basePath={`/history/${date}`} active={strategyKey} />
        <StrategyInfoBox strategyKey={strategyKey} />
        <ReportView key={`${date}-${strategyKey}`} date={date} activeTab={strategyKey} />
      </main>
    </div>
  );
}
