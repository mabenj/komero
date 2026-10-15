"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

/** A button shown next to Undo, such as "Add to list" on the Running Low toast. */
export type ToastAction = { label: string; run: () => void };
type Toast = { id: number; message: string; undo?: () => void; action?: ToastAction };
/** Without `undo`, the toast is a plain confirmation (e.g. a scan that Put Away from the Bag). */
type ShowUndoToast = (message: string, undo?: () => void, action?: ToastAction) => void;

const VISIBLE_MS = 5000;

const ShowUndoToastContext = createContext<ShowUndoToast>(() => {});

/** Shows an undo toast that outlives the page it came from (e.g. deleting on a Product page, then back to Koti). */
export const useUndoToast = () => useContext(ShowUndoToastContext);

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const show = useCallback<ShowUndoToast>(
    (message, undo, action) => setToast({ id: Date.now(), message, undo, action }),
    [],
  );
  const close = useCallback(() => setToast(null), []);

  return (
    <ShowUndoToastContext value={show}>
      {children}
      <UndoToast toast={toast} onClose={close} />
    </ShowUndoToastContext>
  );
}

/**
 * A toast above the bottom bar with an Undo button, and optionally one more
 * action. It hides itself after a few seconds; ignoring it does nothing.
 */
function UndoToast({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  const t = useT();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;
  const buttonClass = "min-h-11 shrink-0 font-semibold text-ink-accent";
  return (
    <div
      role="status"
      className="fixed inset-x-0 z-20 mx-auto flex min-h-13 max-w-md items-center justify-between gap-4 rounded-2xl bg-ink px-4 py-1 text-ink-foreground shadow-xl shadow-black/20"
      style={{ width: "calc(100% - 2rem)", bottom: "calc(6.5rem + env(safe-area-inset-bottom))" }}
    >
      <span className="truncate">{toast.message}</span>
      <div className="flex shrink-0 items-center gap-4">
        {toast.action && (
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              toast.action!.run();
              onClose();
            }}
          >
            {toast.action.label}
          </button>
        )}
        {toast.undo && (
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              toast.undo!();
              onClose();
            }}
          >
            {t("common.undo")}
          </button>
        )}
      </div>
    </div>
  );
}
