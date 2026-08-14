import { useState } from "react";
import { streamSync } from "../api";
import { Button } from "../components/Button";
import { useStudioT } from "../i18n/StudioI18n";

export function SyncBar({ onFinished }: { onFinished: () => void }) {
  const { t } = useStudioT();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function push() {
    setRunning(true);
    setError(null);
    setStatus(t("sync.starting"));
    try {
      for await (const evt of streamSync()) {
        if (evt.event === "progress") {
          const d = evt.data;
          setStatus(
            d.type === "scanned"
              ? t("sync.found", { count: d.total ?? 0 })
              : t("sync.progress", {
                  completed: d.completed ?? 0,
                  total: d.total ?? 0,
                  manifestKey: d.manifestKey ?? "",
                }),
          );
        } else if (evt.event === "done") {
          const d = evt.data;
          // Whole premise of studio is not leaving pnpm studio: when photos
          // fail, name which ones and why right here, not just a count the
          // seller then has to go find the terminal to explain.
          const failureDetail =
            d.failures.length > 0
              ? "\n" + d.failures.map((f) => `${f.manifestKey}: ${f.error}`).join("\n")
              : "";
          setStatus(
            d.failures.length > 0
              ? t("sync.failed", {
                  uploaded: d.uploaded,
                  skipped: d.skipped,
                  failedCount: d.failures.length,
                  failureDetail,
                })
              : t("sync.done", { uploaded: d.uploaded, skipped: d.skipped }),
          );
          onFinished();
        } else {
          setError(evt.data.error);
          setStatus(null);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="sync-bar">
      <Button disabled={running} onClick={() => void push()}>
        {running ? t("sync.pushing") : t("sync.push")}
      </Button>
      {status !== null && <span className="sync-status">{status}</span>}
      {error !== null && (
        <span className="sync-error alert-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
