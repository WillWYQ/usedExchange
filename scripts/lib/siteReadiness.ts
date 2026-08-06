// The one place that decides what a freshly-cloned site is still missing.
//
// Two shells consume this: `pnpm doctor` (scripts/doctor.ts) and studio's
// GET /api/readiness route. Writing the judgement once is the whole point —
// a check that lived in only one of them would give the seller two different
// answers to the same question.
//
// Read-only by construction: this module never writes a file, never mutates
// config, and never "fixes" anything. It diagnoses and points.

import { execFile } from "child_process";
import fsPromises from "fs/promises";
import path from "path";
import { promisify } from "util";
import { DEMO_DOMAIN, PLACEHOLDER_DOMAIN } from "../../lib/utils/templateStatus";
import { REQUIRED_UI_STRING_KEYS } from "./i18nRequiredKeys";

const run = promisify(execFile);

export type ReadinessTier = 1 | 2;

/** Where to go to resolve an item — each shell renders these its own way. */
export type ReadinessAction =
  | { kind: "pane"; pane: "config" }
  | { kind: "docs"; doc: string }
  | { kind: "command"; command: string }
  | { kind: "studio"; view: "new-item" };

export type ReadinessItem = {
  id: string;
  tier: ReadinessTier;
  title: string;
  /** One line describing the CURRENT state, not the desired one. */
  detail: string;
  done: boolean;
  action?: ReadinessAction;
};

export type ReadinessReport = {
  items: ReadinessItem[];
  tier1Done: number;
  tier1Total: number;
  /** Drives the studio panel's auto-open / auto-collapse. */
  allTier1Done: boolean;
};

/**
 * Only the slice of SiteConfig readiness needs. Structural, so `siteConfig`
 * satisfies it with no cast, while tests can pass a small literal.
 *
 * Config and env are injected rather than imported because importing
 * `@/content/config` would tie every unit test to the repo's real config and
 * would make the `config === null` path — a config file that failed to load —
 * impossible to exercise at all.
 */
export type ReadinessConfig = {
  name: string;
  baseUrl: string;
  imageStorage: { provider: string };
  contact: { platforms: Array<{ type: string }> };
  shipping?: { enabled: boolean };
  i18n: {
    availableLocales: string[];
    defaultLocale: string;
    translations: Record<string, Record<string, string>>;
  };
};

/**
 * Just the environment variables readiness reads. Narrower than
 * NodeJS.ProcessEnv (which this project types with a required NODE_ENV), so a
 * test can pass a bare object literal for the case it is exercising.
 */
export type ReadinessEnv = Record<string, string | undefined>;

const R2_VARS = [
  "CF_R2_ACCOUNT_ID",
  "CF_R2_ACCESS_KEY_ID",
  "CF_R2_SECRET_ACCESS_KEY",
  "CF_R2_BUCKET",
  "CF_R2_PUBLIC_URL",
] as const;

const STORAGE_DOC = "docs/setup_instruction.md";

// ── Individual checks ────────────────────────────────────────────────────────

function checkIdentity(config: ReadinessConfig): ReadinessItem {
  // Both constants come from lib/utils/templateStatus.ts, which is the single
  // source of truth for "still the template" — the site's own home page and
  // the build-time config check key off the same two strings.
  const isTemplate =
    config.baseUrl.includes(PLACEHOLDER_DOMAIN) || config.baseUrl.includes(DEMO_DOMAIN);
  return {
    id: "identity",
    tier: 1,
    title: "Site identity",
    detail: isTemplate
      ? `baseUrl is still the template value (${config.baseUrl})`
      : `baseUrl is set to ${config.baseUrl}`,
    done: !isTemplate,
    action: { kind: "pane", pane: "config" },
  };
}

