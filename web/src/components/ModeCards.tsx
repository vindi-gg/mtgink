import Link from "next/link";
import { PLAY_MODES, PlayModeIcon } from "@/lib/play-modes";

const MODES = PLAY_MODES.filter((m): m is typeof PLAY_MODES[number] & { createHref: string } => "createHref" in m);

interface ModeCardsProps {
  images?: string[];
}

export default function ModeCards({ images = [] }: ModeCardsProps) {

  return (
    <div className="mb-8">
      <div className="grid grid-cols-1 gap-4">
        {MODES.map((mode, i) => {
          const bgImage = images[i];
          return (
            <div key={mode.href} className="relative border border-amber-500/30 rounded-xl overflow-hidden">
              {bgImage && (
                <img
                  src={bgImage}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-25 scale-105"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-gray-950 via-gray-950/70 to-gray-950/40" />
              <div className="relative p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-start gap-3 text-left min-w-0">
                  <PlayModeIcon d={mode.icon} className="w-6 h-6 mt-0.5 text-amber-400 shrink-0" />
                  <div>
                    <h3 className="text-lg font-bold text-white">{mode.label}</h3>
                    <p className="text-sm text-gray-400">{mode.desc}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={mode.href}
                    rel="nofollow"
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors whitespace-nowrap"
                  >
                    Random Play
                  </Link>
                  <Link
                    href={mode.createHref}
                    rel="nofollow"
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white transition-colors whitespace-nowrap"
                  >
                    Create
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
