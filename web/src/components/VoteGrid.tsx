"use client";

import { useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { useImageMode } from "@/lib/image-mode";
import StackedCardLayout from "./StackedCardLayout";

interface VoteGridProps {
  renderLeft: (onClick: () => void) => React.ReactNode;
  renderRight: (onClick: () => void) => React.ReactNode;
  onVote: (side: 0 | 1) => void;
}

export interface VoteGridHandle {
  resetSelection: () => void;
}

export default forwardRef<VoteGridHandle, VoteGridProps>(function VoteGrid({ renderLeft, renderRight, onVote }, ref) {
  const { imageMode } = useImageMode();
  const [selectedCard, setSelectedCard] = useState<0 | 1 | null>(null);
  const isMobileCard = typeof window !== "undefined" && window.innerWidth < 768 && imageMode === "card";

  useImperativeHandle(ref, () => ({
    resetSelection: () => setSelectedCard(null),
  }));

  const makeClickHandler = useCallback((side: 0 | 1) => () => {
    if (isMobileCard) {
      if (selectedCard === side) {
        setSelectedCard(null);
        onVote(side);
      } else {
        setSelectedCard(side);
      }
    } else {
      onVote(side);
    }
  }, [isMobileCard, selectedCard, onVote]);

  const left = renderLeft(makeClickHandler(0));
  const right = renderRight(makeClickHandler(1));

  function wrapSide(node: React.ReactNode, side: 0 | 1) {
    const isSelected = selectedCard === side && isMobileCard;
    return (
      <div className={`relative transition-shadow duration-200 rounded-[5%] ${isSelected ? "ring-2 ring-inset ring-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]" : ""}`}>
        {node}
        {isSelected && (
          <div className="absolute bottom-0 left-0 right-0 rounded-b-[5%] pointer-events-none">
            <div className="h-12 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
            <div className="bg-black/90 px-3 py-1.5 rounded-b-[5%]">
              <p className="text-center text-xs font-medium text-amber-400">Tap again to vote</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (imageMode === "card") {
    return (
      <>
        <div className="hidden md:grid md:grid-cols-2 md:gap-6">
          {wrapSide(left, 0)}
          {wrapSide(right, 1)}
        </div>
        <div className="md:hidden">
          <StackedCardLayout
            leftOnTop={selectedCard === 0}
            left={wrapSide(left, 0)}
            right={wrapSide(right, 1)}
          />
        </div>
      </>
    );
  }

  return (
    <div className="grid grid-cols-1 landscape:grid-cols-2 md:grid-cols-2 gap-2 md:gap-6">
      {left}
      {right}
    </div>
  );
});
