import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AdminJobs from "./AdminJobs";

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
              <p className="text-xs text-gray-500">Manage daily bracket &amp; gauntlet themes</p>
            </div>
          </Link>
          <Link
            href="/inkadmin/og-test"
            className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
          >
            <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
            <div>
              <span className="text-sm font-bold text-white">OG Image Preview</span>
              <p className="text-xs text-gray-500">Test Open Graph images for card pages</p>
            </div>
          </Link>
          <Link
            href="/brew"
            className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
          >
            <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <div>
              <span className="text-sm font-bold text-white">Create Brew</span>
              <p className="text-xs text-gray-500">Create gauntlet or bracket brews</p>
            </div>
          </Link>
          <Link
            href="/inkadmin/brews"
            className="flex items-center gap-3 p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-amber-500/50 transition-colors"
          >
            <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
            <div>
              <span className="text-sm font-bold text-white">Admin Brews</span>
              <p className="text-xs text-gray-500">View and manage private daily brews</p>
            </div>
          </Link>
        </div>

        <AdminJobs />
      </div>
    </main>
  );
}
