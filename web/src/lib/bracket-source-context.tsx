"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

interface BracketSourceState {
  sourceType: "tribe" | "artist" | "card" | null;
  sourceParam: string;
  totalCount: number;
  label: string;
}

interface BracketSourceContextValue extends BracketSourceState {
  publish: (s: BracketSourceState) => void;
}

const BracketSourceContext = createContext<BracketSourceContextValue | null>(null);

export function BracketSourceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BracketSourceState>({
    sourceType: null,
    sourceParam: "",
    totalCount: 0,
    label: "",
  });

  const publish = useCallback((s: BracketSourceState) => {
    setState((prev) => {
      if (
        prev.sourceType === s.sourceType &&
        prev.sourceParam === s.sourceParam &&
        prev.totalCount === s.totalCount &&
        prev.label === s.label
      ) {
        return prev;
      }
      return s;
    });
  }, []);

  return (
    <BracketSourceContext.Provider value={{ ...state, publish }}>
      {children}
    </BracketSourceContext.Provider>
  );
}

export function useBracketSource() {
  const ctx = useContext(BracketSourceContext);
  if (!ctx) return { sourceType: null, sourceParam: "", totalCount: 0, label: "" };
  return { sourceType: ctx.sourceType, sourceParam: ctx.sourceParam, totalCount: ctx.totalCount, label: ctx.label };
}

export function usePublishBracketSource() {
  const ctx = useContext(BracketSourceContext);
  return ctx?.publish ?? (() => {});
}

/** Drop this into a server-rendered page to publish bracket source info to the sidebar. */
export function BracketSourcePublisher({
  sourceType,
  sourceParam,
  totalCount,
  label,
}: {
  sourceType: "tribe" | "artist" | "card";
  sourceParam: string;
  totalCount: number;
  label: string;
}) {
  const publish = usePublishBracketSource();
  useEffect(() => {
    publish({ sourceType, sourceParam, totalCount, label });
    return () => {
      publish({ sourceType: null, sourceParam: "", totalCount: 0, label: "" });
    };
  }, [sourceType, sourceParam, totalCount, label, publish]);
  return null;
}
