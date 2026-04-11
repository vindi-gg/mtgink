"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ExpansionCountState {
  setCode: string | null;
  filteredCount: number;
  totalCount: number;
}

interface ExpansionContextValue extends ExpansionCountState {
  publishCounts: (s: ExpansionCountState) => void;
}

const ExpansionContext = createContext<ExpansionContextValue | null>(null);

export function ExpansionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ExpansionCountState>({
    setCode: null,
    filteredCount: 0,
    totalCount: 0,
  });

  const publishCounts = useCallback((s: ExpansionCountState) => {
    setState((prev) => {
      if (prev.setCode === s.setCode && prev.filteredCount === s.filteredCount && prev.totalCount === s.totalCount) {
        return prev;
      }
      return s;
    });
  }, []);

  return (
    <ExpansionContext.Provider value={{ ...state, publishCounts }}>
      {children}
    </ExpansionContext.Provider>
  );
}

export function useExpansionCounts() {
  const ctx = useContext(ExpansionContext);
  if (!ctx) return { setCode: null, filteredCount: 0, totalCount: 0 };
  return { setCode: ctx.setCode, filteredCount: ctx.filteredCount, totalCount: ctx.totalCount };
}

export function usePublishExpansionCounts() {
  const ctx = useContext(ExpansionContext);
  return ctx?.publishCounts ?? (() => {});
}
