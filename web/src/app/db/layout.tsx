import Sidebar from "@/components/Sidebar";
import { ExpansionProvider } from "@/lib/expansion-context";
import { BracketSourceProvider } from "@/lib/bracket-source-context";

export default function DbLayout({ children }: { children: React.ReactNode }) {
  return (
    <BracketSourceProvider>
      <ExpansionProvider>
        <div className="max-w-7xl mx-auto px-4 flex gap-8">
          <div className="flex-1 min-w-0">{children}</div>
          <Sidebar />
        </div>
      </ExpansionProvider>
    </BracketSourceProvider>
  );
}
