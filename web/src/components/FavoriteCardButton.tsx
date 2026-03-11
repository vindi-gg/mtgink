"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface FavoriteCardButtonProps {
  oracleId: string;
}

export default function FavoriteCardButton({ oracleId }: FavoriteCardButtonProps) {
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      setLoggedIn(true);

      fetch(`/api/card-favorites?oracle_ids=${oracleId}`)
        .then((r) => r.json())
        .then((data) => {
          setFavorited((data.favorited ?? []).includes(oracleId));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    });
  }, [oracleId]);

  async function toggle() {
    if (!loggedIn || loading) return;
    const method = favorited ? "DELETE" : "POST";
    setFavorited(!favorited);

    try {
      const res = await fetch("/api/card-favorites", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oracle_id: oracleId }),
      });
      if (!res.ok) setFavorited(favorited); // revert
    } catch {
      setFavorited(favorited); // revert
    }
  }

  if (!loggedIn && !loading) return null;

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
        favorited
          ? "border-amber-500 bg-amber-500/10 text-amber-400"
          : "border-gray-700 text-gray-400 hover:text-amber-400 hover:border-amber-500/50"
      } disabled:opacity-50`}
      title={favorited ? "Remove from saved cards" : "Save this card"}
    >
      {favorited ? "★ Saved" : "☆ Save Card"}
    </button>
  );
}
