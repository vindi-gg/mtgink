import { artCropUrl } from "./image-utils";

const BASE_URL = "https://mtg.ink";

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "MTG Ink",
    url: BASE_URL,
    description:
      "Compare and rank every Magic: The Gathering card art. Browse 37,000+ cards and vote for the best MTG art.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${BASE_URL}/card/{search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbJsonLd(
  items: { name: string; url: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${BASE_URL}${item.url}`,
    })),
  };
}

export function imageGalleryJsonLd(
  cardName: string,
  illustrations: { set_code: string; collector_number: string; image_version?: string | null }[],
  slug: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ImageGallery",
    name: `${cardName} Art`,
    description: `All illustrations of ${cardName}, ranked by community votes`,
    url: `${BASE_URL}/card/${slug}`,
    numberOfItems: illustrations.length,
    image: illustrations.map((ill) =>
      artCropUrl(ill.set_code, ill.collector_number, ill.image_version),
    ),
  };
}

export function collectionPageJsonLd(
  name: string,
  description: string,
  url: string,
  numberOfItems: number,
) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: `${BASE_URL}${url}`,
    numberOfItems,
  };
}

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