function checkImageStorage(config: ReadinessConfig, env: ReadinessEnv): ReadinessItem {
  const provider = config.imageStorage.provider;
  const base = { id: "image-storage", tier: 1 as const, title: "Image storage" };
  const present = (key: string): boolean => (env[key] ?? "") !== "";

  if (provider === "local") {
    return {
      ...base,
      detail: "Local provider — photos are served from the repo, no credentials needed",
      done: true,
    };
  }

  if (provider === "cloudflare-r2") {
    const missing = R2_VARS.filter((key) => !present(key));
    return {
      ...base,
      detail:
        missing.length === 0
          ? "Cloudflare R2 credentials present"
          : `Cloudflare R2 selected, but missing: ${missing.join(", ")}`,
      done: missing.length === 0,
      action: { kind: "docs", doc: STORAGE_DOC },
    };
  }

  if (provider === "vercel-blob") {
    const ok = present("BLOB_READ_WRITE_TOKEN");
    return {
      ...base,
      detail: ok
        ? "Vercel Blob token present"
        : "Vercel Blob selected, but missing: BLOB_READ_WRITE_TOKEN",
      done: ok,
      action: { kind: "docs", doc: STORAGE_DOC },
    };
  }

  return {
    ...base,
    detail: `Unrecognised image storage provider: ${provider}`,
    done: false,
    action: { kind: "docs", doc: STORAGE_DOC },
  };
}

type ItemScan = { count: number; liveCount: number };

/**
 * Walks content/items/<category>/<item>/item.json under `projectRoot`.
 *
 * Deliberately NOT loadAllItemsRaw(): that helper resolves content/ from
 * process.cwd(), so it would ignore projectRoot entirely and quietly report on
 * the real repo while a test believed it was reading its sandbox.
 */
async function scanItems(projectRoot: string): Promise<ItemScan> {
  const itemsRoot = path.join(projectRoot, "content", "items");
  let categories: string[];
  try {
    const entries = await fsPromises.readdir(itemsRoot, { withFileTypes: true });
    categories = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return { count: 0, liveCount: 0 };
  }

  let count = 0;
  let liveCount = 0;
  for (const category of categories) {
    const categoryDir = path.join(itemsRoot, category);
    let itemDirs: string[];
    try {
      const entries = await fsPromises.readdir(categoryDir, { withFileTypes: true });
      itemDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      continue;
    }
    for (const itemDir of itemDirs) {
      const jsonPath = path.join(categoryDir, itemDir, "item.json");
      let text: string;
      try {
        text = await fsPromises.readFile(jsonPath, "utf-8");
      } catch {
        continue; // a folder with no item.json is not an item
      }
      count += 1;
      try {
        const parsed = JSON.parse(text) as { status?: unknown };
        // A malformed item.json still counts as an item the seller created —
        // it just cannot be confirmed live. Never throw here: a broken file is
        // a finding elsewhere, not a reason for the checklist to fail.
        if (typeof parsed.status === "string" && parsed.status !== "draft") liveCount += 1;
      } catch {
        // unparseable: counted above, not live
      }
    }
  }
  return { count, liveCount };
}

function checkFirstItem(scan: ItemScan): ReadinessItem {
  return {
    id: "first-item",
    tier: 1,
    title: "First item",
    detail: scan.count === 0 ? "No items yet" : `${scan.count} item(s) in content/items/`,
    done: scan.count > 0,
    action: { kind: "studio", view: "new-item" },
  };
}

function checkFirstItemLive(scan: ItemScan): ReadinessItem {
  return {
    id: "first-item-live",
    tier: 1,
    title: "First item live",
    detail:
      scan.count === 0
        ? "No items yet"
        : scan.liveCount === 0
          ? "Every item is still a draft — drafts never appear on the site"
          : `${scan.liveCount} item(s) published`,
    done: scan.liveCount > 0,
    action: { kind: "pane", pane: "config" },
  };
}

async function checkGit(projectRoot: string): Promise<ReadinessItem> {
  let isRepo = false;
  try {
    // Argument array, never a shell string — same convention as studioGit.ts.
    await run("git", ["rev-parse", "--git-dir"], { cwd: projectRoot });
    isRepo = true;
  } catch {
    isRepo = false;
  }
  return {
    id: "git-ready",
    tier: 1,
    title: "Git ready",
    detail: isRepo
      ? "Repository found"
      : "Not a git repository — `pnpm push` needs one to publish",
    done: isRepo,
    action: { kind: "command", command: "git init" },
  };
}

