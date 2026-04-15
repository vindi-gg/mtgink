import Sidebar from "@/components/Sidebar";
import { BracketSourceProvider } from "@/lib/bracket-source-context";

export default function ArtistsLayout({ children }: { children: React.ReactNode }) {
  return (
    <BracketSourceProvider>
      <div className="max-w-7xl mx-auto px-4 flex gap-8">
        <div className="flex-1 min-w-0">{children}</div>
        <Sidebar />
      </div>
    </BracketSourceProvider>
  );
}
