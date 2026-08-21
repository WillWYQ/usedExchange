import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { REQUIRED_UI_STRING_KEYS } from "./i18nRequiredKeys";
import {
  buildReadinessReport,
  type ReadinessConfig,
  type ReadinessItem,
} from "./siteReadiness";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send })),
  GetBucketCorsCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

const run = promisify(execFile);

let sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.map((d) => fs.rm(d, { recursive: true, force: true })));
  sandboxes = [];
  send.mockReset();
});

async function sandbox(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "readiness-"));
  sandboxes.push(dir);
  return dir;
}

async function writeItem(root: string, id: string, status: string): Promise<void> {
  const dir = path.join(root, "content", "items", ...id.split("/"));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "item.json"), JSON.stringify({ name: id, status }), "utf-8");
}

/** Every required key present, so translation checks pass by default. */
function fullDict(): Record<string, string> {
  return Object.fromEntries(REQUIRED_UI_STRING_KEYS.map((k) => [k, "x"]));
}

/** A config with everything configured; tests override one field at a time. */
function configuredConfig(over: Partial<ReadinessConfig> = {}): ReadinessConfig {
  return {
    name: "My Store",
    baseUrl: "https://my-real-store.example",
    imageStorage: { provider: "local" },
    contact: { platforms: [{ type: "email" }] },
    shipping: { enabled: true },
    i18n: { availableLocales: ["en"], defaultLocale: "en", translations: { en: fullDict() } },
    ...over,
  };
}

/** A freshly-cloned template: every tier-1 check should fail. */
function templateConfig(): ReadinessConfig {
  return {
    name: "UsedExchange",
    baseUrl: "https://your-domain.com",
    imageStorage: { provider: "cloudflare-r2" },
    contact: { platforms: [] },
    i18n: { availableLocales: ["en"], defaultLocale: "en", translations: { en: {} } },
  };
}

const byId = (items: ReadinessItem[], id: string): ReadinessItem => {
  const found = items.find((i) => i.id === id);
  if (found === undefined) throw new Error(`no readiness item with id ${id}`);
  return found;
};

const R2_ENV = {
  CF_R2_ACCOUNT_ID: "a",
  CF_R2_ACCESS_KEY_ID: "b",
  CF_R2_SECRET_ACCESS_KEY: "c",
  CF_R2_BUCKET: "d",
  CF_R2_PUBLIC_URL: "https://cdn.example",
};

function r2Config(over: Partial<ReadinessConfig> = {}): ReadinessConfig {
  return configuredConfig({
    imageStorage: { provider: "cloudflare-r2" },
    baseUrl: "https://shop.example.com",
    ...over,
  });
}

function errorNamed(name: string, message = name): Error {
  return Object.assign(new Error(message), { name });
}

describe("a freshly-cloned template", () => {
  it("reports every tier-1 check as not done", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(root, templateConfig(), {});

    expect(report.tier1Done).toBe(0);
    expect(report.allTier1Done).toBe(false);
    expect(byId(report.items, "identity").done).toBe(false);
    expect(byId(report.items, "image-storage").done).toBe(false);
    expect(byId(report.items, "first-item").done).toBe(false);
    expect(byId(report.items, "first-item-live").done).toBe(false);
    expect(byId(report.items, "git-ready").done).toBe(false);
    expect(byId(report.items, "contact").done).toBe(false);
  });

  it("keeps the spec's item order", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(root, templateConfig(), {});
    expect(report.items.map((i) => i.id)).toEqual([
      "identity",
      "image-storage",
      "first-item",
      "first-item-live",
      "git-ready",
      "contact",
      "translations",
      "shipping",
      "aceternity",
      "flyer-cors",
    ]);
  });

  it("counts only tier-1 items in the tier-1 totals", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(root, templateConfig(), {});
    expect(report.tier1Total).toBe(6);
    expect(report.items.filter((i) => i.tier === 1)).toHaveLength(6);
    expect(report.items.filter((i) => i.tier === 2)).toHaveLength(4);
  });
});

describe("a fully configured site", () => {
  it("reports every tier-1 check as done", async () => {
    const root = await sandbox();
    await run("git", ["init"], { cwd: root });
    await writeItem(root, "electronics/lamp", "available");

    const report = await buildReadinessReport(root, configuredConfig(), {});

    expect(report.allTier1Done).toBe(true);
    expect(report.tier1Done).toBe(report.tier1Total);
  });
});

describe("identity", () => {
  it("is not done for the template placeholder domain", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ baseUrl: "https://your-domain.com" }),
      {},
    );
    expect(byId(report.items, "identity").done).toBe(false);
  });

  it("is not done for the template's own demo deployment", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ baseUrl: "https://usedexchangeproject.willsleep.dev" }),
      {},
    );
    expect(byId(report.items, "identity").done).toBe(false);
  });

  it("is done for a real domain", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ baseUrl: "https://shop.example.com" }),
      {},
    );
    expect(byId(report.items, "identity").done).toBe(true);
  });
});

