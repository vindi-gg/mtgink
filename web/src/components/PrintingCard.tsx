"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { normalCardUrl } from "@/lib/image-utils";

interface PriceInfo {
  price: number;
  currency: string;
  url: string;
  marketplace: string;
}

interface PrintingCardProps {
  src: string;
  alt: string;
  setCode: string;
  collectorNumber: string;
  imageVersion?: string | null;
  cardName: string;
  setName: string;
  rarity: string | null;
  price?: PriceInfo | null;
  tcgplayerId?: number | null;
}

function PrintingModal({
  src,
  cardName,
  setCode,
  setName,
  collectorNumber,
  rarity,
  price,
  tcgplayerId,
  onClose,
}: {
  src: string;
  cardName: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string | null;
  price?: PriceInfo | null;
  tcgplayerId?: number | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const rarityColor =
    rarity === "mythic"
      ? "text-orange-400"
      : rarity === "rare"
        ? "text-amber-400"
        : rarity === "uncommon"
          ? "text-gray-300"
          : "text-gray-500";

  const buyUrl = price?.url ?? (tcgplayerId ? `https://www.tcgplayer.com/product/${tcgplayerId}` : null);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/85" />
      <div
        className="relative max-w-[320px] w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={`${cardName} - ${setName}`}
          className="w-full rounded-[3.8%]"
        />

        <div className="mt-3 px-1 space-y-2">
          <div>
            <h3 className="text-base font-bold text-white">{cardName}</h3>
            <div className="flex items-center gap-2 text-sm">
              <Link
                href={`/db/expansions/${setCode}`}
                className="text-gray-400 hover:text-amber-400 transition-colors"
              >
                {setName}
              </Link>
              <span className="text-gray-600">#{collectorNumber}</span>
              {rarity && <span className={`capitalize ${rarityColor}`}>{rarity}</span>}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              {price && (
                <span className="text-lg font-bold text-green-400">
                  ${price.price.toFixed(2)}
                  <span className="text-xs text-gray-500 ml-1.5 font-normal">
                    {price.marketplace}
                  </span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {buyUrl && (
                <a
                  href={buyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-sm bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-400 transition-colors"
                >
                  Buy Now
                </a>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function PrintingCard({
  src,
  alt,
  setCode,
  collectorNumber,
  imageVersion,
  cardName,
  setName,
  rarity,
  price,
  tcgplayerId,
}: PrintingCardProps) {
  const [open, setOpen] = useState(false);
  const fullSrc = normalCardUrl(setCode, collectorNumber, imageVersion);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className="w-full rounded-lg cursor-pointer"
        loading="lazy"
        onClick={() => setOpen(true)}
      />
      {open && (
        <PrintingModal
          src={fullSrc}
          cardName={cardName}
          setCode={setCode}
          setName={setName}
          collectorNumber={collectorNumber}
          rarity={rarity}
          price={price}
          tcgplayerId={tcgplayerId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
