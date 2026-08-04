import { useState } from "react";
import { streamSync } from "../api";
import { Button } from "../components/Button";

export function SyncBar({ onFinished }: { onFinished: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function push() {
    setRunning(true);
    setError(null);
    setStatus("Starting…");
    try {
      for await (const evt of streamSync()) {
        if (evt.event === "progress") {
          const d = evt.data;
          setStatus(
            d.type === "scanned"
              ? `Found ${d.total} photos`
              : `${d.completed} of ${d.total} — ${d.manifestKey ?? ""}`,
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
            `Pushed ${d.uploaded}, skipped ${d.skipped}` +
              (d.failures.length > 0 ? `, ${d.failures.length} failed${failureDetail}` : ""),
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
        {running ? "Pushing to CDN…" : "Push photos to CDN"}
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
