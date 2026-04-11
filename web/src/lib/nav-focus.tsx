"use client";

/**
 * NavFocusContext — lets pages toggle the global <Navbar /> into a
 * hidden state so they can reclaim the top ~56px for a focused
 * experience (e.g. /bracket). The Navbar itself consumes this context
 * and animates a translateY + marginBottom slide so the content below
 * moves up in sync with the nav sliding out of view.
 *
 * Pages call `setHidden(true)` on mount and `setHidden(false)` on
 * unmount. A page-local UI (e.g. a hamburger in the bracket header)
 * can call setHidden(false) to pop the nav back without unmounting.
 */

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type NavFocusValue = {
  hidden: boolean;
  setHidden: (v: boolean) => void;
};

const NavFocusContext = createContext<NavFocusValue>({
  hidden: false,
  setHidden: () => {},
});

// Routes that start with the nav hidden. Add new focus-mode routes here.
// On a hard refresh / direct navigation, the provider initializes hidden
// to `true` when the URL matches one of these prefixes, so the Navbar's
// first render is already in the hidden state — no slide-in animation.
// Page-level effects (e.g. BracketFillView's setNavHidden(true)) are then
// a no-op on mount because the state is already true.
const FOCUS_MODE_ROUTE_PREFIXES = ["/bracket"];

function shouldStartHidden(pathname: string | null): boolean {
  if (!pathname) return false;
  return FOCUS_MODE_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function NavFocusProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Lazy initializer — only consults pathname on the very first mount of
  // the provider. On subsequent SPA navigation, state changes go through
  // the effect in the target page (e.g. BracketFillView), which is the
  // right place for the slide-in transition to fire.
  const [hidden, setHiddenState] = useState(() => shouldStartHidden(pathname));
  // Stable identity so consumers can safely put setHidden in effect deps.
  const setHidden = useCallback((v: boolean) => setHiddenState(v), []);
  return (
    <NavFocusContext.Provider value={{ hidden, setHidden }}>
      {children}
    </NavFocusContext.Provider>
  );
}

export function useNavFocus(): NavFocusValue {
  return useContext(NavFocusContext);
}
