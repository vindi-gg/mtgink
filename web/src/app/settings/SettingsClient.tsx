"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Props {
  email: string;
  provider: string;
  createdAt: string;
  displayName: string;
}

function providerLabel(provider: string) {
  if (provider === "google") return "Google";
  if (provider === "discord") return "Discord";
  return "Email";
}

export default function SettingsClient({ email, provider, createdAt, displayName: initialDisplayName }: Props) {
  const supabase = createClient();
  const router = useRouter();

  // Display name
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Password
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

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

  async function handleChangePassword() {
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
      setPasswordMessage({ type: "success", text: "Password updated" });
      setNewPassword("");
      setConfirmPassword("");
    }
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
            <span>{providerLabel(provider)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Member since</span>
            <span>{new Date(createdAt).toLocaleDateString()}</span>
          </div>
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

      {/* Change Password — email users only */}
      {provider === "email" && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-3">
          <h2 className="text-lg font-semibold">Change Password</h2>
          <div className="space-y-2">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className={inputClass}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className={inputClass}
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={passwordSaving || !newPassword}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {passwordSaving ? "Updating..." : "Update Password"}
          </button>
          {passwordMessage && (
            <p className={`text-sm ${passwordMessage.type === "error" ? "text-red-400" : "text-green-400"}`}>
              {passwordMessage.text}
            </p>
          )}
        </section>
      )}

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
