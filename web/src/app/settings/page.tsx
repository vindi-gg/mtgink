import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SettingsClient from "./SettingsClient";

export const metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/auth?returnTo=/settings");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?returnTo=/settings");

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8 px-4">
      <div className="max-w-lg mx-auto space-y-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <SettingsClient
          email={user.email ?? ""}
          provider={user.app_metadata.provider ?? "email"}
          createdAt={user.created_at}
          displayName={user.user_metadata?.display_name ?? ""}
        />
      </div>
    </main>
  );
}
