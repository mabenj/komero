"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from "@/components/icons";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useT } from "@/lib/i18n";
import { cardList, field, primaryButton, secondaryButton } from "@/lib/styles";

type Location = { _id: Id<"locations">; name: string; products: unknown[] };

/** ⚙ Categories: add, rename, reorder (which sets the order of Koti's groups) and delete. */
export function LocationsSettings() {
  const t = useT();
  const locations = useQuery(api.inventory.get);
  const reorder = useMutation(api.locations.reorder).withOptimisticUpdate((store, { locationIds }) => {
    const inventory = store.getQuery(api.inventory.get, {});
    if (!inventory) return;
    const rank = (id: Id<"locations">) => locationIds.indexOf(id);
    store.setQuery(api.inventory.get, {}, [...inventory].sort((a, b) => rank(a._id) - rank(b._id)));
  });
  const [deleting, setDeleting] = useState<Id<"locations"> | null>(null);

  if (locations === undefined) return null;

  const move = (index: number, by: -1 | 1) => {
    const ids = locations.map((location) => location._id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    void reorder({ locationIds: ids });
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{t("settings.locations")}</h2>
      <ul className={cardList}>
        {locations.map((location, index) => (
          <li key={location._id} className="flex flex-col gap-2 px-2 py-1.5">
            <LocationRow
              location={location}
              canMoveUp={index > 0}
              canMoveDown={index < locations.length - 1}
              canDelete={locations.length > 1}
              onMove={(by) => move(index, by)}
              onDelete={() => setDeleting(location._id)}
            />
            {deleting === location._id && (
              <MoveProductsPrompt
                location={location}
                targets={locations.filter((other) => other._id !== location._id)}
                onDone={() => setDeleting(null)}
              />
            )}
          </li>
        ))}
      </ul>
      <AddLocation />
    </section>
  );
}

function LocationRow({
  location,
  canMoveUp,
  canMoveDown,
  canDelete,
  onMove,
  onDelete,
}: {
  location: Location;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDelete: boolean;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const rename = useMutation(api.locations.rename);
  const remove = useMutation(api.locations.remove);
  const iconButton =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-600 disabled:opacity-30 dark:text-stone-300";

  const deleteOrAsk = () => {
    if (location.products.length === 0) void remove({ locationId: location._id });
    else onDelete();
  };

  return (
    <div className="flex items-center gap-1">
      <input
        // Re-mounts when the name changes on another phone, showing the new name.
        key={location.name}
        defaultValue={location.name}
        aria-label={t("locations.rename", { name: location.name })}
        enterKeyHint="done"
        autoComplete="off"
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={(event) => {
          const name = event.currentTarget.value.trim();
          if (name === "") event.currentTarget.value = location.name;
          else if (name !== location.name) void rename({ locationId: location._id, name });
        }}
        className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-base"
      />
      <button
        type="button"
        className={iconButton}
        disabled={!canMoveUp}
        aria-label={t("locations.moveUp", { name: location.name })}
        onClick={() => onMove(-1)}
      >
        <ChevronUpIcon />
      </button>
      <button
        type="button"
        className={iconButton}
        disabled={!canMoveDown}
        aria-label={t("locations.moveDown", { name: location.name })}
        onClick={() => onMove(1)}
      >
        <ChevronDownIcon />
      </button>
      <button
        type="button"
        className={`${iconButton} text-red-600 dark:text-red-400`}
        disabled={!canDelete}
        aria-label={t("locations.delete", { name: location.name })}
        onClick={deleteOrAsk}
      >
        <TrashIcon width={20} height={20} />
      </button>
    </div>
  );
}

/** "Move N Products to…?": deleting a Category that still has Products moves them first. */
function MoveProductsPrompt({
  location,
  targets,
  onDone,
}: {
  location: Location;
  targets: Location[];
  onDone: () => void;
}) {
  const t = useT();
  const remove = useMutation(api.locations.remove);
  const [target, setTarget] = useState(targets[0]?._id);
  const count = location.products.length;
  const moveProductsTo = targets.some((other) => other._id === target) ? target : targets[0]?._id;

  const moveAndDelete = async () => {
    if (!moveProductsTo) return;
    await remove({ locationId: location._id, moveProductsTo });
    onDone();
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-background p-3">
      <p>
        {count === 1
          ? t("locations.moveOne", { name: location.name })
          : t("locations.moveMany", { name: location.name, count })}
      </p>
      <select
        value={moveProductsTo}
        onChange={(event) => setTarget(event.target.value as Id<"locations">)}
        aria-label={t("locations.moveTarget")}
        className={`${field} px-2`}
      >
        {targets.map((other) => (
          <option key={other._id} value={other._id}>
            {other.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className={`${secondaryButton} flex-1 py-3`}
        >
          {t("locations.cancel")}
        </button>
        <button
          type="button"
          onClick={() => void moveAndDelete()}
          className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white"
        >
          {t("locations.moveAndDelete")}
        </button>
      </div>
    </div>
  );
}

function AddLocation() {
  const t = useT();
  const create = useMutation(api.locations.create);
  const [name, setName] = useState("");

  const add = async () => {
    if (name.trim() === "") return;
    await create({ name });
    setName("");
  };

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("locations.newName")}
        aria-label={t("locations.newName")}
        enterKeyHint="done"
        autoComplete="off"
        className={`${field} min-w-0 flex-1 px-3`}
      />
      <button
        type="submit"
        disabled={name.trim() === ""}
        className={`${primaryButton} px-4`}
      >
        {t("locations.add")}
      </button>
    </form>
  );
}
