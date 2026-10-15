"use client";

import { motion } from "motion/react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { useEnterExit } from "@/components/motion";

/**
 * A sheet that slides up from the bottom over a dimmed background. It is a
 * native dialog opened with `showModal()`, so nothing behind it can be tapped
 * and focus stays inside it. Escape or a tap on the dimmed background calls
 * `onClose`. Render it inside `AnimatePresence`, so it slides back down.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const backdropMotion = useEnterExit({ opacity: 0 });
  const panelMotion = useEnterExit({ y: "100%" });

  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;
    element.showModal();
    // React focuses an `autoFocus` field before the dialog is open, which doesn't take, so focus it now.
    element.querySelector<HTMLElement>("input, select, textarea")?.focus();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      // Escape: slide down first; the dialog closes when it leaves the page.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className="m-0 h-full max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-foreground backdrop:bg-transparent"
    >
      <motion.div {...backdropMotion} aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <motion.div
        {...panelMotion}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[85dvh] max-w-xl flex-col gap-4 overflow-y-auto rounded-t-2xl bg-background px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </motion.div>
    </dialog>
  );
}