describe("image storage", () => {
  it("is always done for the local provider", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "local" } }),
      {},
    );
    expect(byId(report.items, "image-storage").done).toBe(true);
  });

  it("is done when every CF_R2 variable is present", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "cloudflare-r2" } }),
      R2_ENV,
    );
    expect(byId(report.items, "image-storage").done).toBe(true);
  });

  it("names the missing variable when one CF_R2 key is absent", async () => {
    const root = await sandbox();
    const { CF_R2_BUCKET: _omitted, ...partial } = R2_ENV;
    const report = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "cloudflare-r2" } }),
      partial,
    );
    const item = byId(report.items, "image-storage");
    expect(item.done).toBe(false);
    expect(item.detail).toContain("CF_R2_BUCKET");
  });

  it("treats an empty string as missing", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "cloudflare-r2" } }),
      { ...R2_ENV, CF_R2_BUCKET: "" },
    );
    expect(byId(report.items, "image-storage").done).toBe(false);
  });

  it("checks the blob token for vercel-blob", async () => {
    const root = await sandbox();
    const missing = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "vercel-blob" } }),
      {},
    );
    expect(byId(missing.items, "image-storage").done).toBe(false);

    const present = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "vercel-blob" } }),
      { BLOB_READ_WRITE_TOKEN: "tok" },
    );
    expect(byId(present.items, "image-storage").done).toBe(true);
  });

  it("flags an unrecognised provider by name", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "dropbox" } }),
      {},
    );
    const item = byId(report.items, "image-storage");
    expect(item.done).toBe(false);
    expect(item.detail).toContain("dropbox");
  });
});

describe("items", () => {
  it("sees an item that exists but is still a draft", async () => {
    const root = await sandbox();
    await writeItem(root, "electronics/lamp", "draft");
    const report = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(report.items, "first-item").done).toBe(true);
    expect(byId(report.items, "first-item-live").done).toBe(false);
  });

  it("counts a published item as live", async () => {
    const root = await sandbox();
    await writeItem(root, "electronics/lamp", "draft");
    await writeItem(root, "electronics/desk", "available");
    const report = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(report.items, "first-item-live").done).toBe(true);
  });

  it("survives an unparseable item.json", async () => {
    const root = await sandbox();
    const dir = path.join(root, "content", "items", "electronics", "broken");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "item.json"), "{not json", "utf-8");

    const report = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(report.items, "first-item").done).toBe(true);
    expect(byId(report.items, "first-item-live").done).toBe(false);
  });
});

describe("git", () => {
  it("is not done outside a repository", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(report.items, "git-ready").done).toBe(false);
  });

  it("is done inside a repository", async () => {
    const root = await sandbox();
    await run("git", ["init"], { cwd: root });
    const report = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(report.items, "git-ready").done).toBe(true);
  });
});

describe("translations", () => {
  it("is done when the default locale supplies every key", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(report.items, "translations").done).toBe(true);
  });

  it("is not done when an added locale has no entry at all", async () => {
    // The per-key fallback would find nothing missing here (en is complete),
    // so this case is only caught by the separate "locale has no entry" rule.
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({
        i18n: {
          availableLocales: ["en", "zh"],
          defaultLocale: "en",
          translations: { en: fullDict() },
        },
      }),
      {},
    );
    const item = byId(report.items, "translations");
    expect(item.done).toBe(false);
    expect(item.detail).toContain("zh");
  });

  it("is not done when the default locale itself is missing keys", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({
        i18n: { availableLocales: ["en"], defaultLocale: "en", translations: { en: { home: "Home" } } },
      }),
      {},
    );
    expect(byId(report.items, "translations").done).toBe(false);
  });
});

describe("tier 2 optional checks", () => {
  it("reports shipping honestly when it is disabled", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(root, configuredConfig({ shipping: undefined }), {});
    const item = byId(report.items, "shipping");
    expect(item.tier).toBe(2);
    expect(item.done).toBe(false);
    expect(item.detail).toMatch(/optional/i);
  });

  it("sees installed Aceternity components", async () => {
    const root = await sandbox();
    const before = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(before.items, "aceternity").done).toBe(false);

    await fs.mkdir(path.join(root, "components", "ui"), { recursive: true });
    await fs.writeFile(path.join(root, "components", "ui", "aurora.tsx"), "export {};", "utf-8");

    const after = await buildReadinessReport(root, configuredConfig(), {});
    expect(byId(after.items, "aceternity").done).toBe(true);
  });
});

