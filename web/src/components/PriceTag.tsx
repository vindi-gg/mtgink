"use client";

import { useState, useEffect } from "react";

interface PriceTagProps {
  oracleId: string;
}

interface PriceData {
  marketplace_display_name: string;
  market_price: number;
  currency: string;
  product_url: string;
}

export default function PriceTag({ oracleId }: PriceTagProps) {
  const [price, setPrice] = useState<PriceData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/prices?oracle_id=${oracleId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: PriceData[] | null) => {
        if (cancelled || !data || data.length === 0) return;
        // Prefer USD
        const usd = data.find((p) => p.currency === "USD");
        setPrice(usd ?? data[0]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [oracleId]);

  if (!price || price.market_price == null) return null;

  const symbol = "$";

  return (
    <a
      href={price.product_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-xs text-green-400 hover:text-green-300 transition-colors"
    >
      {symbol}{price.market_price.toFixed(2)}
      <span className="text-gray-500">{price.marketplace_display_name}</span>
    </a>
  );
}
