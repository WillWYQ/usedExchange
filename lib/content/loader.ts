import fs from "fs/promises";
import type { Dirent } from "fs";
import path from "path";
import { siteConfig } from "@/content/config";
import { itemJsonSchema, categoryJsonSchema } from "@/lib/content/schema";
import { mapWithConcurrency } from "@/lib/utils/concurrency";
import type { Item, Category } from "@/lib/content/types";

const CONTENT_ROOT = path.join(process.cwd(), "content", "items");
const IMAGE_EXT = /\.(jpg|jpeg|png|webp|gif)$/i;

// FIX Perf/Edge: cap the fan-out so a large catalogue can't exhaust the process
// file-descriptor limit (EMFILE). Worst-case in-flight FDs ≈
// CATEGORY_PARSE_CONCURRENCY × ITEM_PARSE_CONCURRENCY, kept well under the
// default ulimit on both macOS (256) and Linux (1024). See
// lib/utils/concurrency.ts for why a plain Promise.all is unsafe at scale.
const CATEGORY_PARSE_CONCURRENCY = 6;
const ITEM_PARSE_CONCURRENCY = 24;
const MANIFEST_PATH = path.join(
  process.cwd(),
  "lib",
  "generated",
  "image-manifest.json",
);

// ── Manifest cache ────────────────────────────────────────────────────────────
// FIX Arch 2: cache the Promise itself, not its resolved value.
// Caching the resolved value leaves a window where two concurrent awaits both
// see `null` and each trigger a separate fs.readFile call.  Caching the Promise
// means all concurrent callers share the same in-flight read.
let manifestPromise: Promise<Record<string, string>> | null = null;

async function getManifest(): Promise<Record<string, string>> {
  if (!manifestPromise) {
    manifestPromise = fs
      .readFile(MANIFEST_PATH, "utf-8")
      .then((content) => JSON.parse(content) as Record<string, string>)
      .catch((err: unknown) => {
        // ENOENT (no manifest yet — e.g. local dev before the first
        // `pnpm upload-images` run) is expected and silent. Anything else —
        // most importantly a JSON.parse syntax error from a corrupted
        // manifest — degrades EVERY item's image to its local fallback path
        // for the rest of the process (manifestPromise is memoized for the
        // build's lifetime), so it must be visible in the build log rather
        // than silently producing a site full of broken images.
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code !== "ENOENT") {
          console.warn(
            `[loader] image-manifest.json could not be read or parsed (${String(err)}); ` +
              `falling back to local image paths for all items. If this is a production ` +
              `build with a CDN provider, images will appear broken — re-run ` +
              `"pnpm upload-images" and commit the regenerated manifest.`,
          );
        }
        return {} as Record<string, string>;
      });
  }
  return manifestPromise;
}

/** Resets the manifest cache. Call in tests or after running pnpm upload-images. */
export function resetManifestCache(): void {
  manifestPromise = null;
}

function resolveImageUrl(
  manifest: Record<string, string>,
  key: string,
): string {
  return manifest[key] ?? `/items/${key}`;
}

// ── Visibility helpers ────────────────────────────────────────────────────────

// Returns true when a sold item is still within its retention window.
// FIX Bug 1: explicit guard for retention < 0 ("hide immediately") so that
// no code path can accidentally display a sold item.
// Previous bug: when retention === -1, a future-dated soldDate produced a
// negative daysDiff which satisfied `daysDiff <= -1`, showing the item.
// The secondary `daysDiff >= 0` guard now prevents any future-dated item
// (whether sold_date was set to a future value intentionally or not) from
// appearing in visible listings.
function isSoldItemVisible(item: Item): boolean {
  const retention = siteConfig.soldItemRetentionDays;
  if (retention === 0) return true;   // keep forever
  if (retention < 0) return false;   // -1 = hide immediately; covers all negative values

  // FIX Edge L3: when sold_date is absent we have no basis to expire the item.
  // Falling back to listedDate (the previous behaviour) would instantly hide a
  // recently-sold *old* listing flipped to "sold" by hand without a sold_date —
  // the seller sees the item vanish and assumes data loss. `pnpm mark-sold`
  // always writes sold_date; this only affects manual edits, where keeping the
  // item visible until a date is supplied is the safe, non-surprising default.
  if (!item.soldDate) return true;

  const soldMs = Date.parse(item.soldDate + "T00:00:00Z");
  // Unparseable date: conservatively hide rather than expose stale items.
  if (isNaN(soldMs)) return false;

  const today = new Date().toISOString().slice(0, 10);
  const todayMs = Date.parse(today + "T00:00:00Z");
  const daysDiff = (todayMs - soldMs) / 86_400_000;

  // daysDiff < 0 means soldDate is in the future — hide those too.
  return daysDiff >= 0 && daysDiff <= retention;
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
  buildDate: string,
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
    return buildItem(categorySlug, itemSlug, recovered.data, itemDir, manifest, buildDate);
  }

  return buildItem(categorySlug, itemSlug, result.data, itemDir, manifest, buildDate);
}

