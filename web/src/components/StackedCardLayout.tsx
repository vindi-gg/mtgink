/**
 * Stacked/fanned card layout for mobile card-mode voting — one card
 * pinned top-left, the other bottom-right, each at 75% width, overlapping
 * in the middle. Used by both VoteGrid (showdown) and MatchupCard
 * (bracket) so the voting feel is consistent across modes.
 *
 * This component is layout-only — it does NOT manage selection state or
 * click handlers. Each consumer wraps its own interactivity (tap-to-confirm
 * in showdown, single-tap in brackets, winner/loser styling, etc.) around
 * the children before passing them in.
 */

interface StackedCardLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
  /** Optional class to override the outer container width. Default is
   *  `w-[90%] mx-auto`. */
  className?: string;
  /** When true, the left card is rendered above the right card (z-30 vs
   *  z-10). Default is false — right card sits in front (z-20 vs z-10).
   *  Use this to bring a background card to the foreground on selection. */
  leftOnTop?: boolean;
}

export default function StackedCardLayout({
  left,
  right,
  className = "w-[90%] mx-auto",
  leftOnTop = false,
}: StackedCardLayoutProps) {
  return (
    <div className={`relative ${className}`} style={{ aspectRatio: "488 / 830" }}>
      <div
        className="absolute top-0 left-0 w-[75%] transition-[z-index] duration-200"
        style={{ zIndex: leftOnTop ? 30 : 10 }}
      >
        {left}
      </div>
      <div
        className="absolute bottom-[5%] right-0 w-[75%] transition-[z-index] duration-200"
        style={{ zIndex: leftOnTop ? 10 : 20 }}
      >
        {right}
      </div>
    </div>
  );
}
