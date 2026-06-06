import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import { siteConfig } from "@/content/config";
import { itemJsonSchema, categoryJsonSchema } from "@/lib/content/schema";
import type { Item, Category } from "@/lib/content/types";

const CONTENT_ROOT = path.join(process.cwd(), "content", "items");
const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif)$/i;
const MANIFEST_PATH = path.join(
  process.cwd(),
  "lib",
  "generated",
  "image-manifest.json",
);

// Build-time manifest cache — read once per process
let manifestCache: Record<string, string> | null = null;

async function getManifest(): Promise<Record<string, string>> {
  if (manifestCache) return manifestCache;
  try {
    manifestCache = JSON.parse(
      await fs.readFile(MANIFEST_PATH, "utf-8"),
    ) as Record<string, string>;
  } catch {
    manifestCache = {};
  }
  return manifestCache;
}

function resolveImageUrl(
  manifest: Record<string, string>,
  key: string,
): string {
  return manifest[key] ?? `/items/${key}`;
}

// Returns true when a sold item is still within its retention window.
// `soldItemRetentionDays === 0` means keep forever.
// `soldItemRetentionDays === -1` means hide immediately.
function isSoldItemVisible(item: Item): boolean {
  const retention = siteConfig.soldItemRetentionDays;
  if (retention === 0) return true; // keep forever

  const effectiveDateStr = item.soldDate ?? item.listedDate;
  // Compute days elapsed since effective sold date (UTC midnight comparison)
  const soldMs = Date.parse(effectiveDateStr + "T00:00:00Z");
  if (isNaN(soldMs)) return true; // unparseable date → keep

  const today = new Date().toISOString().slice(0, 10);
  const todayMs = Date.parse(today + "T00:00:00Z");
  const daysDiff = (todayMs - soldMs) / 86_400_000;

  return daysDiff <= retention;
}

// Returns false for items that should never appear on any page.
function isItemVisible(item: Item): boolean {
  if (item.status === "draft") return false;
  if (item.status === "sold") return isSoldItemVisible(item);
  return true;
}

// ── Single-item parser ────────────────────────────────────────────────────────

async function parseItem(
  categorySlug: string,
  itemSlug: string,
  manifest: Record<string, string>,
): Promise<Item | null> {
  const itemDir = path.join(CONTENT_ROOT, categorySlug, itemSlug);
  const jsonPath = path.join(itemDir, "item.json");

  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(jsonPath, "utf-8"));
  } catch {
    return null;
  }

  const result = itemJsonSchema.safeParse(raw);
  if (!result.success) {
    // Log the first error; skip item when name is absent/empty
    const rawObj = typeof raw === "object" && raw !== null ? raw : {};
    const rawName = (rawObj as Record<string, unknown>)["name"];
    console.warn(
      `[loader] ${categorySlug}/${itemSlug}: schema error — ${result.error.issues[0]?.message ?? "unknown"}`,
    );
    if (!rawName || typeof rawName !== "string" || !rawName.trim()) return null;
    // Construct minimal item with just the name; all other fields use schema defaults.
    // Re-parse with name injected so Zod applies all defaults.
    const recovered = itemJsonSchema.safeParse({ name: rawName.trim() });
    if (!recovered.success) return null;
    return buildItem(categorySlug, itemSlug, recovered.data, itemDir, manifest);
  }

  return buildItem(categorySlug, itemSlug, result.data, itemDir, manifest);
}

