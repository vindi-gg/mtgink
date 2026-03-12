import Link from "next/link";

const MODES = [
  {
    name: "Remix",
    description: "Same card, pick the best art version",
    href: "/showdown/remix",
  },
  {
    name: "VS",
    description: "Different cards compared by theme",
    href: "/showdown/vs",
  },
  {
    name: "Gauntlet",
    description: "Winner stays, faces the next challenger",
    href: "/showdown/gauntlet",
  },
];

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
            <div key={mode.name} className="relative border border-amber-500/30 rounded-xl overflow-hidden">
              {bgImage && (
                <img
                  src={bgImage}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-25 scale-105"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-gray-950 via-gray-950/70 to-gray-950/40" />
              <div className="relative p-5 flex items-center justify-between gap-4">
                <div className="text-left min-w-0">
                  <h3 className="text-lg font-bold text-white">{mode.name}</h3>
                  <p className="text-sm text-gray-400">{mode.description}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={mode.href}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors whitespace-nowrap"
                  >
                    Random Play
                  </Link>
                  <Link
                    href="/showdown/create"
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
