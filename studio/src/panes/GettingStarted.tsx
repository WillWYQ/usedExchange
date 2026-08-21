import { useCallback, useEffect, useState } from "react";
import {
  fetchReadiness,
  type ReadinessAction,
  type ReadinessItem,
  type ReadinessReport,
} from "../api";
import { Button } from "../components/Button";
import { useStudioT } from "../i18n/StudioI18n";
import type { StudioKey } from "../i18n/types";

// scripts/lib/siteReadiness.ts IDs are kebab-case; dictionary key segments
// are camelCase to match the rest of the Studio key namespace.
const READINESS_ID_TO_KEY: Readonly<Record<string, string>> = {
  identity: "identity",
  "image-storage": "imageStorage",
  "first-item": "firstItem",
  "first-item-live": "firstItemLive",
  "git-ready": "gitReady",
  contact: "contact",
  translations: "translations",
  shipping: "shipping",
  aceternity: "aceternity",
  "config-parse": "configParse",
  "flyer-cors": "flyerCors",
};

function localizedTitle(t: (key: StudioKey, params?: Record<string, string | number>) => string, item: ReadinessItem): string {
  const segment = READINESS_ID_TO_KEY[item.id];
  if (segment === undefined) return item.title;
  const key = `readiness.${segment}.title` as StudioKey;
  const translated = t(key);
  return translated === key ? item.title : translated;
}

function localizedDetail(t: (key: StudioKey, params?: Record<string, string | number>) => string, item: ReadinessItem): string {
  const segment = READINESS_ID_TO_KEY[item.id];
  if (segment === undefined || item.params === undefined) return item.detail;
  const key = `readiness.${segment}.${item.params.variant}` as StudioKey;
  const translated = t(key, item.params as Record<string, string | number>);
  return translated === key ? item.detail : translated;
}

/**
 * The first-run checklist: what a new site is still missing and where to fix
 * each item. Rendered inline above the item table — it is guidance, not a
 * modal, so it never traps focus or blocks what the seller was doing.
 *
 * The judgement itself lives in scripts/lib/siteReadiness.ts, shared with
 * `pnpm setup-check`, so the browser and the terminal can never disagree.
 */

function ActionControl({
  action,
  onOpenConfig,
  onNewItem,
}: {
  action: ReadinessAction;
  onOpenConfig: () => void;
  onNewItem: () => void;
}) {
  const { t } = useStudioT();
  switch (action.kind) {
    case "pane":
      return <Button onClick={onOpenConfig}>{t("gettingStarted.openConfig")}</Button>;
    case "studio":
      return <Button onClick={onNewItem}>{t("gettingStarted.newItem")}</Button>;
    case "command":
      return <code className="gs-command">{action.command}</code>;
    case "docs":
      return (
        <a href={action.doc} target="_blank" rel="noreferrer">
          {action.doc}
        </a>
      );
  }
}

function Row({
  item,
  onOpenConfig,
  onNewItem,
}: {
  item: ReadinessItem;
  onOpenConfig: () => void;
  onNewItem: () => void;
}) {
  const { t } = useStudioT();
  return (
    <li className="gs-row">
      {/* The glyph is decorative; the state is spelled out for screen readers
          and never carried by colour or shape alone. */}
      <span className="gs-status" aria-hidden="true">
        {item.done ? "✓" : "○"}
      </span>
      <span className="visually-hidden">
        {item.done ? t("gettingStarted.done") : t("gettingStarted.stillToDo")}
      </span>
      <span className="gs-body">
        <span className="gs-title">{localizedTitle(t, item)}</span>
        <span className="gs-detail">{localizedDetail(t, item)}</span>
      </span>
      {!item.done && item.action !== undefined && (
        <span className="gs-action">
          <ActionControl action={item.action} onOpenConfig={onOpenConfig} onNewItem={onNewItem} />
        </span>
      )}
    </li>
  );
}

export function GettingStarted({
  open,
  onToggle,
  onOpenConfig,
  onNewItem,
  onReport,
}: {
  open: boolean;
  onToggle: () => void;
  onOpenConfig: () => void;
  onNewItem: () => void;
  /** Lets App auto-open the panel the first time a site turns out unready. */
  onReport: (report: ReadinessReport) => void;
}) {
  const { t } = useStudioT();
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await fetchReadiness();
    setReport(next);
    onReport(next);
  }, [onReport]);

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [load]);

  if (error !== null) {
    return (
      <section className="getting-started">
        <p role="alert" className="alert-error">
          {error}
        </p>
      </section>
    );
  }

  if (report === null) {
    return (
      <section className="getting-started" aria-busy="true" aria-label={t("gettingStarted.loading")}>
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </section>
    );
  }

  const core = report.items.filter((i) => i.tier === 1);
  const advanced = report.items.filter((i) => i.tier === 2);

  // Once the core path is done the checklist stops competing for attention:
  // one line, still openable from the header for anyone who wants to look.
  if (!open) {
    return (
      <section className="getting-started gs-collapsed">
        <span>
          {report.allTier1Done
            ? t("gettingStarted.allSet")
            : t("gettingStarted.progress", { done: report.tier1Done, total: report.tier1Total })}
        </span>
        <Button variant="ghost" onClick={onToggle}>
          {t("gettingStarted.showChecklist")}
        </Button>
      </section>
    );
  }

  return (
    <section className="getting-started" aria-label="Getting started checklist">
      <div className="gs-head">
        <h2>{t("gettingStarted.title", { done: report.tier1Done, total: report.tier1Total })}</h2>
        <Button variant="ghost" onClick={onToggle}>
          {t("gettingStarted.hide")}
        </Button>
      </div>

      <ul className="gs-list">
        {core.map((item) => (
          <Row key={item.id} item={item} onOpenConfig={onOpenConfig} onNewItem={onNewItem} />
        ))}
      </ul>

      {advanced.length > 0 && (
        <details className="gs-advanced">
          <summary>{t("gettingStarted.advanced")}</summary>
          <ul className="gs-list">
            {advanced.map((item) => (
              <Row key={item.id} item={item} onOpenConfig={onOpenConfig} onNewItem={onNewItem} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
