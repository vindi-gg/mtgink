import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminDailyClient from "./AdminDailyClient";

export const metadata: Metadata = { title: "Daily Challenge Admin", robots: "noindex" };
export const dynamic = "force-dynamic";

export default async function AdminDailyPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const supabase = await createClient();
  if (!supabase) redirect("/");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.user_metadata?.is_admin) redirect("/");

  const { days: daysParam } = await searchParams;
  const days = Math.min(Math.max(parseInt(daysParam ?? "30", 10) || 30, 1), 60);

  return <AdminDailyClient days={days} />;
}
