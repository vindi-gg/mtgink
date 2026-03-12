import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-gray-800 bg-gray-900/50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3">
            <div className="text-[15px] font-bold tracking-[0.08em]">
              <span className="text-gray-400">MTG </span><span className="text-amber-400">INK</span>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-gray-500">
              MTG Ink is an independent fan project and is not affiliated with, endorsed by, or sponsored by Wizards of the Coast, Hasbro, or any of their subsidiaries. Card images and data courtesy of{" "}
              <a href="https://scryfall.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-300 transition-colors">Scryfall</a>.
            </p>
          </div>
          <nav className="flex gap-6 text-xs text-gray-500">
            <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-gray-300 transition-colors">Terms</Link>
            <a href="mailto:dan@mtg.ink" className="hover:text-gray-300 transition-colors">Contact</a>
          </nav>
        </div>
        <p className="mt-6 text-[11px] text-gray-600/60">
          &copy; {new Date().getFullYear()} MTG Ink. Card data and images courtesy of{" "}
          <a href="https://scryfall.com" target="_blank" rel="noopener noreferrer" className="hover:text-gray-500 transition-colors">Scryfall</a>
          {" "}and Wizards of the Coast.
        </p>
      </div>
    </footer>
  );
}
