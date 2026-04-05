const MANA_SYMBOLS = new Set(["W", "U", "B", "R", "G", "C"]);

const SIZES = {
  sm: { outer: "h-6 w-6", text: "text-[9px]", img: 24 },
  md: { outer: "h-7 w-7", text: "text-xs", img: 28 },
  lg: { outer: "h-12 w-12", text: "text-lg", img: 48 },
};

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function UserAvatar({
  customAvatar,
  avatarUrl,
  displayName,
  size = "md",
}: {
  customAvatar?: string | null;
  avatarUrl?: string | null;
  displayName?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const s = SIZES[size];

  // Custom avatar
  if (customAvatar) {
    const [type, value] = customAvatar.split(":", 2);

    if (type === "mana" && value && MANA_SYMBOLS.has(value)) {
      return (
        <div className={`${s.outer} rounded-full flex items-center justify-center overflow-hidden`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://svgs.scryfall.io/card-symbols/${value}.svg`}
            alt={value}
            className="w-full h-full"
          />
        </div>
      );
    }

    if (type === "set" && value) {
      return (
        <div className={`${s.outer} rounded-full bg-gray-800 flex items-center justify-center overflow-hidden`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://svgs.scryfall.io/sets/${value}.svg`}
            alt=""
            className="w-[70%] h-[70%] invert opacity-80"
          />
        </div>
      );
    }
  }

  // OAuth avatar
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt="" className={`${s.outer} rounded-full`} />
    );
  }

  // Initials fallback
  return (
    <div className={`${s.outer} rounded-full bg-amber-500 flex items-center justify-center ${s.text} font-bold text-gray-900`}>
      {getInitials(displayName)}
    </div>
  );
}