async function buildItem(
  categorySlug: string,
  itemSlug: string,
  parsed: ReturnType<typeof itemJsonSchema.parse>,
  itemDir: string,
  manifest: Record<string, string>,
  buildDate: string,
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

  // CI builders only have item.json checked out; image files live on the CDN.
  // When readdir finds nothing, derive filenames from manifest keys so images
  // resolve correctly without the local files being present.
  if (filenames.length === 0) {
    const prefix = `${categorySlug}/${itemSlug}/`;
    filenames = Object.keys(manifest)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length))
      .filter((f) => IMAGE_EXT.test(f))
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
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

    listedDate: parsed.listed_date ?? buildDate,
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

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Parses all items in a single category directory without applying any
 * visibility filter.  Null results (missing item.json or empty name) are
 * removed; every other status (draft, sold, available…) is preserved.
 *
 * This is the single source of truth for directory traversal within a category.
 * Both `loadItemsByCategory` and `loadAllItemsRaw` delegate to this function
 * so directory-reading logic is never duplicated.
 */
async function parseCategory(
  categorySlug: string,
  manifest: Record<string, string>,
  buildDate: string,
): Promise<Item[]> {
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

  const items = await mapWithConcurrency(
    itemFolders,
    ITEM_PARSE_CONCURRENCY,
    (e) => parseItem(categorySlug, e.name, manifest, buildDate),
  );

  return items.filter((item): item is Item => item !== null);
}

// ── Public API ────────────────────────────────────────────────────────────────

// ── Category builder (private) ────────────────────────────────────────────────

/**
 * Builds Category objects from a pre-parsed item list.
 * Reads only _category.json files — does NOT re-parse item.json.
 * This is the single source of category-building logic; both loadCategories()
 * and loadHomePageData() delegate here to avoid duplicate item parses.
 */
