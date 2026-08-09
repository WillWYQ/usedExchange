import { useEffect, useState } from "react";
import { IconCameraOff } from "@tabler/icons-react";

// Shared between the table's Photo column and the card view's cover image:
// both need the same broken-image fallback, or a card that fails to load
// its photo shows a bare browser broken-image icon at 4:3 size while the
// table's version degrades gracefully.
export function ItemThumb({
  src,
  imgClassName,
  placeholderClassName,
  iconSize,
}: {
  src: string | null;
  imgClassName: string;
  placeholderClassName: string;
  iconSize: number;
}) {
  const [error, setError] = useState(false);

  // Reset on every new src (including a seller replacing a broken photo with
  // a working one) rather than staying stuck on the first failure it saw.
  useEffect(() => {
    setError(false);
  }, [src]);

  if (src === null || error) {
    return (
      <span className={placeholderClassName} aria-hidden>
        <IconCameraOff size={iconSize} />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className={imgClassName}
      loading="lazy"
      onError={() => setError(true)}
    />
  );
}
