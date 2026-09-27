import { redirect } from "next/navigation";

export default async function HistoryDateIndexPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  redirect(`/history/${date}/strategy1`);
}
