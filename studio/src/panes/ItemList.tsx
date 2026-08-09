import { useEffect, useState } from "react";
import { IconCameraOff } from "@tabler/icons-react";
import type { StudioItem } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { coverImageUrl, displayName, formatPrice } from "../itemDisplay";

function StatusCell({ status, pressed }: { status: string; pressed: boolean }) {
  // A just-stamped row plays the SOLD stamp once, then settles into the
  // regular sold badge. 900ms lets the 260ms press animation land and hold
  // for a beat. With reduced motion the animation is off but the settle
  // still happens.
  const [settled, setSettled] = useState(!pressed);

  useEffect(() => {
    if (!pressed) {
      setSettled(true);
      return;
    }
    setSettled(false);
    const timer = window.setTimeout(() => setSettled(true), 900);
    return () => window.clearTimeout(timer);
  }, [pressed]);

  if (status === "sold" && !settled) {
    return <span className="stamp stamp-press">sold</span>;
  }
  return <StatusBadge status={status} />;
}

function Thumb({ item }: { item: StudioItem }) {
  const [error, setError] = useState(false);
  const src = coverImageUrl(item);
  if (src === null || error) {
    return (
      <span className="item-thumb-placeholder" aria-hidden>
        <IconCameraOff size={18} />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="item-thumb"
      loading="lazy"
      onError={() => setError(true)}
    />
  );
}

export function ItemList({
  items,
  selectedIds,
  failedIds,
  justStampedIds,
  displayLocale,
  onToggle,
  onToggleAll,
  onOpen,
}: {
  items: StudioItem[];
  selectedIds: Set<string>;
  failedIds: Set<string>;
  justStampedIds: Set<string>;
  displayLocale: string;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  return (
    <table className="item-table">
      <thead>
        <tr>
          <th scope="col">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onToggleAll(e.target.checked)}
              aria-label="Select all items"
            />
          </th>
          <th scope="col">Photo</th>
          <th scope="col">Name</th>
          <th scope="col">Category</th>
          <th scope="col">Status</th>
          <th scope="col">Price</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const shownName = displayName(item, displayLocale);
          return (
            <tr
              key={item.id}
              className={[
                failedIds.has(item.id) ? "failed" : "",
                selectedIds.has(item.id) ? "selected" : "",
              ]
                .filter((c) => c !== "")
                .join(" ") || undefined}
            >
              <td>
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onChange={() => onToggle(item.id)}
                  aria-label={`Select ${shownName}`}
                />
              </td>
              <td className="photo-cell">
                <Thumb item={item} />
              </td>
              <td>
                <button type="button" className="name-button" onClick={() => onOpen(item.id)}>
                  {shownName}
                </button>
              </td>
              <td className="data">{item.categorySlug}</td>
              <td>
                <StatusCell status={item.status} pressed={justStampedIds.has(item.id)} />
              </td>
              <td className="data">{formatPrice(item)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
