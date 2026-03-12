import { ImageResponse } from "next/og";
import { getAdminClient } from "@/lib/supabase/admin";
import { artCropUrl } from "@/lib/image-utils";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

interface GauntletResultEntry {
  oracle_id: string;
  illustration_id: string;
  name: string;
  artist: string;
  set_code: string;
  collector_number: string;
  wins: number;
  position: number;
}

export default async function OGImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return new ImageResponse(<div style={{ display: "flex", background: "#030712", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 32 }}>Not found</div>, { ...size });
  }

  const { data } = await getAdminClient()
    .from("gauntlet_results")
    .select("champion_name, champion_illustration_id, champion_wins, pool_size, results, card_name, filter_label, mode")
    .eq("id", numId)
    .maybeSingle();

  if (!data) {
    return new ImageResponse(<div style={{ display: "flex", background: "#030712", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 32 }}>Not found</div>, { ...size });
  }

  const results = data.results as GauntletResultEntry[];
  const champEntry = results.find(
    (r: GauntletResultEntry) => r.illustration_id === data.champion_illustration_id
  );

  const champArt = champEntry
    ? artCropUrl(champEntry.set_code, champEntry.collector_number, null)
    : "";

  // Top 3 runner-ups
  const runnerUps = results
    .filter((r: GauntletResultEntry) => r.illustration_id !== data.champion_illustration_id)
    .sort((a: GauntletResultEntry, b: GauntletResultEntry) => b.position - a.position)
    .slice(0, 3);

  const label = data.card_name
    ? `${data.card_name} Gauntlet`
    : data.filter_label
      ? `${data.filter_label} Gauntlet`
      : "Gauntlet";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#030712",
          position: "relative",
        }}
      >
        {/* Champion art — full bleed background */}
        {champArt && (
          <img
            src={champArt}
            width={1200}
            height={630}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.6,
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
            background: "linear-gradient(to right, rgba(3,7,18,0.95) 0%, rgba(3,7,18,0.7) 50%, rgba(3,7,18,0.4) 100%)",
          }}
        />

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "60px",
            position: "relative",
            width: "100%",
          }}
        >
          {/* Label */}
          <div style={{ display: "flex", fontSize: 20, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
            {label}
          </div>

          {/* Champion name */}
          <div style={{ display: "flex", fontSize: 56, fontWeight: 700, color: "#fbbf24", lineHeight: 1.1, marginBottom: 12 }}>
            {data.champion_name}
          </div>

          {/* Stats */}
          <div style={{ display: "flex", fontSize: 24, color: "#d1d5db", marginBottom: 40 }}>
            {data.champion_wins} win{data.champion_wins !== 1 ? "s" : ""} · {data.pool_size} cards
          </div>

          {/* Runner-ups */}
          <div style={{ display: "flex", gap: 16 }}>
            {runnerUps.map((r: GauntletResultEntry, i: number) => (
              <div
                key={r.illustration_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "rgba(17,24,39,0.8)",
                  borderRadius: 12,
                  padding: "10px 16px",
                }}
              >
                <img
                  src={artCropUrl(r.set_code, r.collector_number, null)}
                  width={48}
                  height={48}
                  style={{ borderRadius: 6, objectFit: "cover" }}
                />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 16, color: "#e5e7eb", fontWeight: 600 }}>
                    #{i + 2} {data.mode === "remix" ? r.artist : r.name}
                  </span>
                  <span style={{ fontSize: 13, color: "#6b7280" }}>
                    {r.wins > 0 ? `${r.wins} win${r.wins !== 1 ? "s" : ""}` : "0 wins"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Branding */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              bottom: 30,
              right: 60,
              fontSize: 20,
              color: "#fbbf24",
              fontWeight: 700,
              opacity: 0.8,
            }}
          >
            mtg.ink
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
