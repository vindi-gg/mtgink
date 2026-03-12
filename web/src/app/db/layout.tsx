import Sidebar from "@/components/Sidebar";

export default function DbLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-7xl mx-auto px-4 flex gap-8">
      <div className="flex-1 min-w-0">{children}</div>
      <Sidebar />
    </div>
  );
}
