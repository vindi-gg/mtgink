"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useRef, useEffect } from "react";

export default function DbSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const userTyped = useRef(false);

  useEffect(() => {
    if (!userTyped.current) return;
    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query) params.set("q", query);
      else params.delete("q");
      params.delete("page"); // reset to page 1 on search
      router.replace(`?${params.toString()}`);
      userTyped.current = false;
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      type="text"
      value={query}
      onChange={(e) => {
        userTyped.current = true;
        setQuery(e.target.value);
      }}
      placeholder={placeholder}
      className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
    />
  );
}
