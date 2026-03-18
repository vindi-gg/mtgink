export default function CardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-7xl mx-auto px-4">
      {children}
    </div>
  );
}
