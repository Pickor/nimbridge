/**
 * Fetch the full Systembolaget product catalogue from susbolaget.emrik.org
 * (community-maintained daily mirror) and upsert into systembolaget_products.
 *
 * Run: npx tsx scraper/sync-systembolaget.ts
 */
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Only sync categories that appear in Catawiki alcohol auctions
const RELEVANT_CATEGORIES = new Set([
  "Sprit",           // whisky, rum, cognac, gin, vodka, ...
  "Vin",             // red / white wine
  "Mousserande vin", // champagne / sparkling
  "Rosévin",         // rosé wine
  "Starkvin",        // port, sherry, madeira, sauternes
  "Öl",              // beer
  "Cider",           // cider (unlikely on Catawiki but harmless)
]);

interface RawProduct {
  productId: string;
  productNameBold: string;
  productNameThin?: string;
  price?: number;
  volume?: number;
  categoryLevel1?: string;
  categoryLevel2?: string;
  country?: string;
  producerName?: string;
  alcoholPercentage?: number;
  vintage?: number | null;
  productNumber?: string;
  images?: { imageUrl: string }[];
  isCompletelyOutOfStock?: boolean;
}

async function main() {
  console.log("=== Sync Systembolaget products ===");
  console.log(new Date().toISOString());
  console.log();

  console.log("Fetching catalogue from susbolaget.emrik.org …");
  const res = await fetch("https://susbolaget.emrik.org/v1/products", {
    headers: { "Accept-Encoding": "gzip, deflate" },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const all = (await res.json()) as RawProduct[];
  console.log(`Total products in catalogue : ${all.length}`);

  const relevant = all.filter(
    (p) =>
      p.categoryLevel1 !== undefined &&
      RELEVANT_CATEGORIES.has(p.categoryLevel1) &&
      p.price != null &&
      p.price > 0 &&
      (p.alcoholPercentage ?? 0) >= 0.5, // exclude truly alcohol-free
  );
  console.log(`Relevant products (filtered): ${relevant.length}`);
  console.log();

  const rows = relevant.map((p) => ({
    id:              p.productId,
    name_bold:       p.productNameBold,
    name_thin:       p.productNameThin ?? null,
    price:           p.price!,
    volume:          p.volume ?? null,
    category:        p.categoryLevel1 ?? null,
    subcategory:     p.categoryLevel2 ?? null,
    country:         p.country ?? null,
    producer:        p.producerName ?? null,
    alcohol_pct:     p.alcoholPercentage ?? null,
    vintage:         p.vintage ?? null,
    product_number:  p.productNumber ?? null,
    image_url:       p.images?.[0]?.imageUrl ?? null,
    is_out_of_stock: p.isCompletelyOutOfStock ?? false,
    updated_at:      new Date().toISOString(),
  }));

  // Upsert in batches of 500
  const BATCH = 500;
  let upserted = 0;
  let errors   = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await db
      .from("systembolaget_products")
      .upsert(batch, { onConflict: "id" });

    if (error) {
      console.error(`\nBatch [${i}–${i + BATCH}] error: ${error.message}`);
      errors++;
    } else {
      upserted += batch.length;
    }
    process.stdout.write(`\r  Upserted ${upserted} / ${rows.length} …`);
  }

  console.log();
  console.log();
  console.log("=== Summary ===");
  console.log(`Total fetched : ${all.length}`);
  console.log(`Relevant      : ${relevant.length}`);
  console.log(`Upserted      : ${upserted}`);
  console.log(`Batch errors  : ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
