import { notFound } from "next/navigation";
import { getBrewBySlug } from "@/lib/brew-queries";
import BrewDetail from "./BrewDetail";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brew = await getBrewBySlug(slug);
  if (!brew) return { title: "Brew Not Found — MTG Ink" };
  return {
    title: `${brew.name} — MTG Ink`,
    description: brew.description || `${brew.mode} brew: ${brew.source_label}`,
  };
}

export default async function BrewDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brew = await getBrewBySlug(slug);
  if (!brew) notFound();

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <BrewDetail brew={brew} />
      </div>
    </main>
  );
}
