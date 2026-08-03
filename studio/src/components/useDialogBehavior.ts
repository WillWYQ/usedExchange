import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Modal dialog behaviour: initial focus, a Tab focus trap, Escape to close,
// and focus restored to the trigger on unmount. Attach the returned ref to
// the dialog's root element (the role="dialog" node).
//
// Escape-stacking convention: a dismissible layer calls e.preventDefault()
// when it consumes Escape, and non-modal layers underneath check
// e.defaultPrevented before dismissing themselves. stopPropagation alone is
// not enough — both layers listen on document, and it does not suppress
// sibling listeners on the same node. The dialog listener registers on the
// capture phase so it runs before any bubble-phase listener on document
// (such as the Drawer's), no matter which one was registered first.
//
// onClose travels through a ref so an inline arrow from the parent (a fresh
// identity on every parent render) never re-runs the effect and steals focus
// back to the first field mid-edit.
export function useDialogBehavior(onClose: () => void): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const restoreTo = (document.activeElement as HTMLElement | null) ?? null;
    const node = ref.current;

    const focusables = () =>
      node === null
        ? []
        : Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (el) => !el.hasAttribute("disabled"),
          );

    focusables()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const els = focusables();
      const first = els[0];
      const last = els[els.length - 1];
      if (first === undefined || last === undefined) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      restoreTo?.focus();
    };
  }, []);

  return ref;
}
