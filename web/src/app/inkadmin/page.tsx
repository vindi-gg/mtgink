import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function InkAdminPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.user_metadata?.is_admin) redirect("/");

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="grid gap-3">
          <Link
            href="/inkadmin/daily"
            className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
          >
            <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div>
              <span className="text-sm font-bold text-white">Daily Challenges</span>
              <p className="text-xs text-gray-500">Manage daily gauntlet themes</p>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
