import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getArtistBySlug,
  getArtistIllustrations,
  getArtistStats,
} from "@/lib/queries";
import { artCropUrl } from "@/lib/image-utils";
import ArtistGallery from "@/components/ArtistGallery";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtistBySlug(slug);
  if (!artist) return { title: "Artist Not Found" };

  const title = `${artist.name} — Magic: The Gathering Artist`;
  const description = `Browse all ${artist.illustration_count} Magic: The Gathering card illustrations by ${artist.name}. View artwork, ratings, and printings.`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} — MTG Ink`,
      description,
      ...(artist.hero_set_code && artist.hero_collector_number
        ? {
            images: [
              artCropUrl(artist.hero_set_code, artist.hero_collector_number, artist.hero_image_version),
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ArtistDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artist = await getArtistBySlug(slug);
  if (!artist) notFound();

  const [illustrations, stats] = await Promise.all([
    getArtistIllustrations(artist.name),
    getArtistStats(artist.id),
  ]);

  // Sort: rated illustrations first (by ELO desc), then unrated
  const sorted = [...illustrations].sort((a, b) => {
    if (a.elo_rating != null && b.elo_rating != null)
      return b.elo_rating - a.elo_rating;
    if (a.elo_rating != null) return -1;
    if (b.elo_rating != null) return 1;
    return 0;
  });

  const allTimeStat = stats.find((s) => s.period === "all");

  return (
    <main className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-1 text-sm">
          <Link href="/artists" className="text-gray-500 hover:text-gray-300">
            Artists
          </Link>
          <span className="text-gray-600">/</span>
        </div>

        {/* Header */}
        <h1 className="text-3xl font-bold">{artist.name}</h1>
        <p className="text-gray-400 text-sm mt-1">
          Magic: The Gathering Artist — {artist.illustration_count} Card
          Illustrations
        </p>
        <div className="flex items-center gap-4 text-sm text-gray-500 mt-2 mb-8">
          {allTimeStat && allTimeStat.total_votes > 0 && (
            <span>
              {allTimeStat.total_votes.toLocaleString()} total votes
            </span>
          )}
          {allTimeStat?.avg_elo != null && (
            <>
              {allTimeStat.total_votes > 0 && (
                <span className="text-gray-700">|</span>
              )}
              <span>Avg ELO: {Math.round(allTimeStat.avg_elo)}</span>
            </>
          )}
        </div>

        {sorted.length > 0 ? (
          <ArtistGallery illustrations={sorted} />
        ) : (
          <p className="text-gray-500 text-center py-12">
            No illustrations found for this artist.
          </p>
        )}
      </div>
    </main>
  );
}
