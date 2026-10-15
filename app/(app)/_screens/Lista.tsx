"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Cupboard } from "@/components/Cupboard";
import { DatePrompt } from "@/components/DatePrompt";
import { usePutAwayToast } from "@/components/StockToasts";
import { CheckIcon, MinusIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { useNeedMore } from "@/components/NeedMore";
import { useUndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useT } from "@/lib/i18n";
import { lastLocation, rememberLocation } from "@/lib/remembered";
import { field, primaryButton, textLink } from "@/lib/styles";

type Entry = {
  _id: Id<"entries">;
  name: string;
  quantity: number;
  productId?: Id<"products">;
  stock?: number;
  asksForDate?: boolean;
};

/** The shared Shopping List: to-buy Entries grouped by Location, then One-offs under "Other", then the Bag. */
export default function ListaScreen() {
  const t = useT();
  const list = useQuery(api.shoppingList.get);

  if (list === undefined) return <p className="text-stone-500">{t("common.loading")}</p>;

  const empty = list.locations.length === 0 && list.oneOffs.length === 0 && list.bag.length === 0;
  return (
    <div className="flex flex-col gap-6">
      <AddToList />
      {empty && <EmptyLista />}
      {list.locations.map((location) => (
        <EntryGroup key={location._id} title={location.name} entries={location.entries} />
      ))}
      {list.oneOffs.length > 0 && <EntryGroup title={t("lista.other")} entries={list.oneOffs} />}
      {list.bag.length > 0 && <Bag entries={list.bag} />}
    </div>
  );
}

/** Nothing to buy: the cupboard and a short, friendly line. */
function EmptyLista() {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-4 text-center">
      <Cupboard />
      <h2 className="font-display text-2xl">{t("lista.emptyTitle")}</h2>
      <p className="text-stone-600 dark:text-stone-400">{t("lista.emptyHint")}</p>
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
        className={`${field} w-full px-4 py-3`}
      />
      {result && (
        <ul className="flex flex-col divide-y divide-stone-200 dark:divide-stone-800">
          {result.matches.map((product) => (
            <li key={product._id}>
              <button
                type="button"
                onClick={() => pick(product._id)}
                className="flex min-h-11 w-full items-center justify-between gap-3 py-1.5 text-left"
              >
                <span className="truncate">{product.name}</span>
                <span className="shrink-0 text-sm text-stone-500">
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
                className={`${primaryButton} mt-1 min-h-11 w-full truncate px-4 py-2 text-left`}
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
      <h2 className="font-display text-lg">{title}</h2>
      <ul className="flex flex-col divide-y divide-stone-200 dark:divide-stone-800">
        {entries.map((entry) => (
          <EntryRow key={entry._id} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

/**
 * "In the bag": Entries ticked off in the shop, put away one at a time or all
 * at once. "Put away all" first asks for a date for each Product with an Expiry Kind.
 */
function Bag({ entries }: { entries: Entry[] }) {
  const t = useT();
  const putAwayAllEntries = useMutation(api.shoppingList.putAwayAll);
  const showPutAway = usePutAwayToast();
  const putAwayAll = async (expiryDates?: Record<string, string>) => {
    const { putAway } = await putAwayAllEntries({ expiryDates });
    showPutAway(t("lista.putAwayAllDone", { count: putAway.length }), putAway);
  };
  const [prompts, setPrompts] = useState<{ asking: Entry[]; index: number; dates: Record<string, string> } | null>(
    null,
  );

  const start = () => {
    const asking = entries.filter(
      (entry, i) => entry.asksForDate && entries.findIndex((e) => e.productId === entry.productId) === i,
    );
    if (asking.length === 0) void putAwayAll();
    else setPrompts({ asking, index: 0, dates: {} });
  };
  const answer = (date: string | undefined) => {
    if (!prompts) return;
    const entry = prompts.asking[prompts.index];
    const dates = date && entry.productId ? { ...prompts.dates, [entry.productId]: date } : prompts.dates;
    if (prompts.index + 1 < prompts.asking.length) {
      setPrompts({ ...prompts, index: prompts.index + 1, dates });
      return;
    }
    setPrompts(null);
    void putAwayAll(dates);
  };

  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg">{t("lista.bag")}</h2>
        {!prompts && (
          <button
            type="button"
            onClick={start}
            className={`${primaryButton} min-h-11 px-4 py-2`}
          >
            {t("lista.putAwayAll")}
          </button>
        )}
      </div>
      {prompts && (
        <DatePrompt
          key={prompts.asking[prompts.index]._id}
          name={prompts.asking[prompts.index].name}
          step={{ index: prompts.index, count: prompts.asking.length }}
          onAnswer={answer}
          onCancel={() => setPrompts(null)}
        />
      )}
      <ul className="flex flex-col divide-y divide-stone-200 dark:divide-stone-800">
        {entries.map((entry) => (
          <EntryRow key={entry._id} entry={entry} inBag />
        ))}
      </ul>
    </section>
  );
}

const roundButton =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-300 disabled:opacity-30 dark:border-stone-700";

/**
 * One Entry: a tick toggle, its name (and the Product's Stock at home), then a
 * quantity stepper and delete on the list, or Put away in the Bag. A One-off
 * can be made into a Product.
 */
function EntryRow({ entry, inBag = false }: { entry: Entry; inBag?: boolean }) {
  const t = useT();
  const [makingProduct, setMakingProduct] = useState(false);
  const [askingDate, setAskingDate] = useState(false);
  const showUndoToast = useUndoToast();
  const setQuantity = useMutation(api.shoppingList.setQuantity).withOptimisticUpdate((store, args) => {
    const list = store.getQuery(api.shoppingList.get, {});
    if (!list) return;
    const update = <E extends Entry>(e: E): E => (e._id === args.entryId ? { ...e, quantity: args.quantity } : e);
    store.setQuery(api.shoppingList.get, {}, {
      locations: list.locations.map((location) => ({ ...location, entries: location.entries.map(update) })),
      oneOffs: list.oneOffs.map(update),
      bag: list.bag,
    });
  });
  // Ticking moves the Entry to the Bag straight away, even with a bad signal in the shop.
  const tick = useMutation(api.shoppingList.tick).withOptimisticUpdate((store, args) => {
    const list = store.getQuery(api.shoppingList.get, {});
    if (!list) return;
    const ticked = [...list.locations.flatMap((location) => location.entries), ...list.oneOffs].find(
      (e) => e._id === args.entryId,
    );
    if (!ticked) return;
    const others = <E extends Entry>(e: E) => e._id !== args.entryId;
    store.setQuery(api.shoppingList.get, {}, {
      locations: list.locations
        .map((location) => ({ ...location, entries: location.entries.filter(others) }))
        .filter((location) => location.entries.length > 0),
      oneOffs: list.oneOffs.filter(others),
      bag: [...list.bag, ticked].sort((a, b) => a.name.localeCompare(b.name, "fi")),
    });
  });
  const untick = useMutation(api.shoppingList.untick);
  const putAwayEntry = useMutation(api.shoppingList.putAway);
  const showPutAway = usePutAwayToast();
  const putAway = async (expiryDate?: string) => {
    const done = await putAwayEntry({ entryId: entry._id, expiryDate });
    showPutAway(t("lista.putAwayDone", { name: entry.name }), done.putAway);
  };
  const remove = useMutation(api.shoppingList.remove);
  const restore = useMutation(api.shoppingList.restore);

  const tickEntry = async () => {
    await tick({ entryId: entry._id });
    showUndoToast(t("lista.ticked", { name: entry.name }), () => void untick({ entryId: entry._id }));
  };
  const deleteEntry = async () => {
    const deleted = await remove({ entryId: entry._id });
    showUndoToast(t("lista.deleted", { name: deleted.name }), () => void restore(deleted));
  };

  return (
    <li className="flex flex-col gap-2 py-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`${roundButton} ${inBag ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-600" : ""}`}
          aria-label={t(inBag ? "lista.untick" : "lista.tick", { name: entry.name })}
          aria-pressed={inBag}
          onClick={() => void (inBag ? untick({ entryId: entry._id }) : tickEntry())}
        >
          {inBag && <CheckIcon width={20} height={20} />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={`truncate ${inBag ? "text-stone-500" : ""}`}>{entry.name}</p>
          {entry.stock !== undefined && (
            <p className="truncate text-xs text-stone-500">{t("lista.stock", { stock: entry.stock })}</p>
          )}
          {entry.productId === undefined && !makingProduct && (
            <button type="button" className={`${textLink} text-xs`} onClick={() => setMakingProduct(true)}>
              {t("lista.makeProduct")}
            </button>
          )}
        </div>
        {inBag ? (
          <>
            <span className="w-8 text-center font-semibold tabular-nums">
              {t("lista.quantity", { quantity: entry.quantity })}
            </span>
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-xl border border-stone-300 px-3 font-semibold dark:border-stone-700"
              aria-label={t("lista.putAwayName", { name: entry.name })}
              onClick={() => (entry.asksForDate ? setAskingDate(true) : void putAway())}
            >
              {t("lista.putAway")}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={roundButton}
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
              className={roundButton}
              aria-label={t("lista.increase", { name: entry.name })}
              onClick={() => void setQuantity({ entryId: entry._id, quantity: entry.quantity + 1 })}
            >
              <PlusIcon width={20} height={20} />
            </button>
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center text-stone-500"
              aria-label={t("lista.delete", { name: entry.name })}
              onClick={() => void deleteEntry()}
            >
              <TrashIcon width={20} height={20} />
            </button>
          </>
        )}
      </div>
      {makingProduct && <MakeProduct entry={entry} onDone={() => setMakingProduct(false)} />}
      {askingDate && (
        <DatePrompt
          name={entry.name}
          onAnswer={(expiryDate) => {
            setAskingDate(false);
            void putAway(expiryDate);
          }}
          onCancel={() => setAskingDate(false)}
        />
      )}
    </li>
  );
}

/** Turns a One-off into a Product: its name pre-filled, and a Home Location to choose. */
function MakeProduct({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const t = useT();
  const inventory = useQuery(api.inventory.get);
  const makeProduct = useMutation(api.shoppingList.makeProduct);
  const [name, setName] = useState(entry.name);
  const [pickedLocation, setPickedLocation] = useState<Id<"locations"> | null>(null);

  if (inventory === undefined) return null;
  const remembered = inventory.find((location) => location._id === lastLocation())?._id;
  const locationId = pickedLocation ?? remembered ?? inventory[0]?._id;

  const save = async () => {
    if (!locationId || name.trim() === "") return;
    await makeProduct({ entryId: entry._id, name, locationId });
    rememberLocation(locationId);
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-2 pl-13"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label={t("product.name")}
        autoComplete="off"
        autoFocus
        className={`${field} w-full px-3`}
      />
      <div className="flex items-center gap-2">
        <select
          value={locationId}
          onChange={(event) => setPickedLocation(event.target.value as Id<"locations">)}
          aria-label={t("product.homeLocation")}
          className={`${field} min-w-0 flex-1 px-3`}
        >
          {inventory.map((location) => (
            <option key={location._id} value={location._id}>
              {location.name}
            </option>
          ))}
        </select>
        <button type="button" className="min-h-11 px-3 text-stone-500" onClick={onDone}>
          {t("common.cancel")}
        </button>
        <button type="submit" className={`${primaryButton} min-h-11 px-4`}>
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}
