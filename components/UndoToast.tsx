"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useT } from "@/lib/i18n";

type Toast = { id: number; message: string; undo: () => void };
type ShowUndoToast = (message: string, undo: () => void) => void;

const VISIBLE_MS = 5000;

const ShowUndoToastContext = createContext<ShowUndoToast>(() => {});

/** Shows an undo toast that outlives the page it came from (e.g. deleting on a Product page, then back to Koti). */
export const useUndoToast = () => useContext(ShowUndoToastContext);

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const show = useCallback<ShowUndoToast>((message, undo) => setToast({ id: Date.now(), message, undo }), []);
  const close = useCallback(() => setToast(null), []);

  return (
    <ShowUndoToastContext value={show}>
      {children}
      <UndoToast toast={toast} onClose={close} />
    </ShowUndoToastContext>
  );
}

/** A toast above the bottom bar with an Undo button. It hides itself after a few seconds. */
function UndoToast({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  const t = useT();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-24 z-20 mx-auto flex max-w-md items-center justify-between gap-4 rounded-xl bg-foreground px-4 py-3 text-background shadow-lg"
      style={{ width: "calc(100% - 2rem)" }}
    >
      <span className="truncate">{toast.message}</span>
      <button
        type="button"
        className="shrink-0 font-semibold uppercase tracking-wide"
        onClick={() => {
          toast.undo();
          onClose();
        }}
      >
        {t("common.undo")}
      </button>
    </div>
  );
}