describe("flyer CORS", () => {
  it("is not applicable for the local provider", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(root, configuredConfig(), {});
    const item = byId(report.items, "flyer-cors");
    expect(item.tier).toBe(2);
    expect(item.done).toBe(true);
    expect(item.params).toEqual({ variant: "not-applicable" });
    expect(send).not.toHaveBeenCalled();
  });

  it("is not applicable for the vercel-blob provider", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(
      root,
      configuredConfig({ imageStorage: { provider: "vercel-blob" } }),
      {},
    );
    const item = byId(report.items, "flyer-cors");
    expect(item.done).toBe(true);
    expect(item.params).toEqual({ variant: "not-applicable" });
    expect(send).not.toHaveBeenCalled();
  });

  it("reports needs-credentials without calling R2 when a variable is missing", async () => {
    const root = await sandbox();
    const { CF_R2_BUCKET: _omitted, ...partial } = R2_ENV;
    const report = await buildReadinessReport(root, r2Config(), partial);
    const item = byId(report.items, "flyer-cors");
    expect(item.done).toBe(false);
    expect(item.params).toEqual({ variant: "needs-credentials" });
    expect(item.action).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it("is done when the bucket already allows the site's origin", async () => {
    const root = await sandbox();
    send.mockResolvedValueOnce({
      CORSRules: [{ AllowedOrigins: ["https://shop.example.com"], AllowedMethods: ["GET"] }],
    });
    const report = await buildReadinessReport(root, r2Config(), R2_ENV);
    const item = byId(report.items, "flyer-cors");
    expect(item.done).toBe(true);
    expect(item.params).toEqual({ variant: "ok" });
  });

  it("is not done when the bucket's CORS rules don't cover the site's origin", async () => {
    const root = await sandbox();
    send.mockResolvedValueOnce({
      CORSRules: [{ AllowedOrigins: ["https://other.example"], AllowedMethods: ["GET"] }],
    });
    const report = await buildReadinessReport(root, r2Config(), R2_ENV);
    const item = byId(report.items, "flyer-cors");
    expect(item.done).toBe(false);
    expect(item.params).toEqual({ variant: "missing", origin: "https://shop.example.com" });
    expect(item.action).toEqual({ kind: "command", command: "pnpm configure-image-cors" });
  });

  it("treats NoSuchCORSConfiguration as no rules yet, not a crash", async () => {
    const root = await sandbox();
    send.mockRejectedValueOnce(errorNamed("NoSuchCORSConfiguration"));
    const report = await buildReadinessReport(root, r2Config(), R2_ENV);
    const item = byId(report.items, "flyer-cors");
    expect(item.done).toBe(false);
    expect(item.params).toEqual({ variant: "missing", origin: "https://shop.example.com" });
  });

  it("reports unknown instead of throwing on an unrelated API error", async () => {
    const root = await sandbox();
    send.mockRejectedValueOnce(errorNamed("AccessDenied", "not authorized"));
    const report = await buildReadinessReport(root, r2Config(), R2_ENV);
    const item = byId(report.items, "flyer-cors");
    expect(item.done).toBe(false);
    expect(item.params).toEqual({ variant: "unknown", message: "not authorized" });
    // one item's live-API failure must not take the rest of the report down
    expect(byId(report.items, "identity").done).toBe(true);
  });
});

describe("a config that failed to load", () => {
  it("reports a single actionable finding instead of throwing", async () => {
    const root = await sandbox();
    const report = await buildReadinessReport(root, null, {});

    expect(report.items).toHaveLength(1);
    expect(report.items[0]?.id).toBe("config-parse");
    expect(report.items[0]?.done).toBe(false);
    expect(report.items[0]?.tier).toBe(1);
    expect(report.tier1Total).toBe(1);
    expect(report.allTier1Done).toBe(false);
    expect(report.items[0]?.action).toEqual({ kind: "command", command: "pnpm type-check" });
  });
});

describe("the report never writes anything", () => {
  it("leaves the project directory untouched", async () => {
    const root = await sandbox();
    await writeItem(root, "electronics/lamp", "available");
    const before = (await fs.readdir(root, { recursive: true })).sort();

    await buildReadinessReport(root, configuredConfig(), {});

    const after = (await fs.readdir(root, { recursive: true })).sort();
    expect(after).toEqual(before);
  });
});

describe("the inlined template domains stay in sync with templateStatus.ts", () => {
  it("matches the constants the site itself keys off", async () => {
    // siteReadiness inlines these two strings so a broken content/config.ts
    // cannot crash the checklist at module-load time (templateStatus.ts imports
    // the config). That duplication is only safe if it cannot drift, so read
    // the real source and compare.
    const source = await fs.readFile(
      path.join(process.cwd(), "lib/utils/templateStatus.ts"),
      "utf-8",
    );
    const placeholder = /PLACEHOLDER_DOMAIN\s*=\s*"([^"]+)"/.exec(source)?.[1];
    const demo = /DEMO_DOMAIN\s*=\s*"([^"]+)"/.exec(source)?.[1];
    expect(placeholder).toBe("your-domain.com");
    expect(demo).toBe("usedexchangeproject.willsleep.dev");

    // And prove readiness actually treats both as "still the template".
    const root = await sandbox();
    for (const domain of [placeholder, demo]) {
      const report = await buildReadinessReport(
        root,
        configuredConfig({ baseUrl: `https://${domain}` }),
        {},
      );
      expect(byId(report.items, "identity").done).toBe(false);
    }
  });
});
