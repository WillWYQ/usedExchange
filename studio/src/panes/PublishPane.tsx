import { useCallback, useEffect, useState } from "react";
import { fetchChanges, publish, type Changes } from "../api";

const DEFAULT_MESSAGE = "chore: update listings";

export function PublishPane({
  refreshToken,
  onChanges,
}: {
  // App bumps this after every item write and every sync; the pane treats any
  // change as "the list on disk may be different now".
  refreshToken: number;
  // The header needs the same count the list shows, so App owns the count and
  // the pane reports each fetch upward. The argument is null when the project
  // is not a git repository, so the header can hide the segment entirely.
  onChanges: (count: number | null) => void;
}) {
  const [changes, setChanges] = useState<Changes | null>(null);
  // A git-less project is not an error to shout about — studio still edits
  // files, it just can't commit them. The distinction is kept in state rather
  // than sniffing err.message: the server's message contains the phrase, but
  // coupling the rendering to a substring of a translated/reworded string is
  // exactly how quiet help text turns into a false alarm later.
  const [notAGitRepo, setNotAGitRepo] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [busy, setBusy] = useState(false);
  const [published, setPublished] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchChanges();
      setChanges(next);
      setNotAGitRepo(false);
      setLoadError(null);
      onChanges(next.files.length);
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : String(err);
      setChanges(null);
      if (text.includes("not a git repository")) {
        setNotAGitRepo(true);
        setLoadError(null);
      } else {
        setLoadError(text);
      }
      onChanges(null);
    }
  }, [onChanges]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function submit() {
    setBusy(true);
    setPublishError(null);
    setPublished(null);
    try {
      const result = await publish(message);
      setPublished(
        `${result.commit} — ${result.files.length} file${result.files.length === 1 ? "" : "s"} shipped`,
      );
      // The commit cleared the working tree, so the list should come back
      // empty — re-fetch rather than assume, since a failed push is the one
      // case where it wouldn't.
      await load();
    } catch (err: unknown) {
      setPublishError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="publish-pane" aria-label="Publish changes">
      <h2>Publish</h2>
      {notAGitRepo && (
        <p>
          This project is not a git repository, so studio cannot commit or push.
          Edits are still saved to <code>content/</code> — set up git to publish
          them from here.
        </p>
      )}
      {loadError !== null && (
        <p className="publish-error" role="alert">
          {loadError}
        </p>
      )}
      {changes !== null && changes.files.length === 0 && (
        <p className="change-empty">Nothing to publish — the working tree is clean.</p>
      )}
      {changes !== null && changes.files.length > 0 && (
        <ul className="change-list">
          {changes.files.map((f) => (
            <li key={f.path}>
              <span className="change-code">{f.code === "?" ? "new" : f.code}</span> {f.path}
            </li>
          ))}
        </ul>
      )}
      <div className="publish-controls">
        <input
          type="text"
          value={message}
          aria-label="Commit message"
          onChange={(e) => setMessage(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || message.trim() === "" || (changes?.files.length ?? 0) === 0}
          onClick={() => void submit()}
        >
          {busy ? "Publishing…" : "Publish"}
        </button>
      </div>
      {published !== null && <p className="publish-done">{published}</p>}
      {publishError !== null && (
        // pre-line: the push-failure message is multi-line and its second line
        // ("Your work is saved…") is the part that matters.
        <p className="publish-error" role="alert">
          {publishError}
        </p>
      )}
    </section>
  );
}
