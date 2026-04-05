"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import UserAvatar from "@/components/UserAvatar";
import type { MtgSet } from "@/lib/types";

interface Identity {
  id: string;
  identity_id: string;
  provider: string;
  email?: string;
  name?: string;
}

interface Props {
  email: string;
  provider: string;
  providers: string[];
  createdAt: string;
  displayName: string;
  hasPasswordFlag: boolean;
  identities: Identity[];
  customAvatar: string | null;
  avatarUrl: string | null;
}

function providerLabel(provider: string) {
  if (provider === "google") return "Google";
  if (provider === "discord") return "Discord";
  return "Email";
}

const MANA_OPTIONS = [
  { value: "W", label: "White" },
  { value: "U", label: "Blue" },
  { value: "B", label: "Black" },
  { value: "R", label: "Red" },
  { value: "G", label: "Green" },
  { value: "C", label: "Colorless" },
];

export default function SettingsClient({ email, provider, providers, createdAt, displayName: initialDisplayName, hasPasswordFlag, identities: initialIdentities, customAvatar: initialCustomAvatar, avatarUrl }: Props) {
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    if (!supabase) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        router.push("/");
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase, router]);

  const hasEmailPassword = initialIdentities.some((i) => i.provider === "email") || hasPasswordFlag;
  const socialIdentities = initialIdentities.filter((i) => i.provider !== "email");
  const isOAuthUser = socialIdentities.length > 0 && !hasEmailPassword;

  // Avatar
  const [customAvatar, setCustomAvatar] = useState(initialCustomAvatar);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [setQuery, setSetQuery] = useState("");
  const [sets, setSets] = useState<MtgSet[] | null>(null);
  const [showSetResults, setShowSetResults] = useState(false);

  async function handleAvatarSelect(value: string | null) {
    if (!supabase) return;
    setAvatarSaving(true);
    const { error } = await supabase.auth.updateUser({ data: { custom_avatar: value } });
    setAvatarSaving(false);
    if (!error) {
      setCustomAvatar(value);
      router.refresh();
    }
  }

  const filteredSets = (() => {
    if (!sets || !setQuery.trim()) return [];
    const q = setQuery.toLowerCase();
    return sets.filter((s) => s.name.toLowerCase().includes(q) || s.set_code.toLowerCase().includes(q)).slice(0, 12);
  })();

  // Display name
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [hasPassword, setHasPassword] = useState(hasEmailPassword);

  // Unlink
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [unlinkMessage, setUnlinkMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleSaveDisplayName() {
    if (!supabase) return;
    setNameSaving(true);
    setNameMessage(null);
    const { error } = await supabase.auth.updateUser({ data: { display_name: displayName.trim().slice(0, 30) } });
    setNameSaving(false);
    if (error) {
      setNameMessage({ type: "error", text: error.message });
    } else {
      setNameMessage({ type: "success", text: "Display name updated" });
      router.refresh();
    }
  }

  async function handlePasswordAction() {
    if (!supabase) return;
    if (newPassword.length < 6) {
      setPasswordMessage({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "Passwords don't match" });
      return;
    }
    setPasswordSaving(true);
    setPasswordMessage(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) {
      setPasswordMessage({ type: "error", text: error.message });
    } else {
      if (!hasPassword) {
        // Create email identity in DB + mark in user metadata
        await Promise.all([
          fetch("/api/account/create-password", { method: "POST" }),
          supabase.auth.updateUser({ data: { has_password: true } }),
        ]);
      }
      setPasswordMessage({ type: "success", text: hasPassword ? "Password updated" : "Password created — you can now sign in with email" });
      setNewPassword("");
      setConfirmPassword("");
      setHasPassword(true);
    }
  }

  async function handleUnlink(identity: Identity) {
    if (!hasPassword) {
      setUnlinkMessage({ type: "error", text: "Create a password first before unlinking" });
      return;
    }
    setUnlinking(identity.provider);
    setUnlinkMessage(null);
    try {
      const res = await fetch("/api/account/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity_id: identity.identity_id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUnlinkMessage({ type: "error", text: data.error || "Failed to unlink" });
      } else {
        setUnlinkMessage({ type: "success", text: `${providerLabel(identity.provider)} unlinked` });
        router.refresh();
      }
    } catch {
      setUnlinkMessage({ type: "error", text: "Failed to unlink" });
    }
    setUnlinking(null);
  }

  async function handleLink(provider: "google" | "discord") {
    if (!supabase) return;
    await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?returnTo=/settings`,
        queryParams: { prompt: "consent" },
      },
    });
  }

  async function handleDeleteAccount() {
    if (!supabase) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || "Failed to delete account");
        setDeleting(false);
        return;
      }
      await supabase.auth.signOut();
      router.push("/");
      router.refresh();
    } catch {
      setDeleteError("Failed to delete account");
      setDeleting(false);
    }
  }

  const inputClass = "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500";

  return (
    <div className="space-y-8">
      {/* Account Info */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-3">
        <h2 className="text-lg font-semibold">Account</h2>
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Email</span>
            <span>{email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Sign-in method</span>
            <span>{initialIdentities.map((i) => providerLabel(i.provider)).join(", ")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Member since</span>
            <span>{new Date(createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </section>

      {/* Avatar */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center gap-4">
          <UserAvatar customAvatar={customAvatar} avatarUrl={avatarUrl} displayName={initialDisplayName} size="lg" />
          <div>
            <h2 className="text-lg font-semibold">Avatar</h2>
            {customAvatar && (
              <button
                onClick={() => handleAvatarSelect(null)}
                className="text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
              >
                Reset to default
              </button>
            )}
          </div>
          {avatarSaving && <span className="text-xs text-gray-500 ml-auto">Saving...</span>}
        </div>

        {/* Mana symbols */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block">Mana</label>
          <div className="flex gap-2">
            {MANA_OPTIONS.map((m) => (
              <button
                key={m.value}
                onClick={() => handleAvatarSelect(`mana:${m.value}`)}
                title={m.label}
                className={`w-10 h-10 rounded-full overflow-hidden transition-all cursor-pointer ${
                  customAvatar === `mana:${m.value}` ? "ring-2 ring-amber-400 scale-110" : "opacity-60 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://svgs.scryfall.io/card-symbols/${m.value}.svg`} alt={m.label} className="w-full h-full" />
              </button>
            ))}
          </div>
        </div>

        {/* Set symbols */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block">Expansion</label>
          <input
            type="text"
            value={setQuery}
            onChange={(e) => {
              setSetQuery(e.target.value);
              setShowSetResults(true);
              if (!sets) {
                fetch("/api/sets").then((r) => r.json()).then((d) => setSets(d.sets ?? d)).catch(() => {});
              }
            }}
            onFocus={() => {
              if (filteredSets.length > 0) setShowSetResults(true);
              if (!sets) {
                fetch("/api/sets").then((r) => r.json()).then((d) => setSets(d.sets ?? d)).catch(() => {});
              }
            }}
            placeholder="Search expansions..."
            className={inputClass}
          />
          {showSetResults && filteredSets.length > 0 && (
            <div className="mt-2 grid grid-cols-4 gap-2">
              {filteredSets.map((s) => (
                <button
                  key={s.set_code}
                  onClick={() => {
                    handleAvatarSelect(`set:${s.set_code}`);
                    setShowSetResults(false);
                    setSetQuery("");
                  }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all cursor-pointer ${
                    customAvatar === `set:${s.set_code}` ? "bg-amber-500/20 ring-1 ring-amber-500/50" : "bg-gray-800 hover:bg-gray-700"
                  }`}
                >
                  {s.icon_svg_uri && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.icon_svg_uri} alt="" className="h-6 w-6 invert opacity-70" />
                  )}
                  <span className="text-[10px] text-gray-400 truncate w-full text-center">{s.set_code.toUpperCase()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Display Name */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-3">
        <h2 className="text-lg font-semibold">Display Name</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={30}
            placeholder="Enter a display name"
            className={inputClass}
          />
          <button
            onClick={handleSaveDisplayName}
            disabled={nameSaving || displayName.trim() === initialDisplayName}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {nameSaving ? "Saving..." : "Save"}
          </button>
        </div>
        {nameMessage && (
          <p className={`text-sm ${nameMessage.type === "error" ? "text-red-400" : "text-green-400"}`}>
            {nameMessage.text}
          </p>
        )}
      </section>

      {/* Password */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-3">
        <h2 className="text-lg font-semibold">
          {isOAuthUser && !hasPassword ? "Create Password" : "Change Password"}
        </h2>
        {isOAuthUser && !hasPassword && (
          <p className="text-sm text-gray-400">
            Add a password so you can also sign in with your email.
          </p>
        )}
        <div className="space-y-2">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={hasPassword ? "New password" : "Create a password"}
            className={inputClass}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            className={inputClass}
          />
        </div>
        <button
          onClick={handlePasswordAction}
          disabled={passwordSaving || !newPassword}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {passwordSaving ? "Saving..." : hasPassword ? "Update Password" : "Create Password"}
        </button>
        {passwordMessage && (
          <p className={`text-sm ${passwordMessage.type === "error" ? "text-red-400" : "text-green-400"}`}>
            {passwordMessage.text}
          </p>
        )}
      </section>

      {/* Linked Accounts */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-3">
        <h2 className="text-lg font-semibold">Linked Accounts</h2>
        <div className="space-y-2">
          {socialIdentities.map((identity) => (
            <div key={identity.id} className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm text-white">{providerLabel(identity.provider)}</span>
                <p className="text-xs text-gray-500">{identity.name || identity.email}</p>
              </div>
              <button
                onClick={() => handleUnlink(identity)}
                disabled={unlinking === identity.provider || (!hasPassword && socialIdentities.length <= 1)}
                className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {unlinking === identity.provider ? "Unlinking..." : "Unlink"}
              </button>
            </div>
          ))}
          {(["google", "discord"] as const).filter((p) => !socialIdentities.some((i) => i.provider === p)).map((p) => (
            <div key={p} className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-500">{providerLabel(p)}</span>
              <button
                onClick={() => handleLink(p)}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
              >
                Link
              </button>
            </div>
          ))}
        </div>
        {!hasPassword && socialIdentities.length > 0 && (
          <p className="text-xs text-gray-500">Create a password before unlinking your social account.</p>
        )}
        {unlinkMessage && (
          <p className={`text-sm ${unlinkMessage.type === "error" ? "text-red-400" : "text-green-400"}`}>
            {unlinkMessage.text}
          </p>
        )}
      </section>

      {/* Delete Account */}
      <section className="bg-gray-900 border border-red-900/50 rounded-lg p-5 space-y-3">
        <h2 className="text-lg font-semibold text-red-400">Delete Account</h2>
        <div className="text-sm text-gray-400 space-y-1">
          <p>This action is permanent and cannot be undone.</p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-500">
            <li>Your favorites and decks will be <span className="text-red-400">deleted</span></li>
            <li>Your votes and brews will be <span className="text-gray-300">anonymized</span></li>
          </ul>
        </div>
        <div className="space-y-2">
          <label className="block text-sm text-gray-400">
            Type <span className="font-mono text-white">DELETE</span> to confirm
          </label>
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="DELETE"
            className={inputClass}
          />
        </div>
        <button
          onClick={handleDeleteAccount}
          disabled={deleteConfirm !== "DELETE" || deleting}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {deleting ? "Deleting..." : "Delete My Account"}
        </button>
        {deleteError && (
          <p className="text-sm text-red-400">{deleteError}</p>
        )}
      </section>
    </div>
  );
}
