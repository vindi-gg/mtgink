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
          providers={user.app_metadata.providers ?? []}
          createdAt={user.created_at}
          displayName={user.user_metadata?.display_name ?? ""}
          hasPasswordFlag={!!user.user_metadata?.has_password}
          identities={(user.identities ?? []).map((i) => ({ id: i.id, identity_id: i.identity_id, provider: i.provider, email: (i.identity_data as Record<string, string>)?.email, name: (i.identity_data as Record<string, string>)?.full_name }))}
          customAvatar={user.user_metadata?.custom_avatar ?? null}
          avatarUrl={user.user_metadata?.avatar_url ?? null}
        />
      </div>
    </main>
  );
}
