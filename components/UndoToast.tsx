"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useEnterExit } from "@/components/motion";
import { useT } from "@/lib/i18n";
import { undoOnceDone } from "@/lib/undoOnceDone";

/** A button shown next to Undo, such as "Add to list" on the Running Low toast. */
export type ToastAction = { label: string; run: () => void };
type Toast = { id: number; message: string; undo?: () => void; action?: ToastAction };
/** Without `undo`, the toast is a plain confirmation (e.g. a Use scan of something already Out of Stock). */
type ShowUndoToast = (message: string, undo?: () => void, action?: ToastAction) => ShownToast;
/** A toast that was shown, which can be closed or replaced as long as no newer toast has taken its place. */
export type ShownToast = { close: () => void; replace: ShowUndoToast };

const VISIBLE_MS = 5000;

const noToast: ShowUndoToast = () => ({ close: () => {}, replace: noToast });
const ShowUndoToastContext = createContext<ShowUndoToast>(noToast);

/** Shows an undo toast that outlives the page it came from (e.g. deleting on a Product page, then back to Koti). */
export const useUndoToast = () => useContext(ShowUndoToastContext);

/**
 * Shows a toast at the tap for a change sent to the server: it goes away if
 * the change fails, and its Undo waits for the change (see `undoOnceDone`).
 */
export function useChangeToast() {
  const showUndoToast = useUndoToast();
  return useCallback(
    <R,>(message: string, change: R | Promise<R>, undo: (done: R) => unknown, action?: ToastAction) => {
      const shown: ShownToast = showUndoToast(message, undoOnceDone(change, undo, () => shown.close()), action);
      return shown;
    },
    [showUndoToast],
  );
}

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const lastId = useRef(0);
  const show = useCallback<ShowUndoToast>((message, undo, action) => {
    const handleFor = (id: number): ShownToast => {
      const ifShowing = (next: Toast | null) => setToast((current) => (current?.id === id ? next : current));
      return {
        close: () => ifShowing(null),
        replace: (message, undo, action) => {
          const next = ++lastId.current;
          ifShowing({ id: next, message, undo, action });
          return handleFor(next);
        },
      };
    };
    const id = ++lastId.current;
    setToast({ id, message, undo, action });
    return handleFor(id);
  }, []);
  const close = useCallback(() => setToast(null), []);

  return (
    <ShowUndoToastContext value={show}>
      {children}
      <UndoToast toast={toast} onClose={close} />
    </ShowUndoToastContext>
  );
}

/**
 * A toast above the bottom bar (clear of the Scan button) with an Undo button,
 * and optionally one more action. It rises out of the bar and sinks back after
 * a few seconds; a newer toast takes over the same surface, so nothing
 * flickers. It waits while pressed or focused. Ignoring it does nothing.
 */
function UndoToast({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  const t = useT();
  const surfaceMotion = useEnterExit({ y: "150%", opacity: 0 });
  const contentMotion = useEnterExit({ y: 12, opacity: 0 });
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [shownId, setShownId] = useState(toast?.id);
  // A new toast starts unheld: the one being pressed or focused is gone.
  if (toast?.id !== shownId) {
    setShownId(toast?.id);
    setPressed(false);
    setFocused(false);
  }
  useCloseAfter(toast?.id, pressed || focused, onClose);

  useEffect(() => {
    if (!pressed) return;
    const release = () => setPressed(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [pressed]);

  const buttonClass = "min-h-11 shrink-0 font-semibold text-ink-accent";
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key="toast"
          {...surfaceMotion}
          role="status"
          onPointerDown={() => setPressed(true)}
          onFocus={() => setFocused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
          }}
          className="fixed inset-x-0 z-5 mx-auto flex min-h-13 max-w-md items-center overflow-hidden rounded-2xl bg-ink px-4 py-1 text-ink-foreground shadow-xl shadow-black/20"
          style={{ width: "calc(100% - 2rem)", bottom: "calc(6.5rem + env(safe-area-inset-bottom))" }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={toast.id} {...contentMotion} className="flex w-full items-center justify-between gap-4">
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
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Calls `onDone` once the toast `id` has been shown for `VISIBLE_MS`, not
 * counting the time it was `paused`. A new id starts the time again.
 */
function useCloseAfter(id: number | undefined, paused: boolean, onDone: () => void) {
  const remaining = useRef(VISIBLE_MS);

  useEffect(() => {
    remaining.current = VISIBLE_MS;
  }, [id]);

  useEffect(() => {
    if (id === undefined || paused) return;
    const started = Date.now();
    const timer = setTimeout(onDone, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - started;
    };
  }, [id, paused, onDone]);
}
