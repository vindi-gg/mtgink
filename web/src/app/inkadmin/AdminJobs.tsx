"use client";

import { useState } from "react";

const WORKER_URL = "https://mtgink-images.vindi-llc.workers.dev";

const JOBS = [
  { id: "sync", label: "Full Sync", desc: "Data + images + tags (what cron runs hourly)", icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" },
  { id: "data", label: "Card Data", desc: "Import latest card data from Scryfall", icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" },
  { id: "images", label: "Images", desc: "Download missing card art to R2", icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" },
  { id: "prices", label: "Prices", desc: "Import prices from Scryfall", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { id: "tags", label: "Tags", desc: "Import Scryfall tagger tags", icon: "M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" },
];

export default function AdminJobs() {
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<{ job: string; ok: boolean; message: string } | null>(null);

  async function triggerJob(jobId: string) {
    setRunning(jobId);
    setResult(null);
    try {
      const res = await fetch(`${WORKER_URL}?job=${jobId}`);
      const data = await res.json();
      setResult({ job: jobId, ok: res.ok, message: data.message || data.error || "Done" });
    } catch (err) {
      setResult({ job: jobId, ok: false, message: (err as Error).message });
    }
    setRunning(null);
  }

  async function checkStatus() {
    setRunning("status");
    setResult(null);
    try {
      const res = await fetch(`${WORKER_URL}?status=1`);
      const data = await res.json();
      setResult({ job: "status", ok: res.ok, message: JSON.stringify(data, null, 2) });
    } catch (err) {
      setResult({ job: "status", ok: false, message: (err as Error).message });
    }
    setRunning(null);
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Data Pipeline</h2>
      {JOBS.map((job) => (
        <div key={job.id} className="flex items-center justify-between p-4 bg-gray-900 border border-gray-800 rounded-lg">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={job.icon} />
            </svg>
            <div>
              <span className="text-sm font-bold text-white">{job.label}</span>
              <p className="text-xs text-gray-500">{job.desc}</p>
            </div>
          </div>
          <button
            onClick={() => triggerJob(job.id)}
            disabled={running !== null}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {running === job.id ? "Running..." : "Run"}
          </button>
        </div>
      ))}
      <button
        onClick={checkStatus}
        disabled={running !== null}
        className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-50 cursor-pointer"
      >
        {running === "status" ? "Checking..." : "Check Container Status"}
      </button>

      <h2 className="text-lg font-semibold pt-4">Themes</h2>
      <div className="flex items-center justify-between p-4 bg-gray-900 border border-gray-800 rounded-lg">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.183" />
          </svg>
          <div>
            <span className="text-sm font-bold text-white">Regenerate Themes</span>
            <p className="text-xs text-gray-500">Rebuild all gauntlet/VS themes from current data</p>
          </div>
        </div>
        <button
          onClick={async () => {
            setRunning("themes");
            setResult(null);
            try {
              const res = await fetch("/api/admin/themes/regenerate", { method: "POST" });
              const data = await res.json();
              setResult({ job: "themes", ok: res.ok, message: data.message || data.error });
            } catch (err) {
              setResult({ job: "themes", ok: false, message: (err as Error).message });
            }
            setRunning(null);
          }}
          disabled={running !== null}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-gray-900 hover:bg-amber-400 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {running === "themes" ? "Regenerating..." : "Regenerate"}
        </button>
      </div>
      {result && (
        <div className={`p-3 rounded-lg text-sm ${result.ok ? "bg-green-900/20 border border-green-800 text-green-400" : "bg-red-900/20 border border-red-800 text-red-400"}`}>
          <pre className="whitespace-pre-wrap break-words">{result.message}</pre>
        </div>
      )}
    </div>
  );
}
