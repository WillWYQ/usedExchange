import { useState } from "react";
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
            onClick={() => setTab(name)}
          >
            {name === "photos" ? "Photos" : "Details"}
          </button>
        ))}
      </div>

      {tab === "photos" ? (
        <ImagePane item={item} onChanged={onChanged} />
      ) : (
        <EditForm id={item.id} onSaved={onChanged} />
      )}
    </aside>
  );
}
