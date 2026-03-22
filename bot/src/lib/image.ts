import sharp from "sharp";
import type { Illustration } from "./types.js";

const CDN = "https://cdn.mtg.ink";
const CARD_WIDTH = 626;
const CARD_HEIGHT = 457;
const GAP = 20;
const CANVAS_WIDTH = CARD_WIDTH * 2 + GAP;
const CANVAS_HEIGHT = CARD_HEIGHT;

function artCropUrl(ill: Illustration): string {
  const base = `${CDN}/${ill.set_code}/${ill.collector_number}_art_crop.jpg`;
  return ill.image_version ? `${base}?v=${ill.image_version}` : base;
}

function artistOverlaySvg(artist: string, side: "left" | "right"): Buffer {
  const x = side === "left" ? 10 : CARD_WIDTH + GAP + 10;
  const y = CARD_HEIGHT - 12;
  // Escape XML special characters
  const safe = artist.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}">
    <defs>
      <filter id="shadow" x="-2" y="-2" width="200%" height="200%">
        <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.8"/>
      </filter>
    </defs>
    <text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="16" font-weight="bold"
          fill="white" filter="url(#shadow)">${safe}</text>
  </svg>`;
  return Buffer.from(svg);
}

function vsDividerSvg(): Buffer {
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;
  const svg = `<svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}">
    <defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#000" flood-opacity="0.9"/>
      </filter>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="22" fill="#1a1a2e" stroke="#f59e0b" stroke-width="2" filter="url(#glow)"/>
    <text x="${cx}" y="${cy + 6}" font-family="Arial, sans-serif" font-size="18" font-weight="bold"
          fill="#f59e0b" text-anchor="middle">VS</text>
  </svg>`;
  return Buffer.from(svg);
}

async function fetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url} (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export async function createShowdownImage(a: Illustration, b: Illustration): Promise<Buffer> {
  const [imgA, imgB] = await Promise.all([
    fetchImage(artCropUrl(a)),
    fetchImage(artCropUrl(b)),
  ]);

  // Resize both to exact dimensions
  const [bufA, bufB] = await Promise.all([
    sharp(imgA).resize(CARD_WIDTH, CARD_HEIGHT, { fit: "cover" }).toBuffer(),
    sharp(imgB).resize(CARD_WIDTH, CARD_HEIGHT, { fit: "cover" }).toBuffer(),
  ]);

  return sharp({
    create: {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      channels: 3,
      background: { r: 26, g: 26, b: 46 },
    },
  })
    .composite([
      { input: bufA, left: 0, top: 0 },
      { input: bufB, left: CARD_WIDTH + GAP, top: 0 },
      { input: vsDividerSvg(), left: 0, top: 0 },
      { input: artistOverlaySvg(a.artist, "left"), left: 0, top: 0 },
      { input: artistOverlaySvg(b.artist, "right"), left: 0, top: 0 },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
}
