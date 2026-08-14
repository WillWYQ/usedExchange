import { useCallback, useEffect, useState } from "react";
import { fetchChanges, publish, type Changes } from "../api";
import { Button } from "../components/Button";
import { useStudioT } from "../i18n/StudioI18n";

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
  const { t } = useStudioT();
  const [changes, setChanges] = useState<Changes | null>(null);
  // A git-less project is not an error to shout about — studio still edits
  // files, it just can't commit them. The sniff below couples to the server
  // message's "not a git repository" phrase; a server test pins that phrase so
  // a reword there fails loudly instead of silently turning this quiet help
  // text into a red alert.
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
        result.files.length === 1
          ? t("publish.shipped", { commit: result.commit, count: result.files.length })
          : t("publish.shippedMulti", { commit: result.commit, count: result.files.length }),
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
      <h2>{t("publish.title")}</h2>
      {notAGitRepo && (
        <p>
          {t("publish.notGitRepo")}
          <code>content/</code>
          {t("publish.notGitRepoSuffix")}
        </p>
      )}
      {loadError !== null && (
        <p className="publish-error alert-error" role="alert">
          {loadError}
        </p>
      )}
      {changes !== null && changes.files.length === 0 && changes.unpushed === 0 && (
        <p className="change-empty">{t("publish.clean")}</p>
      )}
      {changes !== null && changes.files.length === 0 && changes.unpushed > 0 && (
        // A prior publish committed but its push failed (e.g. the network
        // dropped). Without this, a page reload would show "nothing to
        // publish" and disable the button while the live site stayed stale —
        // the retry path existing on the server but unreachable from here.
        <p className="change-empty">
          {changes.unpushed === 1
            ? t("publish.unpushedOne")
            : t("publish.unpushed", {
                count: changes.unpushed,
                s: "s",
                isAre: "are",
                itThem: "them",
              })}
        </p>
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
          aria-label={t("publish.commitMessage")}
          onChange={(e) => setMessage(e.target.value)}
        />
        <Button
          variant="primary"
          disabled={
            busy ||
            message.trim() === "" ||
            ((changes?.files.length ?? 0) === 0 && (changes?.unpushed ?? 0) === 0)
          }
          onClick={() => void submit()}
        >
          {busy ? t("publish.publishing") : t("publish.publish")}
        </Button>
      </div>
      {published !== null && <p className="publish-done">{published}</p>}
      {publishError !== null && (
        // pre-line: the push-failure message is multi-line and its second line
        // ("Your work is saved…") is the part that matters.
        <p className="publish-error alert-error" role="alert">
          {publishError}
        </p>
      )}
    </section>
  );
}
