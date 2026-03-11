"use client";

import { useRouter } from "next/navigation";

interface FavoriteButtonProps {
  illustrationId: string;
  oracleId: string;
  isFavorited: boolean;
  onToggle: (illustrationId: string, oracleId: string) => Promise<string | null>;
  size?: "sm" | "md";
}

export default function FavoriteButton({
  illustrationId,
  oracleId,
  isFavorited,
  onToggle,
  size = "md",
}: FavoriteButtonProps) {
  const router = useRouter();

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const result = await onToggle(illustrationId, oracleId);
    if (result === "auth_required") {
      router.push(`/auth?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    }
  }

  const sizeClasses = size === "sm" ? "w-7 h-7" : "w-9 h-9";
  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <button
      onClick={handleClick}
      className={`${sizeClasses} flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 transition-colors`}
      aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
    >
      {isFavorited ? (
        <svg
          className={`${iconSize} text-red-500`}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ) : (
        <svg
          className={`${iconSize} text-white/80 hover:text-white`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          />
        </svg>
      )}
    </button>
  );
}
