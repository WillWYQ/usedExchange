import { useCallback, useEffect, useState } from "react";
import {
  deleteImage,
  fetchImages,
  reorderImages,
  uploadImage,
  type ImageEntry,
  type StudioItem,
} from "../api";

export function ImagePane({
  item,
  onClose,
  onChanged,
}: {
  item: StudioItem;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [files, setFiles] = useState<ImageEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setFiles(await fetchImages(item.id));
  }, [item.id]);

  useEffect(() => {
    refresh().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  }, [refresh]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      // The grid can now disagree with disk — a delete 404s because another
      // tab (or a stale drawer) already removed the file, or addFiles wrote
      // some photos before its trailing throw for the failed one. Resync so
      // a ghost thumbnail doesn't linger with no way to clear itself besides
      // closing and reopening the drawer. A failed refresh must not replace
      // the error above with a different one — that's the message the seller
      // actually needs to see.
      refresh().catch(() => {});
    } finally {
      setBusy(false);
      // Unconditional, not just on success: the outer table's imageCount has
      // to reflect what's really on disk even when this call ends in error —
      // addFiles can write real files before its trailing throw.
      onChanged();
    }
  }

  async function addFiles(list: FileList) {
    // One request per photo: the API takes a single file, which keeps each
    // request small and lets a failed photo report itself without taking the
    // rest of the batch down.
    await run(async () => {
      const failed: string[] = [];
      for (const file of Array.from(list)) {
        try {
          setFiles(await uploadImage(item.id, file));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          // The server's error message already names the file (it is built
          // from the same filename the browser just sent), so prefixing
          // file.name again would double it up: `photo.jpg ("photo.jpg" is
          // not an image filename…)`. Only prefix when the message doesn't
          // already say which file it's about.
          failed.push(msg.includes(file.name) ? msg : `${file.name}: ${msg}`);
        }
      }
      if (failed.length > 0) throw new Error(`Could not add ${failed.join(", ")}`);
    });
  }

  async function drop(index: number) {
    if (dragFrom === null || dragFrom === index) return;
    const next = [...files];
    const [moved] = next.splice(dragFrom, 1);
    if (moved === undefined) return;
    next.splice(index, 0, moved);
    setDragFrom(null);
    await run(async () => {
      setFiles(await reorderImages(item.id, next.map((entry) => entry.name)));
    });
  }

  return (
    <aside className="drawer" aria-label={`Photos for ${item.name}`}>
      <header className="drawer-head">
        <h2>{item.name}</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>

      {error !== null && <p role="alert">{error}</p>}

      <div
        className={dragOver ? "dropzone over" : "dropzone"}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          // A second drop while a batch is still in flight would start a
          // concurrent run(): the two setFiles sequences interleave, and
          // whichever finally() runs first clears `busy` for both. Ignore
          // the drop instead — the dropzone already looks busy (the "Choose
          // photos" input is disabled), this just makes the drop match.
          if (busy) return;
          if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
        }}
      >
        <p>Drop photos here</p>
        <label className="file-button">
          Choose photos
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            disabled={busy}
            onChange={(e) => {
              if (e.target.files !== null) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {files.length === 0 && <p>No photos yet. The listing needs at least one.</p>}

      <ol className="thumb-grid">
        {files.map((entry, index) => (
          <li
            key={entry.name}
            className={entry.editable ? "thumb" : "thumb thumb-readonly"}
            draggable={entry.editable}
            onDragStart={() => setDragFrom(index)}
            onDragEnd={() => setDragFrom(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void drop(index);
            }}
          >
            {entry.editable ? (
              <img src={`/api/items/${item.id}/images/${encodeURIComponent(entry.name)}`} alt="" />
            ) : (
              <div className="thumb-placeholder" aria-hidden="true">
                No preview
              </div>
            )}
            <span className="thumb-name">{entry.name}</span>
            {!entry.editable && (
              <p className="thumb-note">
                Studio can&apos;t work with this file&apos;s name (spaces, parentheses, or similar
                characters) — the site will still publish it. Rename it to letters, digits, and
                hyphens to manage it here.
              </p>
            )}
            <button
              type="button"
              disabled={busy || !entry.editable}
              title={entry.editable ? undefined : "Rename this file before studio can remove it"}
              onClick={() =>
                void run(async () => {
                  setFiles(await deleteImage(item.id, entry.name));
                })
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
