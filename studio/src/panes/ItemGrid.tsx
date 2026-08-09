import type { StudioItem } from "../api";
import { displayName } from "../itemDisplay";
import { ItemCard } from "./ItemCard";

export function ItemGrid({
  items,
  selectedIds,
  displayLocale,
  onToggle,
  onOpen,
}: {
  items: StudioItem[];
  selectedIds: Set<string>;
  displayLocale: string;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="item-grid" role="list">
      {items.map((item) => (
        <div key={item.id} role="listitem">
          <ItemCard
            item={item}
            displayName={displayName(item, displayLocale)}
            selected={selectedIds.has(item.id)}
            onToggle={onToggle}
            onClick={onOpen}
          />
        </div>
      ))}
    </div>
  );
}
