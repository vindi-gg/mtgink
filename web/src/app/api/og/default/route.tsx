import { ImageResponse } from "next/og";
import { artCropUrl } from "@/lib/image-utils";

export const runtime = "edge";

const size = { width: 1200, height: 630 };

// 5 iconic MTG cards
const ICONIC_CARDS: { set_code: string; collector_number: string }[] = [
  { set_code: "lea", collector_number: "232" },   // Black Lotus
  { set_code: "sta", collector_number: "42" },     // Lightning Bolt (Mystical Archive)
  { set_code: "mh2", collector_number: "267" },    // Counterspell (full-art MH2)
  { set_code: "dmr", collector_number: "418" },    // Force of Will (borderless)
  { set_code: "wwk", collector_number: "31" },     // Jace, the Mind Sculptor
];

async function loadFont() {
  const res = await fetch("https://fonts.googleapis.com/css2?family=Jost:wght@700&display=swap");
  const css = await res.text();
  const match = css.match(/src: url\((.+?)\)/);
  if (!match) return null;
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

export async function GET() {
  const fontData = await loadFont();
  const fonts = fontData ? [{ name: "Jost", data: fontData, weight: 700 as const }] : [];

  const artUrls = ICONIC_CARDS.map((c) => artCropUrl(c.set_code, c.collector_number, null));

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
      {/* 5 art strips side by side */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      >
        {artUrls.map((url, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flex: 1,
              overflow: "hidden",
              height: "100%",
              borderRight: i < 4 ? "2px solid rgba(3,7,18,0.8)" : "none",
            }}
          >
            <img
              src={url}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>
        ))}
      </div>

      {/* Gradient overlay — left side heavy for text */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "linear-gradient(to right, rgba(3,7,18,0.92) 0%, rgba(3,7,18,0.5) 50%, rgba(3,7,18,0.1) 100%)",
        }}
      />

      {/* Bottom gradient */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "linear-gradient(to top, rgba(3,7,18,0.8) 0%, rgba(3,7,18,0.0) 40%)",
        }}
      />

      {/* Content — bottom-left */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "60px",
          width: "100%",
          height: "100%",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            lineHeight: 0.9,
            fontFamily: "Jost",
          }}
        >
          <div style={{ display: "flex", width: "100%", justifyContent: "center" }}>
            <span style={{ fontSize: 45, letterSpacing: "0.25em", color: "#ffffff", fontWeight: 700 }}>MTG</span>
          </div>
          <span style={{ fontSize: 120, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.05em" }}>INK</span>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 38,
            color: "rgba(255, 255, 255, 0.7)",
            marginTop: "12px",
            fontFamily: "Jost",
          }}
        >
          Compare and rank every MTG card art
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 25,
            color: "rgba(255, 255, 255, 0.35)",
            marginTop: "8px",
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
