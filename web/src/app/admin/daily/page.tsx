import type { Metadata } from "next";
import AdminDailyClient from "./AdminDailyClient";

export const metadata: Metadata = { title: "Daily Challenge Admin", robots: "noindex" };
export const dynamic = "force-dynamic";

export default async function AdminDailyPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysParam } = await searchParams;
  const days = Math.min(Math.max(parseInt(daysParam ?? "30", 10) || 30, 1), 60);

  return <AdminDailyClient days={days} />;
}
