"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export function useFavorites(illustrationIds: string[]) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const idsKey = illustrationIds.sort().join(",");
  const prevIdsKey = useRef(idsKey);

  useEffect(() => {
    if (!idsKey) return;
    // Reset on new IDs to avoid stale state
    if (prevIdsKey.current !== idsKey) {
      setFavorites(new Set());
      prevIdsKey.current = idsKey;
    }

    fetch(`/api/favorites?illustration_ids=${idsKey}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (data?.favorited) {
          setFavorites(new Set(data.favorited));
        }
      })
      .catch(() => {
        // Not authenticated or network error — no-op
      });
  }, [idsKey]);

  const toggle = useCallback(
    async (illustrationId: string, oracleId: string) => {
      const wasFavorited = favorites.has(illustrationId);

      // Optimistic update
      setFavorites((prev) => {
        const next = new Set(prev);
        if (wasFavorited) {
          next.delete(illustrationId);
        } else {
          next.add(illustrationId);
        }
        return next;
      });

      try {
        const res = wasFavorited
          ? await fetch(`/api/favorites/${illustrationId}`, { method: "DELETE" })
          : await fetch(`/api/favorites/${illustrationId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ oracle_id: oracleId }),
            });

        if (res.status === 401) {
          // Revert and signal auth needed
          setFavorites((prev) => {
            const next = new Set(prev);
            if (wasFavorited) next.add(illustrationId);
            else next.delete(illustrationId);
            return next;
          });
          return "auth_required";
        }

        if (!res.ok) {
          // Revert on failure
          setFavorites((prev) => {
            const next = new Set(prev);
            if (wasFavorited) next.add(illustrationId);
            else next.delete(illustrationId);
            return next;
          });
        }
      } catch {
        // Revert on network error
        setFavorites((prev) => {
          const next = new Set(prev);
          if (wasFavorited) next.add(illustrationId);
          else next.delete(illustrationId);
          return next;
        });
      }

      return null;
    },
    [favorites]
  );

  return { favorites, toggle };
}
