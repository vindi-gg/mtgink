"use client";

import { useState } from "react";

const SAMPLES = [
  "lightning-bolt",
  "counterspell",
  "sol-ring",
  "black-lotus",
  "cryptcaller-chariot",
  "fastbond",
];

export default function OGTestPage() {
  const [slug, setSlug] = useState(SAMPLES[0]);
  const [custom, setCustom] = useState("");
  const ts = Date.now();

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">OG Image Test</h1>
        <p className="text-sm text-gray-400">Preview Open Graph images at 1200x630</p>

        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s}
              onClick={() => setSlug(s)}
              className={`px-3 py-1.5 text-sm rounded-lg cursor-pointer ${
                slug === s ? "bg-amber-500 text-gray-900" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Enter card slug..."
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={() => { if (custom.trim()) setSlug(custom.trim()); }}
            className="px-4 py-2 text-sm bg-amber-500 text-gray-900 rounded-lg hover:bg-amber-400 cursor-pointer"
          >
            Preview
          </button>
        </div>

        <div className="border border-gray-700 rounded-xl overflow-hidden">
          <img
            key={slug + ts}
            src={`/card/${slug}/opengraph-image`}
            alt={`OG image for ${slug}`}
            className="w-full"
            style={{ aspectRatio: "1200/630" }}
          />
        </div>

        <p className="text-xs text-gray-600">
          URL: <code className="text-gray-400">/card/{slug}/opengraph-image</code>
        </p>
      </div>
    </main>
  );
}
