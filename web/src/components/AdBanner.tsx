"use client";

/**
 * Fixed bottom ad banner placeholder.
 * Replace the inner div with actual ad network code (e.g. Google AdSense).
 * Standard mobile banner: 320x50. Tablet/desktop leaderboard: 728x90.
 */
export default function AdBanner() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center bg-gray-950/95 border-t border-gray-800 py-1">
      <div className="w-[320px] h-[50px] md:w-[728px] md:h-[90px] bg-gray-900 rounded flex items-center justify-center">
        <span className="text-xs text-gray-700">Ad</span>
      </div>
    </div>
  );
}
