"use client";

import { useState } from "react";

type Mode = "default" | "card";

const SAMPLES = [
  "lightning-bolt",
  "counterspell",
  "sol-ring",
  "black-lotus",
  "cryptcaller-chariot",
  "fastbond",
];

export default function OGTestPage() {
  const [mode, setMode] = useState<Mode>("default");
  const [slug, setSlug] = useState(SAMPLES[0]);
  const [custom, setCustom] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const ts = Date.now();

  const ogUrl = mode === "default" ? "/api/og/default" : `/api/og/card/${slug}`;
  const label = mode === "default" ? "Default (site-wide)" : slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  return (
    <main className="min-h-screen bg-gray-950 text-white py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">OG Image Test</h1>
        <p className="text-sm text-gray-400">Preview Open Graph images at 1200×630</p>

        {/* Mode tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode("default")}
            className={`px-4 py-2 text-sm rounded-lg cursor-pointer ${
              mode === "default" ? "bg-amber-500 text-gray-900 font-bold" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Default OG
          </button>
          <button
            onClick={() => setMode("card")}
            className={`px-4 py-2 text-sm rounded-lg cursor-pointer ${
              mode === "card" ? "bg-amber-500 text-gray-900 font-bold" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            Card OG
          </button>
        </div>

        {/* Card selector (only in card mode) */}
        {mode === "card" && (
          <>
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
          </>
        )}

        <div className="space-y-6">
          {/* Full size */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Full size (1200×630)</p>
            <div className="border border-gray-700 rounded-xl overflow-hidden">
              <img
                key={ogUrl + ts}
                src={ogUrl}
                alt={`OG image — ${label}`}
                className="w-full"
                style={{ aspectRatio: "1200/630" }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Discord embed */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Discord embed (~400px wide)</p>
              <div className="bg-[#2f3136] rounded-lg p-3 border-l-4 border-amber-500" style={{ maxWidth: 420 }}>
                <p className="text-xs text-blue-400 mb-1">mtg.ink</p>
                <p className="text-sm text-white font-medium mb-2">
                  {mode === "default" ? "MTG Ink — Discover the Art of Magic" : `${label} - Best Card Art | MTG Ink`}
                </p>
                <div className="rounded overflow-hidden">
                  <img
                    src={ogUrl}
                    alt=""
                    className="w-full"
                    style={{ aspectRatio: "1200/630" }}
                  />
                </div>
              </div>
            </div>

            {/* Phone / iMessage */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Phone / iMessage (~300px wide)</p>
              <div className="bg-gray-800 rounded-2xl p-2" style={{ maxWidth: 300 }}>
                <div className="rounded-xl overflow-hidden">
                  <img
                    src={ogUrl}
                    alt=""
                    className="w-full"
                    style={{ aspectRatio: "1200/630" }}
                  />
                  <div className="bg-gray-700 px-3 py-2">
                    <p className="text-[10px] text-gray-400">mtg.ink</p>
                    <p className="text-xs text-white">
                      {mode === "default" ? "MTG Ink — Discover the Art of Magic" : `${label} - Best Card Art`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <p className="text-xs text-gray-600">
            URL: <code className="text-gray-400">{ogUrl}</code>
          </p>
          <button
            onClick={async () => {
              setGenerating(true);
              setGenResult(null);
              try {
                const slugs = mode === "default" ? "default" : slug;
                const res = await fetch("/api/admin/worker", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ job: "og", slugs }),
                });
                const data = await res.json();
                setGenResult(res.ok ? `Started: ${data.message || "generating to R2"}` : `Error: ${data.error}`);
              } catch (err) {
                setGenResult(`Error: ${(err as Error).message}`);
              }
              setGenerating(false);
            }}
            disabled={generating}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-500 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {generating ? "Generating..." : "Generate to R2"}
          </button>
        </div>
        {genResult && (
          <p className={`text-xs mt-1 ${genResult.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>{genResult}</p>
        )}
      </div>
    </main>
  );
}
