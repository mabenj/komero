"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { CategorySelect } from "@/components/CategorySelect";
import { Combobox, type ComboboxOption, useProductSearch } from "@/components/Combobox";
import { CupboardNote } from "@/components/Cupboard";
import { DatePrompt } from "@/components/DatePrompt";
import { usePutAwayToast } from "@/components/StockToasts";
import { ChevronDownIcon, TagIcon, TrashIcon } from "@/components/icons";
import { useNeedMore } from "@/components/NeedMore";
import { NumberStepper, stepButton } from "@/components/NumberStepper";
import { useChangeToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { nameKey, tidyName } from "@/convex/productNames";
import { useT } from "@/lib/i18n";
import {
  entriesIn,
  type Groups,
  putAwayAllLocally,
  putAwayLocally,
  removeLocally,
  setCategoryLocally,
  setQuantityLocally,
  tickLocally,
  untickLocally,
} from "@/lib/listUpdates";
import { bagFolded, lastLocation, rememberBagFolded, rememberLocation } from "@/lib/remembered";
import { cardList, field, primaryButton, textLink } from "@/lib/styles";

type Entry = {
  _id: Id<"entries">;
  name: string;
  quantity: number;
  productId?: Id<"products">;
  categoryId?: Id<"categories"> | null;
  stock?: number;
  asksForDate?: boolean;
};

/** The groups to show, with their headings: the Categories with Entries, then "Other" if it has any. */
function titled(groups: Groups, other: string) {
  return [
    ...groups.categories.map(({ _id, name, entries }) => ({ key: _id as string, title: name, entries })),
    ...(groups.other.length > 0 ? [{ key: "other", title: other, entries: groups.other }] : []),
  ];
}

// How long "All put away!" shows after Put Away empties the Bag.
const ALL_PUT_AWAY_MS = 4000;

/**
 * The Product an Entry is for, or the One-off's name: the same before and
 * after the server gives a new Entry its id.
 */
const productOrOneOff = (entry: Entry) => entry.productId ?? `oneOff:${nameKey(entry.name)}`;

/**
 * The shared Shopping List: to-buy Entries grouped by Category in walking
 * order, then "Other" (Products without a Category, and One-offs), then the
 * Bag, grouped the same way. Like a checklist, nothing on it moves: rows
 * appear, change place and leave at once.
 */
export default function ListaScreen() {
  const t = useT();
  const list = useQuery(api.shoppingList.get);
  const [allPutAway, setAllPutAway] = useState(false);

  useEffect(() => {
    if (!allPutAway) return;
    const timer = setTimeout(() => setAllPutAway(false), ALL_PUT_AWAY_MS);
    return () => clearTimeout(timer);
  }, [allPutAway]);

  if (list === undefined) return <p className="text-stone-500">{t("common.loading")}</p>;

  const nothingToBuy = entriesIn(list).length === 0;
  const bagIsEmpty = entriesIn(list.bag).length === 0;
  // An undo that refills the Bag ends the moment.
  const showAllPutAway = allPutAway && bagIsEmpty;
  return (
    <div className="flex flex-col gap-6">
      <AddToList list={list} />
      {/* With nothing left to buy, "All put away!" turns into the empty list in place, so the cupboard stays put. */}
      {nothingToBuy && bagIsEmpty && <ListNote allPutAway={showAllPutAway} />}
      {titled(list, t("lista.other")).map((group) => (
        <EntryGroup key={group.key} title={group.title} entries={group.entries} />
      ))}
      {!bagIsEmpty && <Bag groups={list.bag} onEmptied={() => setAllPutAway(true)} />}
      {showAllPutAway && !nothingToBuy && <ListNote allPutAway />}
    </div>
  );
}

/**
 * The cupboard with a short, friendly line: nothing to buy, or for a moment
 * after Put Away empties the Bag, "All put away!".
 */
function ListNote({ allPutAway }: { allPutAway: boolean }) {
  const t = useT();
  return (
    <CupboardNote
      role="status"
      title={t(allPutAway ? "lista.allPutAwayTitle" : "lista.emptyTitle")}
      hint={t(allPutAway ? "lista.allPutAwayHint" : "lista.emptyHint")}
    />
  );
}

/**
 * The search/add field: Products matching the text, picked for Need More, or
 * "+ Add" for a One-off (which links itself if it names a Product). The field
 * keeps focus after a pick, so the next thing can be typed at once.
 */
function AddToList({ list }: { list: Groups }) {
  const t = useT();
  const [text, setText] = useState("");
  const result = useProductSearch(text);
  const addOneOff = useMutation(api.shoppingList.addOneOff);
  const needMore = useNeedMore();
  const name = tidyName(text);
  const matches = result?.matches ?? [];
  const onList = new Map(
    entriesIn(list).flatMap((entry) => ("productId" in entry && entry.productId ? [[entry.productId, entry.quantity]] : [])),
  );

  const options: ComboboxOption[] = matches.map((product) => {
    const quantity = onList.get(product._id);
    return {
      key: product._id,
      label: product.name,
      detail: [t("lista.stock", { stock: product.stock }), quantity && t("lista.onListCount", { quantity })]
        .filter(Boolean)
        .join(" · "),
      onPick: () => {
        setText("");
        needMore(product);
      },
    };
  });
  // From the matches, not the answer's own `canAdd`, which may still be for the text before.
  if (name !== "" && !matches.some((product) => nameKey(product.name) === nameKey(name))) {
    options.push({
      key: "add",
      label: t("lista.addOneOff", { name }),
      add: true,
      onPick: () => {
        setText("");
        addOneOff({ name }).catch(() => setText((current) => current || name));
      },
    });
  }

  return <Combobox value={text} onChange={setText} label={t("lista.search")} options={options} keepFocus />;
}

/** A Category's Entries (or Other's), on the list or inside the Bag. */
function EntryGroup({
  title,
  entries,
  inBag = false,
  onEmptied,
}: {
  title: string;
  entries: Entry[];
  inBag?: boolean;
  onEmptied?: () => void;
}) {
  const Heading = inBag ? "h3" : "h2";
  return (
    <section className="flex flex-col gap-1">
      <Heading className="px-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">{title}</Heading>
      <ul className={`${cardList} flex flex-col`}>
        {entries.map((entry) => (
          // On the list a Product or One-off has one Entry, so the row stays when the server gives it a new id.
          <EntryRow key={inBag ? entry._id : productOrOneOff(entry)} entry={entry} inBag={inBag} onEmptied={onEmptied} />
        ))}
      </ul>
    </section>
  );
}

/**
 * "In the bag", like a checklist's ticked items below it: Entries ticked off
 * in the shop, grouped by Category like the list, put away one at a time or
 * all at once. "Put away all" first asks for a date for each Product with an
 * Expiry Kind. It folds shut, and this device remembers the fold.
 */
function Bag({ groups, onEmptied }: { groups: Groups; onEmptied: () => void }) {
  const t = useT();
  const entries: Entry[] = entriesIn(groups);
  const [folded, setFolded] = useState(bagFolded);
  const toggleFolded = () => {
    rememberBagFolded(!folded);
    setFolded(!folded);
  };
  const putAwayAllEntries = useMutation(api.shoppingList.putAwayAll).withOptimisticUpdate(putAwayAllLocally);
  const showPutAway = usePutAwayToast();
  const putAwayAll = (expiryDates?: Record<string, string>) => {
    const done = putAwayAllEntries({ expiryDates }).then(({ putAway }) => putAway);
    showPutAway(t("lista.putAwayAllDone", { count: entries.length }), done);
    onEmptied();
  };
  const [prompts, setPrompts] = useState<{ asking: Entry[]; index: number; dates: Record<string, string> } | null>(
    null,
  );

  const start = () => {
    const asking = entries.filter(
      (entry, i) => entry.asksForDate && entries.findIndex((e) => e.productId === entry.productId) === i,
    );
    if (asking.length === 0) putAwayAll();
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
    putAwayAll(dates);
  };

  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 px-1">
        {/* The heading fills the row up to Put away all, so a tap anywhere beside it folds. */}
        <h2 className="flex-1">
          <button
            type="button"
            aria-expanded={!folded}
            aria-controls={folded ? undefined : "bag"}
            onClick={toggleFolded}
            className="flex min-h-11 w-full items-center gap-1.5 text-left"
          >
            <ChevronDownIcon width={16} height={16} className={`text-stone-400 ${folded ? "-rotate-90" : ""}`} />
            <span className="font-display text-lg">{t("lista.bag")}</span>
            <span className="text-xs font-semibold text-stone-400 tabular-nums">{entries.length}</span>
          </button>
        </h2>
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
      {!folded && (
        <div id="bag" className="flex flex-col gap-3">
          {titled(groups, t("lista.other")).map((group) => (
            <EntryGroup
              key={group.key}
              title={group.title}
              entries={group.entries}
              inBag
              onEmptied={entries.length === 1 ? onEmptied : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One Entry, as a line in a checklist: a checkbox, its name and its quantity,
 * with the Product's Stock at home (or, for a One-off, "Make a Product") under
 * the name. On the list the quantity opens –, +, the Product's Category and
 * delete, and ticking moves the Entry into the Bag at once; unticking it there
 * is the undo. In the Bag the name is struck through, with Put away beside it.
 * Every change shows at once, even on a weak signal in the shop.
 */
function EntryRow({ entry, inBag = false, onEmptied }: { entry: Entry; inBag?: boolean; onEmptied?: () => void }) {
  const t = useT();
  const [makingProduct, setMakingProduct] = useState(false);
  const [askingDate, setAskingDate] = useState(false);
  const showChangeToast = useChangeToast();
  const setQuantity = useMutation(api.shoppingList.setQuantity).withOptimisticUpdate(setQuantityLocally);
  const tick = useMutation(api.shoppingList.tick).withOptimisticUpdate(tickLocally);
  const untick = useMutation(api.shoppingList.untick).withOptimisticUpdate(untickLocally);
  const putAwayEntry = useMutation(api.shoppingList.putAway).withOptimisticUpdate(putAwayLocally);
  const showPutAway = usePutAwayToast();
  const remove = useMutation(api.shoppingList.remove).withOptimisticUpdate(removeLocally);
  const restore = useMutation(api.shoppingList.restore);
  const update = useMutation(api.products.update).withOptimisticUpdate(setCategoryLocally);

  const putAway = (expiryDate?: string) => {
    const done = putAwayEntry({ entryId: entry._id, expiryDate }).then(({ putAway }) => putAway);
    showPutAway(t("lista.putAwayDone", { name: entry.name }), done);
    onEmptied?.();
  };
  const deleteEntry = () => {
    const deleted = { productId: entry.productId, name: entry.name, quantity: entry.quantity };
    showChangeToast(t("lista.deleted", { name: entry.name }), remove({ entryId: entry._id }), () => restore(deleted));
  };

  return (
    <li className="flex flex-col px-4 text-sm">
      <div className="flex min-h-9 items-center gap-2">
        {/* The box is small; its label is the full 44px tap area. */}
        <label className="-my-1 -ml-3 flex h-11 w-11 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={inBag}
            onChange={() => void (inBag ? untick : tick)({ entryId: entry._id })}
            aria-label={t(inBag ? "lista.untick" : "lista.tick", { name: entry.name })}
            className="h-5 w-5 accent-accent"
          />
        </label>
        {/* The Stock line sits under the name, so the box and the quantity centre on both lines. */}
        <div className="flex min-w-0 flex-1 flex-col py-2">
          <p className={`truncate ${inBag ? "text-stone-400 line-through" : ""}`}>{entry.name}</p>
          {!inBag && (entry.stock !== undefined || !makingProduct) && (
            <p className="truncate text-xs text-stone-500">
              {entry.stock !== undefined && t("lista.stock", { stock: entry.stock })}
              {entry.productId === undefined && !makingProduct && (
                <button type="button" className={textLink} onClick={() => setMakingProduct(true)}>
                  {t("lista.makeProduct")}
                </button>
              )}
            </p>
          )}
        </div>
        {inBag ? (
          <>
            <span className="text-stone-400 tabular-nums">{t("lista.quantity", { quantity: entry.quantity })}</span>
            <button
              type="button"
              className={`${textLink} -my-1 min-h-11 shrink-0 px-2 text-xs`}
              aria-label={t("lista.putAwayName", { name: entry.name })}
              onClick={() => (entry.asksForDate ? setAskingDate(true) : putAway())}
            >
              {t("lista.putAway")}
            </button>
          </>
        ) : (
          <NumberStepper
            text={t("lista.quantity", { quantity: entry.quantity })}
            label={t("lista.changeQuantity", { name: entry.name, quantity: entry.quantity })}
            onDecrease={() => void setQuantity({ entryId: entry._id, quantity: entry.quantity - 1 })}
            decreaseLabel={t("lista.decrease", { name: entry.name })}
            decreaseDisabled={entry.quantity <= 1}
            onIncrease={() => void setQuantity({ entryId: entry._id, quantity: entry.quantity + 1 })}
            increaseLabel={t("lista.increase", { name: entry.name })}
            extra={
              <>
                {entry.productId && (
                  // The tag is the button; the native picker opens from the invisible select over it.
                  <span className={`${stepButton} relative`}>
                    <TagIcon width={18} height={18} />
                    <CategorySelect
                      value={entry.categoryId ?? null}
                      onChange={(categoryId) => void update({ productId: entry.productId!, categoryId })}
                      aria-label={t("lista.category", { name: entry.name })}
                      className="absolute inset-0 opacity-0"
                    />
                  </span>
                )}
                <button
                  type="button"
                  className={stepButton}
                  aria-label={t("lista.delete", { name: entry.name })}
                  onClick={deleteEntry}
                >
                  <TrashIcon width={18} height={18} />
                </button>
              </>
            }
          />
        )}
      </div>
      {makingProduct && <MakeProduct entry={entry} onDone={() => setMakingProduct(false)} />}
      {askingDate && (
        <div className="pb-2">
          <DatePrompt
            name={entry.name}
            onAnswer={(expiryDate) => {
              setAskingDate(false);
              putAway(expiryDate);
            }}
            onCancel={() => setAskingDate(false)}
          />
        </div>
      )}
    </li>
  );
}

/**
 * Turns a One-off into a Product: its name pre-filled, a Location to choose,
 * and optionally a Category, which is never remembered.
 */
function MakeProduct({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const t = useT();
  const inventory = useQuery(api.inventory.get);
  const makeProduct = useMutation(api.shoppingList.makeProduct);
  const [name, setName] = useState(entry.name);
  const [pickedLocation, setPickedLocation] = useState<Id<"locations"> | null>(null);
  const [categoryId, setCategoryId] = useState<Id<"categories"> | null>(null);

  if (inventory === undefined) return null;
  const remembered = inventory.find((location) => location._id === lastLocation())?._id;
  const locationId = pickedLocation ?? remembered ?? inventory[0]?._id;

  const save = async () => {
    if (!locationId || name.trim() === "") return;
    await makeProduct({ entryId: entry._id, name, locationId, categoryId });
    rememberLocation(locationId);
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-2 pb-2 pl-10"
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
      <CategorySelect
        value={categoryId}
        onChange={setCategoryId}
        aria-label={t("product.category")}
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
