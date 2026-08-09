import type { StudioItem } from "../api";
import { ItemThumb } from "../components/ItemThumb";
import { StatusBadge } from "../components/StatusBadge";
import { coverImageUrl, formatPrice } from "../itemDisplay";

export type ItemCardProps = {
  item: StudioItem;
  displayName: string;
  selected: boolean;
  onToggle: (id: string) => void;
  onClick: (id: string) => void;
};

export function ItemCard({ item, displayName, selected, onToggle, onClick }: ItemCardProps) {
  return (
    <div className="item-card">
      <label className="item-card-select">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(item.id)}
          aria-label={`Select ${displayName}`}
        />
      </label>
      <button
        type="button"
        className="item-card-main"
        aria-label={displayName}
        onClick={() => onClick(item.id)}
      >
        <div className="item-card-image">
          <ItemThumb
            src={coverImageUrl(item)}
            imgClassName="item-card-img"
            placeholderClassName="item-card-placeholder"
            iconSize={32}
          />
        </div>
        <div className="item-card-body">
          <div className="item-card-meta">
            <StatusBadge status={item.status} />
            <span className="item-card-category">{item.categorySlug}</span>
          </div>
          <h3 className="item-card-name">{displayName}</h3>
          <p className="item-card-price">{formatPrice(item)}</p>
        </div>
      </button>
    </div>
  );
}
