"use client";

import { useEffect, useRef } from "react";
import { IconX } from "@tabler/icons-react";

type QRModalProps = {
  imageSrc: string;
  label: string;
  onClose: () => void;
};

// Native <dialog> — showModal() gives free Escape handling and focus trapping.
// Backdrop click is detected by comparing event.target to the dialog element itself.
export function QRModal({ imageSrc, label, onClose }: QRModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    // Capture the element that triggered the modal so focus is restored on close.
    triggerRef.current = document.activeElement;
    dialogRef.current?.showModal();
  }, []);

  function handleDialogClose() {
    onClose();
    if (triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus();
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) handleDialogClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      onClick={handleBackdropClick}
      className="m-auto max-w-sm rounded-2xl border-0 bg-background/90 p-0 text-foreground backdrop:bg-background/60 backdrop:backdrop-blur-sm"
    >
      <div className="relative flex flex-col items-center gap-4 p-6">
        <button
          onClick={handleDialogClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-1 text-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/50"
        >
          <IconX size={18} />
        </button>

        <p className="text-sm font-semibold text-foreground/80">{label}</p>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt={`${label} QR code`}
          className="h-72 w-72 rounded-lg object-contain"
        />

        <p className="text-xs text-foreground/40">Scan to connect</p>
      </div>
    </dialog>
  );
}
