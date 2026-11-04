"use client";

import { PlusIcon } from "@/components/icons";

/**
 * The floating + in the bottom corner, for adding to what the screen shows:
 * a Product on Komero, an Entry on Kauppalista. It floats above the pill
 * navigation on phones, and above the Bag tray while that shows.
 */
export function AddFab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="fixed right-5 bottom-[calc(var(--nav-clearance)+var(--tray-clearance)+2rem)] z-20 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-xl md:right-8"
    >
      <PlusIcon width={26} height={26} />
    </button>
  );
}
