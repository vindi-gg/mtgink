import { ImageResponse } from "next/og";
import { artCropUrl } from "@/lib/image-utils";
import { getCardBySlug, getIllustrationsForCard } from "@/lib/queries";

function parseMana(manaCost: string | null) {
  if (!manaCost) return [];
  return (manaCost.match(/\{([^}]+)\}/g) || []).map((s) => s.replace(/[{}]/g, ""));
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mtg.ink";

function manaSymbolUrl(sym: string) {
  return `${SITE_URL}/mana/${encodeURIComponent(sym)}.svg`;
}

export const runtime = "edge";

const size = { width: 1200, height: 630 };

async function loadFont() {
  const res = await fetch("https://fonts.googleapis.com/css2?family=Jost:wght@700&display=swap");
  const css = await res.text();
  const match = css.match(/src: url\((.+?)\)/);
  if (!match) return null;
  const fontRes = await fetch(match[1]);
  return fontRes.arrayBuffer();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const [card, fontData] = await Promise.all([getCardBySlug(slug), loadFont()]);

  const fonts = fontData ? [{ name: "Jost", data: fontData, weight: 700 as const }] : [];

  if (!card) {
    return new ImageResponse(
      <div style={{ display: "flex", background: "#030712", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 32 }}>
        Not found
      </div>,
      { ...size, fonts }
    );
  }

  const illustrations = await getIllustrationsForCard(card.oracle_id);
  const top = illustrations[0];
  const imgSrc = top ? artCropUrl(top.set_code, top.collector_number, top.image_version) : "";

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
      {/* Art background */}
      {imgSrc && (
        <img
          src={imgSrc}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}

      {/* Gradient overlay */}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "linear-gradient(to right, rgba(3,7,18,0.9) 0%, rgba(3,7,18,0.6) 40%, rgba(3,7,18,0.2) 100%)",
        }}
      />

      {/* Content */}
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
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: "#ffffff", lineHeight: 1.1 }}>
            {card.name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {card.type_line && (
              <div style={{ display: "flex", fontSize: 32, color: "#9ca3af" }}>
                {card.type_line}
              </div>
            )}
            {card.mana_cost && (
              <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                {parseMana(card.mana_cost).map((sym, i) => (
                  <img
                    key={i}
                    src={manaSymbolUrl(sym)}
                    width={34}
                    height={34}
                    style={{ borderRadius: "50%" }}
                  />
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "18px", marginTop: "4px" }}>
            {illustrations.length > 1 && (
              <div style={{ display: "flex", fontSize: 26, color: "#f59e0b" }}>
                {illustrations.length} illustrations
              </div>
            )}
            {top?.artist && (
              <div style={{ display: "flex", fontSize: 26, color: "#6b7280" }}>
                Art by {top.artist}
              </div>
            )}
          </div>
        </div>

        {/* Branding top-left — logo + domain stacked */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: "40px",
            left: "60px",
            flexDirection: "column",
            alignItems: "center",
            lineHeight: 0.9,
            fontFamily: "Jost",
          }}
        >
          <span style={{ fontSize: 28, letterSpacing: "0.25em", color: "#ffffff", fontWeight: 700 }}>MTG</span>
          <span style={{ fontSize: 64, color: "#f59e0b", fontWeight: 700, letterSpacing: "0.05em" }}>INK</span>
          <span style={{ fontSize: 24, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em", marginTop: "8px" }}>
            https://mtg.ink
          </span>
        </div>

        {/* Copyright bottom-right */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            bottom: "40px",
            right: "60px",
            fontFamily: "Jost",
          }}
        >
          <span style={{ fontSize: 14, color: "rgba(255,255,255,0.25)" }}>
            Card art © Wizards of the Coast
          </span>
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
