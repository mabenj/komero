"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, TrashIcon } from "@/components/icons";
import { NameInput } from "@/components/NameInput";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useT } from "@/lib/i18n";
import { cardList, field, primaryButton, secondaryButton } from "@/lib/styles";

type Location = { _id: Id<"locations">; name: string; products: unknown[] };

/** ⚙ Locations: add, rename, reorder (which sets the order of Koti's groups) and delete. */
export function LocationsSettings() {
  const t = useT();
  const locations = useQuery(api.inventory.get);
  const reorder = useMutation(api.locations.reorder).withOptimisticUpdate((store, { locationIds }) => {
    const inventory = store.getQuery(api.inventory.get, {});
    if (inventory) store.setQuery(api.inventory.get, {}, inOrder(inventory, locationIds));
  });
  const create = useMutation(api.locations.create);
  const rename = useMutation(api.locations.rename);
  const remove = useMutation(api.locations.remove);
  const [deleting, setDeleting] = useState<Id<"locations"> | null>(null);

  if (locations === undefined) return null;

  const move = (index: number, by: -1 | 1) => void reorder({ locationIds: swapped(locations, index, by) });

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{t("settings.locations")}</h2>
      <ul className={cardList}>
        {locations.map((location, index) => (
          <li key={location._id} className="flex flex-col gap-2 px-2 py-1.5">
            <NameRow
              name={location.name}
              renameLabel={t("locations.rename", { name: location.name })}
              onRename={(name) => void rename({ locationId: location._id, name })}
              canMoveUp={index > 0}
              canMoveDown={index < locations.length - 1}
              canDelete={locations.length > 1}
              onMove={(by) => move(index, by)}
              // An empty Location goes straight away; one with Products asks where they move first.
              onDelete={() =>
                location.products.length === 0 ? void remove({ locationId: location._id }) : setDeleting(location._id)
              }
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
      <AddName placeholder={t("locations.newName")} onAdd={(name) => create({ name })} />
    </section>
  );
}

/**
 * ⚙ Categories: add, rename, reorder (the walking order Lista follows) and
 * delete, even the last one. A deleted Category's Products are left without one.
 */
export function CategoriesSettings() {
  const t = useT();
  const categories = useQuery(api.categories.list);
  const create = useMutation(api.categories.create);
  const rename = useMutation(api.categories.rename);
  const remove = useMutation(api.categories.remove);
  const reorder = useMutation(api.categories.reorder).withOptimisticUpdate((store, { categoryIds }) => {
    const current = store.getQuery(api.categories.list, {});
    if (current) store.setQuery(api.categories.list, {}, inOrder(current, categoryIds));
  });

  if (categories === undefined) return null;

  const move = (index: number, by: -1 | 1) => void reorder({ categoryIds: swapped(categories, index, by) });

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{t("settings.categories")}</h2>
      {categories.length > 0 && (
        <ul className={cardList}>
          {categories.map((category, index) => (
            <li key={category._id} className="px-2 py-1.5">
              <NameRow
                name={category.name}
                renameLabel={t("categories.rename", { name: category.name })}
                onRename={(name) => void rename({ categoryId: category._id, name })}
                canMoveUp={index > 0}
                canMoveDown={index < categories.length - 1}
                canDelete
                onMove={(by) => move(index, by)}
                onDelete={() => void remove({ categoryId: category._id })}
              />
            </li>
          ))}
        </ul>
      )}
      <AddName placeholder={t("categories.newName")} onAdd={(name) => create({ name })} />
    </section>
  );
}

/** The rows sorted to follow `ids`, as the reorder mutations put them. */
function inOrder<T extends { _id: string }>(rows: T[], ids: T["_id"][]) {
  return [...rows].sort((a, b) => ids.indexOf(a._id) - ids.indexOf(b._id));
}

/** The rows' ids with the one at `index` moved up (-1) or down (1) one place. */
function swapped<RowId extends string>(rows: { _id: RowId }[], index: number, by: -1 | 1) {
  const ids = rows.map((row) => row._id);
  [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
  return ids;
}

/** A Location's or Category's name to edit in place, with move up, move down and delete. */
function NameRow({
  name,
  renameLabel,
  onRename,
  canMoveUp,
  canMoveDown,
  canDelete,
  onMove,
  onDelete,
}: {
  name: string;
  renameLabel: string;
  onRename: (name: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDelete: boolean;
  onMove: (by: -1 | 1) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const iconButton =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-600 disabled:opacity-30 dark:text-stone-300";

  return (
    <div className="flex items-center gap-1">
      <NameInput name={name} label={renameLabel} onRename={onRename} />
      <button
        type="button"
        className={iconButton}
        disabled={!canMoveUp}
        aria-label={t("locations.moveUp", { name })}
        onClick={() => onMove(-1)}
      >
        <ChevronUpIcon />
      </button>
      <button
        type="button"
        className={iconButton}
        disabled={!canMoveDown}
        aria-label={t("locations.moveDown", { name })}
        onClick={() => onMove(1)}
      >
        <ChevronDownIcon />
      </button>
      <button
        type="button"
        className={`${iconButton} text-red-600 dark:text-red-400`}
        disabled={!canDelete}
        aria-label={t("locations.delete", { name })}
        onClick={onDelete}
      >
        <TrashIcon width={20} height={20} />
      </button>
    </div>
  );
}

/** "Move N Products to…?": deleting a Location that still has Products moves them first. */
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

function AddName({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => Promise<unknown> }) {
  const t = useT();
  const [name, setName] = useState("");

  const add = async () => {
    if (name.trim() === "") return;
    await onAdd(name);
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
        placeholder={placeholder}
        aria-label={placeholder}
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
