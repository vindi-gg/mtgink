import Link from "next/link";
import { artCropUrl } from "@/lib/image-utils";
import type { DailyChallenge } from "@/lib/types";

interface Props {
  challenge: DailyChallenge;
}

const TYPE_LABEL: Record<string, string> = {
  bracket: "Bracket",
  gauntlet: "Gauntlet",
  remix: "Remix",
  vs: "VS",
};

/** Strip the trailing type suffix from the title (e.g. "Leech Bracket" → "Leech",
 *  "Cycle Ltr R Two Color Gauntlet" → "Cycle Ltr R Two Color"), so the theme
 *  shows once instead of being repeated by the type badge. */
function themeFromTitle(title: string | null | undefined, type: string): string {
  if (!title) return "";
  const suffix = TYPE_LABEL[type];
  if (!suffix) return title;
  const trimmed = title.replace(new RegExp(`\\s+${suffix}$`, "i"), "").trim();
  return trimmed || title;
}

export default function DailyChallengeMini({ challenge }: Props) {
  const href = `/daily/${challenge.challenge_type}`;
  const bg =
    challenge.preview_set_code && challenge.preview_collector_number
      ? artCropUrl(
          challenge.preview_set_code,
          challenge.preview_collector_number,
          challenge.preview_image_version,
        )
      : null;
  const type = TYPE_LABEL[challenge.challenge_type] ?? "Challenge";
  const theme = themeFromTitle(challenge.title, challenge.challenge_type);

  return (
    <Link
      href={href}
      className="group relative block h-14 rounded-lg overflow-hidden border border-gray-800 hover:border-amber-500/50 transition-colors cursor-pointer"
    >
      {bg ? (
        <img
          src={bg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gray-900" />
      )}
      {/* Symmetric dark overlay so text on both sides stays legible */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/85" />

      <div className="absolute inset-0 flex items-center justify-between px-3 gap-3">
        <span className="text-sm font-bold text-amber-300 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
          Play {type}
        </span>
        {theme && (
          <span className="text-xs sm:text-sm font-medium text-white truncate text-right drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {theme}
          </span>
        )}
      </div>
    </Link>
  );
}
