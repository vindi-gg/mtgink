"use client";

import { useState } from "react";

export default function DailyGauntletShareButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="w-full py-2 rounded-lg border border-gray-700 text-sm font-medium text-gray-300 hover:text-white hover:border-gray-500 transition-colors cursor-pointer"
    >
      {copied ? "Copied!" : "Share Results"}
    </button>
  );
}
