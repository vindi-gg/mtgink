"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DeckView from "@/components/DeckView";
import type { DeckDetail } from "@/lib/types";

interface DeckResponse extends DeckDetail {
  is_owner: boolean;
}

export default function DeckDetailPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const router = useRouter();
  const [deck, setDeck] = useState<DeckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [syncModal, setSyncModal] = useState(false);
  const [syncState, setSyncState] = useState<"confirm" | "queued" | "processing" | "done" | "error">("confirm");
  const [syncPosition, setSyncPosition] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  function loadDeck() {
    fetch(`/api/deck/${deckId}`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error("Deck not found");
          throw new Error("Failed to load deck");
        }
        return res.json();
      })
      .then((data) => {
        setDeck(data);
        setEditName(data.name);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadDeck();
  }, [deckId]);

  // Refetch when returning from remix or other pages
  useEffect(() => {
    function onFocus() { loadDeck(); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [deckId]);

  async function handleRename() {
    if (!editName.trim() || !deck) return;
    const res = await fetch(`/api/deck/${deckId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
    if (res.ok) {
      setDeck({ ...deck, name: editName });
      setEditing(false);
    }
  }

  function openSyncModal() {
    setSyncModal(true);
    setSyncState("confirm");
    setSyncPosition(null);
    setSyncError(null);
  }

  function closeSyncModal() {
    // Only allow closing if not actively syncing
    if (syncState === "queued" || syncState === "processing") return;
    setSyncModal(false);
  }

  async function handleSync() {
    setSyncState("queued");
    setSyncPosition(1);
    setSyncError(null);
    try {
      const res = await fetch(`/api/deck/${deckId}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error || "Sync failed");
        setSyncState("error");
        return;
      }

      // Poll for completion
      setSyncPosition(data.position ?? 1);
      const queueId = data.queueId;
      let delay = 500;
      while (true) {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay + 300, 1500);

        const statusRes = await fetch(`/api/deck/import/status?id=${queueId}`);
        const statusData = await statusRes.json();

        if (statusData.status === "done") {
          setSyncState("done");
          // Reload deck data after short delay so user sees success
          setTimeout(() => {
            setSyncModal(false);
            setLoading(true);
            loadDeck();
          }, 1000);
          return;
        }

        if (statusData.status === "error") {
          setSyncError(statusData.error || "Sync failed");
          setSyncState("error");
          return;
        }

        // Update position while pending
        setSyncPosition(statusData.position ?? null);
        if (statusData.status === "processing") {
          setSyncState("processing");
        }
      }
    } catch {
      setSyncError("Failed to sync. Try again.");
      setSyncState("error");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this deck? This cannot be undone.")) return;
    const res = await fetch(`/api/deck/${deckId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/deck");
    }
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-gray-500 text-sm">Loading deck...</p>
      </main>
    );
  }

  if (error || !deck) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-red-400 mb-4">{error || "Deck not found"}</p>
        <Link
          href="/deck"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Back to decks
        </Link>
      </main>
    );
  }

  const hasPurchases = deck.cards.some((c) => c.to_buy);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-gray-900 border border-gray-700 rounded px-3 py-1 text-lg font-bold text-white focus:outline-none focus:border-amber-500"
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
              />
              <button
                onClick={handleRename}
                className="text-sm text-amber-400 hover:text-amber-300"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="text-sm text-gray-500 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="text-2xl font-bold text-white">{deck.name}</h1>
          )}
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            {deck.format && (
              <span className="bg-gray-800 px-1.5 py-0.5 rounded">
                {deck.format}
              </span>
            )}
            {!deck.is_public && <span>Private</span>}
            {deck.source_url && (
              <a
                href={deck.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-amber-400 transition-colors"
              >
                Source
              </a>
            )}
          </div>
        </div>

        {deck.is_owner && (
          <div className="flex items-center gap-2">
            {deck.source_url?.includes("moxfield.com") && (
              <button
                onClick={openSyncModal}
                className="text-xs text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
              >
                Sync from Moxfield
              </button>
            )}
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              Rename
            </button>
            <button
              onClick={handleDelete}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Curate button */}
      {deck.cards.some((c) => c.illustrations.length >= 2) && (
        <Link
          href={`/deck/${deckId}/remix`}
          className="block mb-6 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg hover:border-amber-500/50 transition-colors text-center"
        >
          <span className="text-amber-400 font-bold text-sm">Deck Remix</span>
          <span className="text-gray-500 text-xs block mt-0.5">
            Remix the art in your deck
          </span>
        </Link>
      )}

      <DeckView
        data={deck}
        deckId={deckId}
        isOwner={deck.is_owner}
        hasPurchases={hasPurchases}
      />

      {/* Sync from Moxfield modal */}
      {syncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={closeSyncModal}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            {syncState === "confirm" && (
              <>
                <h3 className="text-lg font-bold text-white mb-2">Sync from Moxfield</h3>
                <p className="text-sm text-gray-400 mb-1">
                  This will update your card list from Moxfield.
                </p>
                <p className="text-sm text-gray-400 mb-5">
                  Your art selections and buy list will be preserved.
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={closeSyncModal}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSync}
                    className="px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors cursor-pointer"
                  >
                    Sync Now
                  </button>
                </div>
              </>
            )}

            {(syncState === "queued" || syncState === "processing") && (
              <div className="text-center py-4">
                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-sm text-white font-medium">
                  {syncState === "processing"
                    ? "Syncing your deck..."
                    : syncPosition && syncPosition > 1
                      ? `#${syncPosition} in queue — importing shortly...`
                      : "Fetching from Moxfield..."}
                </p>
                <p className="text-xs text-gray-500 mt-1">This usually takes a few seconds</p>
              </div>
            )}

            {syncState === "done" && (
              <div className="text-center py-4">
                <div className="text-3xl mb-3">&#10003;</div>
                <p className="text-sm text-white font-medium">Deck synced successfully!</p>
              </div>
            )}

            {syncState === "error" && (
              <>
                <h3 className="text-lg font-bold text-white mb-2">Sync Failed</h3>
                <p className="text-sm text-red-400 mb-5">{syncError}</p>
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={closeSyncModal}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    onClick={handleSync}
                    className="px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition-colors cursor-pointer"
                  >
                    Try Again
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