async function buildItem(
  categorySlug: string,
  itemSlug: string,
  parsed: ReturnType<typeof itemJsonSchema.parse>,
  itemDir: string,
  manifest: Record<string, string>,
): Promise<Item> {
  // Collect and sort image filenames alphabetically (locale-aware, case-insensitive)
  let filenames: string[] = [];
  try {
    const entries = await fs.readdir(itemDir);
    filenames = entries
      .filter((f) => IMAGE_EXT.test(f))
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  } catch {
    // Item folder might not be readable in all environments
  }

  const images = filenames.map((f) =>
    resolveImageUrl(manifest, `${categorySlug}/${itemSlug}/${f}`),
  );

  // Pin `cover.*` as the thumbnail; otherwise use first alphabetical image
  const coverIdx = filenames.findIndex((f) => /^cover\./i.test(f));
  const coverImage =
    coverIdx !== -1
      ? (images[coverIdx] ?? null)
      : images.length > 0
        ? (images[0] ?? null)
        : null;

  const TODAY = new Date().toISOString().slice(0, 10);
  const currency = parsed.price.currency || siteConfig.currency;

  return {
    categorySlug,
    itemSlug,

    name: parsed.name,
    description: parsed.description,
    condition: parsed.condition,
    status: parsed.status,

    price: { ...parsed.price, currency },
    noLowball: parsed.no_lowball,
    priceReduced: parsed.price_reduced,
    previousLowestPrice: parsed.previous_lowest_price,
    minAcceptableOffer: parsed.min_acceptable_offer,

    brand: parsed.brand,
    model: parsed.model,
    ageYears: parsed.age_years,
    dimensions: parsed.dimensions ?? null,
    weight: parsed.weight ?? null,
    color: parsed.color,
    quantity: parsed.quantity,

    originalSource: parsed.original_source,
    originalLink: parsed.original_link,
    originalPrice: parsed.original_price,

    listedDate: parsed.listed_date ?? TODAY,
    soldDate: parsed.sold_date,

    preferredPayment: parsed.preferred_payment,
    contactNote: parsed.contact_note,

    stripePaymentLink: parsed.stripe_payment_link,
    venmoPaymentRequest: parsed.venmo_payment_request,

    pickupWindows: parsed.pickup_windows,
    youtubeLink: parsed.youtube_link,

    tags: parsed.tags,
    categoryOverride: parsed.category_override,

    metaDescription:
      parsed.meta_description || parsed.description.slice(0, 160),

    isbn: parsed.isbn,
    course: parsed.course,
    edition: parsed.edition,
    semesterListed: parsed.semester_listed,

    nameZh: parsed.name_zh,
    descriptionZh: parsed.description_zh,

    images,
    coverImage,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * All valid categories in display order (DESIGN.md §6 sort logic).
 * Never throws; returns [] when content/items/ is missing.
 */
export async function loadCategories(): Promise<Category[]> {
  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(CONTENT_ROOT, {
      withFileTypes: true,
      encoding: "utf8",
    });
  } catch {
    return [];
  }

  const categoryFolders = entries.filter(
    (e) => e.isDirectory() && !e.name.startsWith("_"),
  );

  const manifest = await getManifest();

  const categories = await Promise.all(
    categoryFolders.map(async (e) => {
      const slug = e.name;
      const catJsonPath = path.join(CONTENT_ROOT, slug, "_category.json");

      let catParsed = {
        display_name: "",
        description: "",
        icon: "",
        sort_order: null as number | null,
      };

      try {
        const raw = JSON.parse(await fs.readFile(catJsonPath, "utf-8"));
        const r = categoryJsonSchema.safeParse(raw);
        if (r.success) catParsed = r.data;
      } catch {
        // No _category.json → use defaults
      }

      // Load visible items to compute availableItemCount and coverImage
      const items = await loadItemsByCategory(slug, manifest);
      const availableItems = items.filter((i) => i.status === "available");

      const displayName =
        catParsed.display_name ||
        slug
          .replace(/-/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase());

      return {
        slug,
        displayName,
        description: catParsed.description,
        icon: catParsed.icon,
        sortOrder: catParsed.sort_order,
        availableItemCount: availableItems.length,
        coverImage: availableItems[0]?.coverImage ?? null,
      } satisfies Category;
    }),
  );

  // Sort: ordered group (sort_order asc, then alpha) then unordered group (alpha)
  return categories.sort((a, b) => {
    const aOrdered = a.sortOrder !== null;
    const bOrdered = b.sortOrder !== null;
    if (aOrdered && bOrdered) {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder! - b.sortOrder!;
      return a.slug.localeCompare(b.slug);
    }
    if (aOrdered) return -1;
    if (bOrdered) return 1;
    return a.slug.localeCompare(b.slug);
  });
}

/**
 * All visible items for a category (excludes draft; excludes sold past retention).
 * Accepts an optional pre-loaded manifest to avoid redundant disk reads.
 */
export async function loadItemsByCategory(
  categorySlug: string,
  manifest?: Record<string, string>,
): Promise<Item[]> {
  const resolvedManifest = manifest ?? (await getManifest());
  const catDir = path.join(CONTENT_ROOT, categorySlug);

  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(catDir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return [];
  }

  const itemFolders = entries.filter(
    (e) => e.isDirectory() && !e.name.startsWith("_"),
  );

  const items = await Promise.all(
    itemFolders.map((e) =>
      parseItem(categorySlug, e.name, resolvedManifest),
    ),
  );

  return items.filter(
    (item): item is Item => item !== null && isItemVisible(item),
  );
}

/**
 * A single item, or null if the folder/item.json is missing or name is empty.
 * Never throws.
 */
export async function loadItem(
  categorySlug: string,
  itemSlug: string,
): Promise<Item | null> {
  const manifest = await getManifest();
  return parseItem(categorySlug, itemSlug, manifest);
}

/**
 * Recently listed items for the home page strip ONLY.
 * Filters: status === "available"; excludes expired sold.
 * Sorted by listedDate desc, capped at siteConfig.recentlyListedCount.
 *
 * ⚠️  Do NOT use for the /all page — use loadItemsByCategory() per category.
 */
export async function loadAllItems(): Promise<Item[]> {
  const categories = await loadCategories();
  const manifest = await getManifest();

  const allItems: Item[] = [];
  for (const cat of categories) {
    const items = await loadItemsByCategory(cat.slug, manifest);
    allItems.push(...items.filter((i) => i.status === "available"));
  }

  return allItems
    .sort((a, b) => b.listedDate.localeCompare(a.listedDate))
    .slice(0, siteConfig.recentlyListedCount);
}

/**
 * All sold items for the /sold archive page.
 * No retention filter — shows every item with status "sold".
 * Sorted by soldDate desc (falls back to listedDate when soldDate absent).
 */
export async function loadSoldItems(): Promise<Item[]> {
  const categories = await loadCategories();
  const manifest = await getManifest();

  const soldItems: Item[] = [];

  for (const cat of categories) {
    const catDir = path.join(CONTENT_ROOT, cat.slug);
    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(catDir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      continue;
    }

    const itemFolders = entries.filter(
      (e) => e.isDirectory() && !e.name.startsWith("_"),
    );

    const items = await Promise.all(
      itemFolders.map((e) => parseItem(cat.slug, e.name, manifest)),
    );

    for (const item of items) {
      if (item && item.status === "sold") soldItems.push(item);
    }
  }

  return soldItems.sort((a, b) => {
    const aDate = a.soldDate ?? a.listedDate;
    const bDate = b.soldDate ?? b.listedDate;
    return bDate.localeCompare(aDate);
  });
}