async function buildCategoriesFromItems(
  slugs: string[],
  allItems: Item[],
): Promise<Category[]> {
  // Group visible items by categorySlug (single pass, O(n))
  const byCategory = new Map<string, Item[]>();
  for (const slug of slugs) byCategory.set(slug, []);
  for (const item of allItems) {
    if (isItemVisible(item)) {
      byCategory.get(item.categorySlug)?.push(item);
    }
  }

  const categories = await Promise.all(
    slugs.map(async (slug) => {
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

      const visibleItems = byCategory.get(slug) ?? [];
      const availableItems = visibleItems.filter((i) => i.status === "available");

      // FIX Bug 3: sort by itemSlug before selecting the cover image so the
      // result is deterministic across OS/filesystem implementations.
      const sortedAvailable = [...availableItems].sort((a, b) =>
        a.itemSlug.localeCompare(b.itemSlug),
      );

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
        coverImage: sortedAvailable[0]?.coverImage ?? null,
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
 * Names of every category directory under content/items/, in filesystem order
 * (display ordering is applied later by buildCategoriesFromItems). Filters out
 * `_`-prefixed directories (drafts/scratch dirs) and non-directory entries.
 * Never throws; returns [] when content/items/ is missing.
 */
async function listCategorySlugs(): Promise<string[]> {
  let entries: Dirent<string>[];
  try {
    entries = await fs.readdir(CONTENT_ROOT, {
      withFileTypes: true,
      encoding: "utf8",
    });
  } catch {
    return [];
  }

  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * All valid categories in display order (DESIGN.md §6 sort logic).
 * Never throws; returns [] when content/items/ is missing.
 */
export async function loadCategories(): Promise<Category[]> {
  const slugs = await listCategorySlugs();
  const allItems = await loadAllItemsRaw();
  return buildCategoriesFromItems(slugs, allItems);
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
  // Computed once per call so every item parsed in this pass falls back to the
  // same `listedDate` — previously recomputed per item, which could assign
  // different dates to items parsed just before/after local midnight UTC
  // during a long build, producing nondeterministic sort order.
  const buildDate = new Date().toISOString().slice(0, 10);
  const items = await parseCategory(categorySlug, resolvedManifest, buildDate);
  return items.filter(isItemVisible);
}

/**
 * A single VISIBLE item, or null if the folder/item.json is missing, the name is
 * empty, OR the item must not be shown (draft, or sold past its retention window).
 * Never throws.
 *
 * FIX Sec/Arch L1: this previously returned the raw parsed item with no
 * visibility filter, so any caller that rendered with it would leak drafts and
 * expired-sold items. The visibility check is now applied here, matching
 * loadItemsByCategory, so loadItem is safe to use directly in a render path.
 */
export async function loadItem(
  categorySlug: string,
  itemSlug: string,
): Promise<Item | null> {
  const manifest = await getManifest();
  const buildDate = new Date().toISOString().slice(0, 10);
  const item = await parseItem(categorySlug, itemSlug, manifest, buildDate);
  return item && isItemVisible(item) ? item : null;
}

/**
 * All parsed items across every category, with no visibility filter applied.
 * Draft, sold, pending, reserved, and available items are all included.
 * Null results (missing item.json or blank name) are removed.
 *
 * FIX Arch 1 / Perf 1: this function is the shared single-pass foundation for
 * loadAllItems, loadSoldItems, and buildSearchIndex.  It replaces the previous
 * pattern of calling loadCategories() (which internally loads all items for
 * stats) and then calling loadItemsByCategory() a second time — an O(2n) item
 * parse that doubled fs.readFile and JSON.parse calls on every build.
 *
 * All category directories are processed concurrently via Promise.all.
 *
 * ⚠️  Do NOT use in UI components — use loadItemsByCategory() which applies
 * the correct visibility filter for each rendering context.
 */
export async function loadAllItemsRaw(): Promise<Item[]> {
  const manifest = await getManifest();
  // See loadItemsByCategory — computed once so every item across every
  // category in this concurrent pass shares one fallback `listedDate`.
  const buildDate = new Date().toISOString().slice(0, 10);

  const slugs = await listCategorySlugs();

  const allItemArrays = await mapWithConcurrency(
    slugs,
    CATEGORY_PARSE_CONCURRENCY,
    (slug) => parseCategory(slug, manifest, buildDate),
  );

  return allItemArrays.flat();
}

/**
 * Recently listed items for the home page strip ONLY.
 * Filters: status === "available".
 * Sorted by listedDate desc, capped at siteConfig.recentlyListedCount.
 *
 * FIX Arch 1: previously called loadCategories() + loadItemsByCategory() per
 * category — O(2n) item parses, sequential for-of loop.  Now calls
 * loadAllItemsRaw() once: single pass, fully concurrent.
 *
 * ⚠️  Do NOT use for the /all page — use loadItemsByCategory() per category.
 */
export async function loadAllItems(): Promise<Item[]> {
  const all = await loadAllItemsRaw();
  return all
    .filter((i) => i.status === "available")
    .sort((a, b) => b.listedDate.localeCompare(a.listedDate))
    .slice(0, siteConfig.recentlyListedCount);
}

/**
 * All sold items for the /sold archive page.
 * No retention filter — shows every item with status "sold".
 * Sorted by soldDate desc (falls back to listedDate when soldDate absent).
 *
 * FIX Arch 1: previously called loadCategories() (O(n) parse) then re-read
 * every category directory sequentially.  Now calls loadAllItemsRaw() once:
 * single pass, fully concurrent, eliminates the intermediate category step.
 */
export async function loadSoldItems(): Promise<Item[]> {
  const all = await loadAllItemsRaw();
  return all
    .filter((i) => i.status === "sold")
    .sort((a, b) => {
      const aDate = a.soldDate ?? a.listedDate;
      const bDate = b.soldDate ?? b.listedDate;
      return bDate.localeCompare(aDate);
    });
}

/**
 * Single-pass loader for the /all (Browse All) page.
 * Parses every item exactly once, then derives both the visible cross-category
 * item list and the category metadata (for the header count) — eliminating the
 * double parse that occurred when page.tsx called loadCategories() and then
 * loadItemsByCategory() per category.
 *
 * Do NOT use loadAllItems() — that returns "available" only, capped at
 * recentlyListedCount. This page needs all non-draft, non-expired-sold items.
 *
 * Use this in app/all/page.tsx instead of loadCategories() + loadItemsByCategory().
 */
export async function loadBrowseAllPageData(): Promise<{
  items: Item[];
  categories: Category[];
}> {
  const slugs = await listCategorySlugs();
  const allItems = await loadAllItemsRaw();

  const [categories, items] = await Promise.all([
    buildCategoriesFromItems(slugs, allItems),
    Promise.resolve(allItems.filter(isItemVisible)),
  ]);

  return { items, categories };
}

/**
 * Single-pass loader for the home page.
 * Parses every item exactly once, then derives both categories (for the grid)
 * and the recently listed strip — eliminating the double parse that occurred
 * when page.tsx called loadCategories() and loadAllItems() concurrently.
 *
 * Use this in app/page.tsx instead of Promise.all([loadCategories(), loadAllItems()]).
 */
export async function loadHomePageData(): Promise<{
  categories: Category[];
  recentItems: Item[];
}> {
  const slugs = await listCategorySlugs();

  // Single parse pass — manifest is shared via the module-level cache.
  const allItems = await loadAllItemsRaw();

  const [categories, recentItems] = await Promise.all([
    buildCategoriesFromItems(slugs, allItems),
    Promise.resolve(
      allItems
        .filter((i) => i.status === "available")
        .sort((a, b) => b.listedDate.localeCompare(a.listedDate))
        .slice(0, siteConfig.recentlyListedCount),
    ),
  ]);

  return { categories, recentItems };
}
