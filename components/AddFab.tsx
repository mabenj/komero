"use client";

import { PlusIcon } from "@/components/icons";

/**
 * The floating + in the bottom corner, for adding to what the screen shows:
 * a Product on Komero, an Entry on Kauppalista. On phones it sits above the
 * bottom bar.
 */
export function AddFab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground shadow-lg md:right-8 md:bottom-8"
    >
      <PlusIcon width={26} height={26} />
    </button>
  );
}
