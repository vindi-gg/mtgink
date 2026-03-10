"use client";

import { artCropUrl } from "@/lib/image-utils";
import { getRoundName } from "@/lib/bracket-logic";
import type { BracketState } from "@/lib/types";

interface BracketDiagramProps {
  bracket: BracketState;
}

export default function BracketDiagram({ bracket }: BracketDiagramProps) {
  const { cards, rounds, currentRound, currentMatchup } = bracket;

  return (
    <div className="space-y-8">
      {rounds.map((round, roundIdx) => {
        // Grid columns: R0=4, R1=4, R2=2, R3=2, R4=1
        const cols =
          roundIdx <= 1 ? "grid-cols-2 sm:grid-cols-4" :
          roundIdx <= 3 ? "grid-cols-1 sm:grid-cols-2" :
          "grid-cols-1 max-w-sm mx-auto";

        return (
          <div key={roundIdx}>
            <h3 className="text-sm font-semibold text-gray-400 mb-3">
              {getRoundName(roundIdx)}
            </h3>
            <div className={`grid ${cols} gap-3`}>
              {round.map((matchup) => {
                const isCurrent =
                  !bracket.completed &&
                  roundIdx === currentRound &&
                  matchup.index === currentMatchup;
                const cardA = matchup.seedA >= 0 ? cards[matchup.seedA] : null;
                const cardB = matchup.seedB >= 0 ? cards[matchup.seedB] : null;

                return (
                  <div
                    key={`${roundIdx}-${matchup.index}`}
                    className={`rounded-lg border p-2 ${
                      isCurrent
                        ? "border-amber-500 bg-amber-500/10"
                        : "border-gray-800 bg-gray-900/50"
                    }`}
                  >
                    <MatchupEntry
                      card={cardA}
                      seed={matchup.seedA}
                      winner={matchup.winner}
                    />
                    <div className="h-px bg-gray-800 my-1" />
                    <MatchupEntry
                      card={cardB}
                      seed={matchup.seedB}
                      winner={matchup.winner}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MatchupEntry({
  card,
  seed,
  winner,
}: {
  card: BracketState["cards"][number] | null;
  seed: number;
  winner: number | null;
}) {
  if (!card) {
    return (
      <div className="flex items-center gap-2 px-1 py-1 rounded">
        <div className="w-8 h-8 rounded bg-gray-800 shrink-0" />
        <span className="text-xs text-gray-600">TBD</span>
      </div>
    );
  }

  const isWinner = winner === seed;
  const isLoser = winner !== null && winner !== seed;
  const artUrl = artCropUrl(card.set_code, card.collector_number, card.image_version);

  return (
    <div
      className={`flex items-center gap-2 px-1 py-1 rounded ${
        isWinner ? "bg-amber-500/10" : ""
      } ${isLoser ? "opacity-40" : ""}`}
    >
      <img
        src={artUrl}
        alt=""
        className={`w-8 h-8 rounded object-cover shrink-0 ${
          isWinner ? "ring-1 ring-amber-400" : ""
        }`}
      />
      <span
        className={`text-xs truncate ${
          isWinner ? "text-amber-400 font-semibold" : "text-gray-300"
        }`}
      >
        {card.name}
      </span>
    </div>
  );
}