function checkContact(config: ReadinessConfig): ReadinessItem {
  const count = config.contact.platforms.length;
  return {
    id: "contact",
    tier: 1,
    title: "Contact info",
    detail: count === 0 ? "No contact platforms configured" : `${count} platform(s) configured`,
    done: count > 0,
    action: { kind: "pane", pane: "config" },
  };
}

function checkTranslations(config: ReadinessConfig): ReadinessItem {
  const { availableLocales, defaultLocale, translations } = config.i18n;
  const defaultDict = translations[defaultLocale] ?? {};

  let problem: string | undefined;
  for (const locale of availableLocales) {
    // Two distinct rules, mirroring check-config.ts. The absent-entry rule is
    // not redundant: with the default locale fully populated, the per-key
    // fallback below finds nothing missing, so a wholly absent locale would
    // slip through if we only counted keys.
    if (!(locale in translations)) {
      problem = `Locale "${locale}" has no translations entry`;
      break;
    }
    const dict = translations[locale] ?? {};
    const missing = REQUIRED_UI_STRING_KEYS.filter((k) => !dict[k] && !defaultDict[k]);
    if (missing.length > 0) {
      problem = `translations.${locale} is missing ${missing.length} key(s)`;
      break;
    }
  }

  return {
    id: "translations",
    tier: 2,
    title: "Translations",
    detail: problem ?? "Every enabled locale resolves all UI strings",
    done: problem === undefined,
    action: { kind: "pane", pane: "config" },
  };
}

function checkShipping(config: ReadinessConfig): ReadinessItem {
  const enabled = config.shipping?.enabled === true;
  return {
    id: "shipping",
    tier: 2,
    title: "Shipping estimates",
    detail: enabled ? "Enabled" : "Optional — not configured",
    done: enabled,
    action: { kind: "docs", doc: STORAGE_DOC },
  };
}

async function checkAceternity(projectRoot: string): Promise<ReadinessItem> {
  let installed = false;
  try {
    const entries = await fsPromises.readdir(path.join(projectRoot, "components", "ui"));
    installed = entries.some((name) => name.endsWith(".tsx"));
  } catch {
    installed = false;
  }
  return {
    id: "aceternity",
    tier: 2,
    title: "Aceternity UI",
    detail: installed ? "Components installed" : "components/ui/ not installed",
    done: installed,
    action: { kind: "command", command: "pnpm setup-ui" },
  };
}

// ── Assembly ─────────────────────────────────────────────────────────────────

function summarise(items: ReadinessItem[]): ReadinessReport {
  const tier1 = items.filter((i) => i.tier === 1);
  const tier1Done = tier1.filter((i) => i.done).length;
  return {
    items,
    tier1Done,
    tier1Total: tier1.length,
    allTier1Done: tier1Done === tier1.length,
  };
}

export async function buildReadinessReport(
  projectRoot: string,
  config: ReadinessConfig | null,
  env: ReadinessEnv,
): Promise<ReadinessReport> {
  if (config === null) {
    // Nothing else can be judged without a config, and every other check would
    // report a misleading "not done". One actionable finding beats nine wrong
    // ones. Only `pnpm doctor` can reach this: studio imports the config at
    // startup, so a broken config stops the server before any route runs.
    return summarise([
      {
        id: "config-parse",
        tier: 1,
        title: "Site config",
        detail: "content/config.ts could not be loaded — fix it before anything else",
        done: false,
        action: { kind: "command", command: "pnpm type-check" },
      },
    ]);
  }

  const scan = await scanItems(projectRoot);

  return summarise([
    checkIdentity(config),
    checkImageStorage(config, env),
    checkFirstItem(scan),
    checkFirstItemLive(scan),
    await checkGit(projectRoot),
    checkContact(config),
    checkTranslations(config),
    checkShipping(config),
    await checkAceternity(projectRoot),
  ]);
}
