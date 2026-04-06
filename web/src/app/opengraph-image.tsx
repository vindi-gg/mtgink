import { ImageResponse } from "next/og";
import { getAdminClient } from "@/lib/supabase/admin";
import { artCropUrl } from "@/lib/image-utils";

export const runtime = "edge";
export const revalidate = 86400; // 1 day
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

async function loadFont() {
  const res = await fetch("https://fonts.googleapis.com/css2?family=Jost:wght@700&display=swap");
  const css = await res.text();
  const match = css.match(/src: url\((.+?)\)/);
  if (!match) return null;
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

async function getTopArtUrls(): Promise<string[]> {
  const client = getAdminClient();

  // Get top 6 rated illustrations
  const { data: ratings } = await client
    .from("art_ratings")
    .select("illustration_id")
    .order("rating", { ascending: false })
    .limit(6);

  const ids = ratings?.map((r) => r.illustration_id) ?? [];
  if (ids.length === 0) return [];

  // Get one printing per illustration
  const { data: prints } = await client
    .from("printings")
    .select("illustration_id, set_code, collector_number, image_version")
    .in("illustration_id", ids);

  // Deduplicate — one printing per illustration, preserve rating order
  const byIll = new Map<string, { set_code: string; collector_number: string; image_version: string | null }>();
  for (const p of prints ?? []) {
    if (!byIll.has(p.illustration_id)) byIll.set(p.illustration_id, p);
  }

  return ids
    .map((id) => byIll.get(id))
    .filter(Boolean)
    .map((p) => artCropUrl(p!.set_code, p!.collector_number, p!.image_version));
}

export default async function DefaultOGImage() {
  const [artUrls, fontData] = await Promise.all([getTopArtUrls(), loadFont()]);

  const fonts = fontData ? [{ name: "Jost", data: fontData, weight: 700 as const }] : [];

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "#030712",
      }}
    >
      {/* Art grid background — 3x2 tiles */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {artUrls.map((url, i) => (
          <img
            key={i}
            src={url}
            style={{
              width: "33.333%",
              height: "50%",
              objectFit: "cover",
            }}
          />
        ))}
      </div>

      {/* Dark overlay */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(3, 7, 18, 0.7)",
        }}
      />

      {/* Center content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            lineHeight: 0.9,
            fontFamily: "Jost",
          }}
        >
          <span style={{ fontSize: 48, letterSpacing: "0.25em", color: "#ffffff", fontWeight: 700 }}>MTG</span>
          <span style={{ fontSize: 112, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.05em" }}>INK</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: "rgba(255, 255, 255, 0.7)",
            marginTop: "16px",
            fontFamily: "Jost",
            letterSpacing: "0.02em",
          }}
        >
          Compare and rank every MTG card art
        </div>

        {/* URL */}
        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: "rgba(255, 255, 255, 0.35)",
            marginTop: "24px",
            fontFamily: "Jost",
            letterSpacing: "0.05em",
          }}
        >
          https://mtg.ink
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
