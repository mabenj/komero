"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { MinusIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { useNeedMore } from "@/components/NeedMore";
import { useUndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useT } from "@/lib/i18n";

type Entry = { _id: Id<"entries">; name: string; quantity: number; stock?: number };

/** The shared Shopping List: to-buy Entries grouped by Location, then One-offs under "Other". */
export default function ListaPage() {
  const t = useT();
  const list = useQuery(api.shoppingList.get);

  if (list === undefined) return <p className="text-zinc-500">{t("common.loading")}</p>;

  const empty = list.locations.length === 0 && list.oneOffs.length === 0;
  return (
    <div className="flex flex-col gap-6">
      <AddToList />
      {empty && <p className="text-zinc-500">{t("lista.empty")}</p>}
      {list.locations.map((location) => (
        <EntryGroup key={location._id} title={location.name} entries={location.entries} />
      ))}
      {list.oneOffs.length > 0 && <EntryGroup title={t("lista.other")} entries={list.oneOffs} />}
    </div>
  );
}

/**
 * The search/add field: Products matching the text, tapped for Need More, or
 * Enter / "+ Add" for a One-off (which links itself if it names a Product).
 */
function AddToList() {
  const t = useT();
  const [text, setText] = useState("");
  const result = useQuery(api.products.search, text.trim() ? { text } : "skip");
  const addOneOff = useMutation(api.shoppingList.addOneOff);
  const needMore = useNeedMore();

  const add = () => {
    const name = text.trim();
    if (name === "") return;
    setText("");
    addOneOff({ name }).catch(() => setText((current) => current || name));
  };
  const pick = (productId: Id<"products">) => {
    setText("");
    void needMore(productId);
  };

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") add();
        }}
        placeholder={t("lista.search")}
        aria-label={t("lista.search")}
        enterKeyHint="done"
        autoComplete="off"
        className="w-full rounded-xl border border-zinc-300 bg-background px-4 py-3 text-base dark:border-zinc-700"
      />
      {result && (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {result.matches.map((product) => (
            <li key={product._id}>
              <button
                type="button"
                onClick={() => pick(product._id)}
                className="flex min-h-11 w-full items-center justify-between gap-3 py-1.5 text-left"
              >
                <span className="truncate">{product.name}</span>
                <span className="shrink-0 text-sm text-zinc-500">
                  {t("lista.stock", { stock: product.stock })}
                </span>
              </button>
            </li>
          ))}
          {result.canAdd && (
            <li>
              <button
                type="button"
                onClick={add}
                className="mt-1 min-h-11 w-full truncate rounded-xl bg-foreground px-4 py-2 text-left font-semibold text-background"
              >
                {t("lista.addOneOff", { name: result.name })}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function EntryGroup({ title, entries }: { title: string; entries: Entry[] }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {entries.map((entry) => (
          <EntryRow key={entry._id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

/** One Entry: its name (and the Product's Stock at home), a quantity stepper and delete. */
function EntryRow({ entry }: { entry: Entry }) {
  const t = useT();
  const showUndoToast = useUndoToast();
  const setQuantity = useMutation(api.shoppingList.setQuantity).withOptimisticUpdate((store, args) => {
    const list = store.getQuery(api.shoppingList.get, {});
    if (!list) return;
    const update = <E extends Entry>(e: E): E => (e._id === args.entryId ? { ...e, quantity: args.quantity } : e);
    store.setQuery(api.shoppingList.get, {}, {
      locations: list.locations.map((location) => ({ ...location, entries: location.entries.map(update) })),
      oneOffs: list.oneOffs.map(update),
    });
  });
  const remove = useMutation(api.shoppingList.remove);
  const restore = useMutation(api.shoppingList.restore);

  const deleteEntry = async () => {
    const deleted = await remove({ entryId: entry._id });
    showUndoToast(t("lista.deleted", { name: deleted.name }), () => void restore(deleted));
  };
  const buttonClass =
    "flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300 disabled:opacity-30 dark:border-zinc-700";

  return (
    <li className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate">{entry.name}</p>
        {entry.stock !== undefined && (
          <p className="truncate text-xs text-zinc-500">{t("lista.stock", { stock: entry.stock })}</p>
        )}
      </div>
      <button
        type="button"
        className={buttonClass}
        disabled={entry.quantity <= 1}
        aria-label={t("lista.decrease", { name: entry.name })}
        onClick={() => void setQuantity({ entryId: entry._id, quantity: entry.quantity - 1 })}
      >
        <MinusIcon width={20} height={20} />
      </button>
      <span className="w-8 text-center font-semibold tabular-nums">
        {t("lista.quantity", { quantity: entry.quantity })}
      </span>
      <button
        type="button"
        className={buttonClass}
        aria-label={t("lista.increase", { name: entry.name })}
        onClick={() => void setQuantity({ entryId: entry._id, quantity: entry.quantity + 1 })}
      >
        <PlusIcon width={20} height={20} />
      </button>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center text-zinc-500"
        aria-label={t("lista.delete", { name: entry.name })}
        onClick={() => void deleteEntry()}
      >
        <TrashIcon width={20} height={20} />
      </button>
    </li>
  );
}
