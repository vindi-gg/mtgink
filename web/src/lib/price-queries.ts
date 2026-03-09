import { getAdminClient } from "@/lib/supabase/admin";
import type { Price, PurchaseOption } from "./types";

/** Get all prices for a specific printing */
export async function getPricesForPrinting(scryfallId: string): Promise<Price[]> {
  const { data } = await getAdminClient()
    .from("prices")
    .select("*")
    .eq("scryfall_id", scryfallId)
    .order("market_price", { ascending: true });
  return (data ?? []) as Price[];
}

/** Get purchase options for a card's illustration across marketplaces */
export async function getPurchaseOptionsForIllustration(
  illustrationId: string,
  oracleId: string
): Promise<PurchaseOption[]> {
  // Find a printing for this illustration
  const { data: printing } = await getAdminClient()
    .from("printings")
    .select("scryfall_id")
    .eq("illustration_id", illustrationId)
    .eq("oracle_id", oracleId)
    .limit(1)
    .single();

  if (!printing) return [];

  const { data } = await getAdminClient()
    .from("best_prices")
    .select("*")
    .eq("scryfall_id", printing.scryfall_id);

  return (data ?? []).map((row) => ({
    marketplace_name: row.marketplace_name,
    marketplace_display_name: row.marketplace_display_name,
    product_url: row.product_url,
    market_price: row.market_price,
    low_price: row.low_price,
    currency: row.currency,
  }));
}

/** Get the best (cheapest) price for any printing of a card */
export async function getBestPriceForCard(
  oracleId: string
): Promise<{ marketplace: string; price: number; currency: string; url: string } | null> {
  // Get all printings for this card
  const { data: printings } = await getAdminClient()
    .from("printings")
    .select("scryfall_id")
    .eq("oracle_id", oracleId);

  if (!printings || printings.length === 0) return null;

  const scryfallIds = printings.map((p) => p.scryfall_id);

  const { data } = await getAdminClient()
    .from("best_prices")
    .select("*")
    .in("scryfall_id", scryfallIds)
    .order("market_price", { ascending: true })
    .limit(1)
    .single();

  if (!data) return null;

  return {
    marketplace: data.marketplace_display_name,
    price: data.market_price,
    currency: data.currency,
    url: data.product_url,
  };
}
