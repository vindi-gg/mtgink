export default function Sidebar({ children }: { children?: React.ReactNode }) {
  return (
    <aside className="hidden lg:block w-[300px] shrink-0 pt-[7rem]">
      <div className="space-y-6">
        {children}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Explore</h3>
          <nav className="space-y-2 text-sm">
            <a href="/db/expansions" className="block text-gray-300 hover:text-white transition-colors">Expansions</a>
            <a href="/db/cards" className="block text-gray-300 hover:text-white transition-colors">Cards</a>
            <a href="/artists" className="block text-gray-300 hover:text-white transition-colors">Artists</a>
            <a href="/db/tribes" className="block text-gray-300 hover:text-white transition-colors">Tribes</a>
            <a href="/db/tags" className="block text-gray-300 hover:text-white transition-colors">Card Tags</a>
            <a href="/db/art-tags" className="block text-gray-300 hover:text-white transition-colors">Art Tags</a>
          </nav>
        </div>
      </div>
    </aside>
  );
}
