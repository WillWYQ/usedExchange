import { useCallback, useEffect, useState } from "react";
import {
  fetchReadiness,
  type ReadinessAction,
  type ReadinessItem,
  type ReadinessReport,
} from "../api";
import { Button } from "../components/Button";

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
  switch (action.kind) {
    case "pane":
      return <Button onClick={onOpenConfig}>Open Config</Button>;
    case "studio":
      return <Button onClick={onNewItem}>New item</Button>;
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
  return (
    <li className="gs-row">
      {/* The glyph is decorative; the state is spelled out for screen readers
          and never carried by colour or shape alone. */}
      <span className="gs-status" aria-hidden="true">
        {item.done ? "✓" : "○"}
      </span>
      <span className="visually-hidden">{item.done ? "Done: " : "Still to do: "}</span>
      <span className="gs-body">
        <span className="gs-title">{item.title}</span>
        <span className="gs-detail">{item.detail}</span>
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
      <section className="getting-started" aria-busy="true" aria-label="Loading setup status">
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
            ? "All set — your site is ready to publish."
            : `Setup: ${report.tier1Done} of ${report.tier1Total} core steps done.`}
        </span>
        <Button variant="ghost" onClick={onToggle}>
          Show checklist
        </Button>
      </section>
    );
  }

  return (
    <section className="getting-started" aria-label="Getting started checklist">
      <div className="gs-head">
        <h2>
          Getting started — {report.tier1Done} of {report.tier1Total} done
        </h2>
        <Button variant="ghost" onClick={onToggle}>
          Hide
        </Button>
      </div>

      <ul className="gs-list">
        {core.map((item) => (
          <Row key={item.id} item={item} onOpenConfig={onOpenConfig} onNewItem={onNewItem} />
        ))}
      </ul>

      {advanced.length > 0 && (
        <details className="gs-advanced">
          <summary>Advanced (optional)</summary>
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
