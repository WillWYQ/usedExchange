import { useEffect, useState } from "react";
import type { StudioItem } from "../api";
import { Button } from "../components/Button";
import { EditForm } from "./EditForm";
import { ImagePane } from "./ImagePane";

export function Drawer({
  item,
  onClose,
  onChanged,
}: {
  item: StudioItem;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"photos" | "details">("photos");
  // Visited tabs stay mounted. Rendering only the active one used to throw a
  // half-typed edit away the moment the seller clicked Photos to check an
  // image — silently, with nothing to undo it. Still lazy on first open, so
  // a drawer whose Details tab is never opened costs no field fetch.
  const [visited, setVisited] = useState<ReadonlySet<string>>(new Set(["photos"]));
  const [dirtyCount, setDirtyCount] = useState(0);

  function open(next: "photos" | "details") {
    setTab(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set([...prev, next])));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // A dialog layered on top consumes Escape and calls preventDefault
      // (see useDialogBehavior); bail so one Esc doesn't close both.
      if (e.defaultPrevented) return;
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside className="drawer" aria-label={`${item.name} — item editor`}>
      <header className="drawer-head">
        <h2>{item.name}</h2>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </header>

      <div className="drawer-tabs" role="tablist">
        {(["photos", "details"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "tab tab-active" : "tab"}
            onClick={() => open(name)}
          >
            {name === "photos" ? "Photos" : "Details"}
            {name === "details" && dirtyCount > 0 && (
              <>
                <span className="field-dot" aria-hidden="true">
                  ●
                </span>
                <span className="visually-hidden"> (unsaved changes)</span>
              </>
            )}
          </button>
        ))}
      </div>

      {visited.has("photos") && (
        <div className="drawer-pane" hidden={tab !== "photos"}>
          <ImagePane item={item} onChanged={onChanged} />
        </div>
      )}
      {visited.has("details") && (
        <div className="drawer-pane" hidden={tab !== "details"}>
          <EditForm id={item.id} onSaved={onChanged} onDirtyChange={setDirtyCount} />
        </div>
      )}
    </aside>
  );
}
