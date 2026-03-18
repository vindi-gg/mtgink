import BrewCreateForm from "./BrewCreateForm";

export const metadata = {
  title: "Create Brew — MTG Ink",
  description: "Build a custom showdown — pick your mode, source, and filters",
};

export default function BrewNewPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Create Brew</h1>
        <BrewCreateForm />
      </div>
    </main>
  );
}
