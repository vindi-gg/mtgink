"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { artCropUrl } from "@/lib/image-utils";

const MODES = [
  {
    name: "Remix",
    description: "Same card, pick the best art version",
    href: "/showdown/remix",
  },
  {
    name: "VS",
    description: "Different cards' art compared by theme",
    href: "/showdown/vs",
  },
  {
    name: "Gauntlet",
    description: "Winner stays, faces the next challenger",
    href: "/showdown/gauntlet",
  },
];

export default function ModeCards() {
  const [images, setImages] = useState<(string | null)[]>([null, null, null]);

  useEffect(() => {
    fetch("/api/featured-art?count=3")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.images) setImages(data.images);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="mb-8">
      <div className="grid grid-cols-1 gap-4">
        {MODES.map((mode, i) => {
          const bgImage = images[i];
          return (
            <Link
              key={mode.name}
              href={mode.href}
              className="relative block border border-amber-500/30 hover:border-amber-500 rounded-xl overflow-hidden text-left transition-all group"
            >
              {bgImage && (
                <img
                  src={bgImage}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-25 group-hover:opacity-35 transition-opacity scale-105 group-hover:scale-100 duration-500"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-gray-950 via-gray-950/70 to-gray-950/40" />
              <div className="relative p-6">
                <h3 className="text-xl font-bold text-white mb-1">{mode.name}</h3>
                <p className="text-sm text-gray-400">{mode.description}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
