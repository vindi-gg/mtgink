import { getComparisonPair } from "@/lib/queries";
import ComparisonView from "@/components/ComparisonView";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ oracle_id?: string }>;
}) {
  const { oracle_id } = await searchParams;
  const pair = getComparisonPair(oracle_id);

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <ComparisonView initialPair={pair} />
    </main>
  );
}
