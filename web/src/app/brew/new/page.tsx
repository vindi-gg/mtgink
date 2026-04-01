import BrewCreateForm from "./BrewCreateForm";

export const metadata = {
  title: "Brew a Custom Gauntlet",
  description: "Build a custom gauntlet — pick your source and filters",
};

export default async function BrewNewPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Brew a Custom Gauntlet</h1>
        <BrewCreateForm />
      </div>
    </main>
  );
}
