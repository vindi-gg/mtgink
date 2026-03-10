"use client";

import { useState, useCallback } from "react";
import { artCropUrl } from "@/lib/image-utils";
import type { Illustration, ArtRating } from "@/lib/types";

type IllustrationWithRating = Illustration & { rating: ArtRating | null };

interface MiniCompareProps {
  oracleId: string;
  illustrations: IllustrationWithRating[];
  sessionId: string;
}

export default function MiniCompare({
  oracleId,
  illustrations,
  sessionId,
}: MiniCompareProps) {
  const [pairIndex, setPairIndex] = useState(0);
  const [voting, setVoting] = useState(false);
  const [done, setDone] = useState(false);

  // Generate all unique pairs
  const pairs: [IllustrationWithRating, IllustrationWithRating][] = [];
  for (let i = 0; i < illustrations.length; i++) {
    for (let j = i + 1; j < illustrations.length; j++) {
      pairs.push([illustrations[i], illustrations[j]]);
    }
  }

  const handleVote = useCallback(
    async (winnerId: string, loserId: string) => {
      if (voting) return;
      setVoting(true);

      try {
        await fetch("/api/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oracle_id: oracleId,
            winner_illustration_id: winnerId,
            loser_illustration_id: loserId,
            session_id: sessionId,
            vote_source: "deck",
          }),
        });

        if (pairIndex + 1 >= pairs.length) {
          setDone(true);
        } else {
          setPairIndex((i) => i + 1);
        }
      } finally {
        setVoting(false);
      }
    },
    [oracleId, sessionId, pairIndex, pairs.length, voting]
  );

  if (pairs.length === 0 || done) {
    return (
      <p className="text-xs text-gray-500 text-center py-2">
        {pairs.length === 0 ? "Only one illustration" : "All compared!"}
      </p>
    );
  }

  const [a, b] = pairs[pairIndex];

  return (
    <div className="mt-3 pt-3 border-t border-gray-800">
      <p className="text-xs text-gray-500 mb-2 text-center">
        Which art do you prefer? ({pairIndex + 1}/{pairs.length})
      </p>
      <div className="grid grid-cols-2 gap-2">
        {[a, b].map((ill, i) => {
          const other = i === 0 ? b : a;
          return (
            <button
              key={ill.illustration_id}
              onClick={() =>
                handleVote(ill.illustration_id, other.illustration_id)
              }
              disabled={voting}
              className="relative rounded-lg overflow-hidden border-2 border-transparent hover:border-amber-500 transition-colors disabled:opacity-60"
            >
              <img
                src={artCropUrl(ill.set_code, ill.collector_number, ill.image_version)}
                alt={`Art by ${ill.artist}`}
                className="w-full aspect-[4/3] object-cover"
              />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
                <p className="text-xs text-white truncate">{ill.artist}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
