"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AddFab } from "@/components/AddFab";
import { AppLink } from "@/components/AppLink";
import { CategorySelect } from "@/components/CategorySelect";
import { Combobox, type ComboboxOption, useProductSearch } from "@/components/Combobox";
import { CupboardNote } from "@/components/Cupboard";
import { DatePrompt } from "@/components/DatePrompt";
import { Quantity, useDeleteEntry } from "@/components/EntryControls";
import { CheckIcon, ChevronUpIcon, TrashIcon } from "@/components/icons";
import { useNeedMore } from "@/components/NeedMore";
import { Sheet } from "@/components/Sheet";
import { usePutAwayToast } from "@/components/StockToasts";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { nameKey, tidyName } from "@/convex/productNames";
import { useT } from "@/lib/i18n";
import {
  addOneOffLocally,
  entriesIn,
  type Groups,
  putAwayAllLocally,
  putAwayLocally,
  setOneOffCategoryLocally,
  tickLocally,
  untickLocally,
} from "@/lib/listUpdates";
import { lastLocation, rememberLocation } from "@/lib/remembered";
import { field, primaryButton, raisedCard, textLink } from "@/lib/styles";

type Entry = {
  _id: Id<"entries">;
  name: string;
  quantity: number;
  productId?: Id<"products">;
  categoryId: Id<"categories"> | null;
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
 * The shared Shopping List: a card for each Category with Entries to buy, in
 * walking order, then "Other" (Products without a Category, and One-offs).
 * Ticked Entries go into the Bag, a tray floating above the navigation. Like
 * a checklist, nothing on it moves: rows appear, change place and leave at
 * once. The floating + adds to it.
 */
export default function ListaScreen() {
  const t = useT();
  const list = useQuery(api.shoppingList.get);
  const [allPutAway, setAllPutAway] = useState(false);
  const [adding, setAdding] = useState(false);
  // Kept here, not in its row, so the sheet stays open when a new Category moves the row to another group.
  const [oneOffId, setOneOffId] = useState<Id<"entries"> | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);

  useEffect(() => {
    if (!allPutAway) return;
    const timer = setTimeout(() => setAllPutAway(false), ALL_PUT_AWAY_MS);
    return () => clearTimeout(timer);
  }, [allPutAway]);

  const bagIsEmpty = list === undefined || entriesIn(list.bag).length === 0;
  // An emptied Bag's tray closes, so it comes back shut.
  if (bagIsEmpty && trayOpen) setTrayOpen(false);

  if (list === undefined) return <p className="text-stone-500">{t("common.loading")}</p>;

  const nothingToBuy = entriesIn(list).length === 0;
  // An undo that refills the Bag ends the moment.
  const showAllPutAway = allPutAway && bagIsEmpty;
  // Gone from the list (ticked or deleted, maybe on another phone), its sheet closes.
  const oneOff = entriesIn(list).find((entry) => entry._id === oneOffId);
  return (
    <div className="flex flex-col gap-3">
      {/* With nothing left to buy, "All put away!" turns into the empty list in place, so the cupboard stays put. */}
      {nothingToBuy && bagIsEmpty && <ListNote allPutAway={showAllPutAway} />}
      {titled(list, t("lista.other")).map((group) => (
        <section key={group.key} className={`${raisedCard} overflow-hidden`}>
          <h2 className="px-4 pt-2.5 text-xs font-bold tracking-wide text-stone-500 uppercase">{group.title}</h2>
          <ul>
            {group.entries.map((entry) => (
              // A Product or One-off has one Entry on the list, so the row stays when the server gives it a new id.
              <EntryRow key={productOrOneOff(entry)} entry={entry} onOpenOneOff={() => setOneOffId(entry._id)} />
            ))}
          </ul>
        </section>
      ))}
      {showAllPutAway && !nothingToBuy && <ListNote allPutAway />}
      {/* The open tray covers the corner, so the + waits until it closes. */}
      {!trayOpen && (
        // Opening synchronously inside the tap lets the sheet focus the field, so phones show the keyboard.
        <AddFab label={t("lista.search")} onClick={() => flushSync(() => setAdding(true))} />
      )}
      {!bagIsEmpty && (
        <BagTray groups={list.bag} open={trayOpen} onOpen={setTrayOpen} onEmptied={() => setAllPutAway(true)} />
      )}
      <AnimatePresence>
        {adding && (
          <Sheet key="add" title={t("lista.search")} onClose={() => setAdding(false)}>
            <AddToList list={list} />
          </Sheet>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {oneOff && <OneOffSheet key="oneOff" entry={oneOff} onClose={() => setOneOffId(null)} />}
      </AnimatePresence>
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
 * The search/add field in the + sheet: Products matching the text, picked for
 * Need More, or "+ Add" for a One-off (which links itself if it names a
 * Product). The field keeps focus after a pick, so the next thing can be typed
 * at once.
 */
function AddToList({ list }: { list: Groups }) {
  const t = useT();
  const [text, setText] = useState("");
  const result = useProductSearch(text);
  const addOneOff = useMutation(api.shoppingList.addOneOff).withOptimisticUpdate(addOneOffLocally);
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

  return <Combobox value={text} onChange={setText} label={t("lista.search")} options={options} keepFocus inline />;
}

/**
 * One Entry to buy, as a line in a checklist: a round tick, its name with the
 * Product's Stock at home beside it (or that it is a One-off), and how many.
 * Ticking moves it into the Bag at once; unticking it there is the undo.
 * Tapping the name opens the Product page (over Kauppalista), or a One-off's
 * sheet. Every change shows at once, even on a weak signal in the shop.
 */
function EntryRow({ entry, onOpenOneOff }: { entry: Entry; onOpenOneOff: () => void }) {
  const t = useT();
  const tick = useMutation(api.shoppingList.tick).withOptimisticUpdate(tickLocally);
  const nameClass = "flex min-h-11 min-w-0 flex-1 items-center text-left";
  const name = (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate font-medium">{entry.name}</span>
      <span className="shrink-0 text-xs text-stone-400">
        {entry.stock !== undefined ? t("lista.stock", { stock: entry.stock }) : t("lista.oneOff")}
      </span>
    </span>
  );
  return (
    <li className="flex items-center gap-1.5 pr-4 pl-1.5">
      <button
        type="button"
        onClick={() => void tick({ entryId: entry._id })}
        aria-label={t("lista.tick", { name: entry.name })}
        className="group flex h-11 w-11 shrink-0 items-center justify-center"
      >
        <span className="h-[22px] w-[22px] rounded-full border-2 border-stone-300 transition-colors group-active:border-accent group-active:bg-accent/20 dark:border-stone-500" />
      </button>
      {entry.productId ? (
        <AppLink href={`/lista/${entry.productId}`} className={nameClass}>
          {name}
        </AppLink>
      ) : (
        <button type="button" onClick={onOpenOneOff} className={nameClass}>
          {name}
        </button>
      )}
      <Quantity entry={entry} />
    </li>
  );
}

/**
 * "In the bag": Entries ticked off in the shop, as a tray floating above the
 * navigation, so the list stays in view. Folded, it is a bar with how many
 * are in the Bag and "Put away all", which first asks for a date for each
 * Product with an Expiry Kind. Unfolded, its Entries are listed above the bar,
 * each with how many and Put away.
 */
function BagTray({
  groups,
  open,
  onOpen,
  onEmptied,
}: {
  groups: Groups;
  open: boolean;
  onOpen: (open: boolean) => void;
  onEmptied: () => void;
}) {
  const t = useT();
  const tray = useTrayHeight();
  const entries: Entry[] = titled(groups, "").flatMap((group) => group.entries);
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
    if (asking.length === 0) return putAwayAll();
    setPrompts({ asking, index: 0, dates: {} });
    onOpen(true);
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
    <div
      ref={tray}
      data-bag-tray
      className="fixed inset-x-0 bottom-[calc(var(--nav-clearance)+0.75rem)] z-10 mx-auto w-[min(36rem,calc(100%-1.5rem))] overflow-hidden rounded-3xl bg-surface shadow-[0_-4px_32px_-8px_rgb(0_0_0/0.3)] ring-1 ring-black/5 left-(--rail-width) dark:ring-white/10"
    >
      {open && (
        <div id="bag" className="flex max-h-[45dvh] flex-col gap-2 overflow-y-auto border-b border-hairline p-2">
          {prompts && (
            <DatePrompt
              key={prompts.asking[prompts.index]._id}
              name={prompts.asking[prompts.index].name}
              step={{ index: prompts.index, count: prompts.asking.length }}
              onAnswer={answer}
              onCancel={() => setPrompts(null)}
            />
          )}
          <ul>
            {entries.map((entry) => (
              <BagRow key={entry._id} entry={entry} onEmptied={entries.length === 1 ? onEmptied : undefined} />
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center gap-3 p-2 pl-4">
        <h2 className="flex-1">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? "bag" : undefined}
            onClick={() => onOpen(!open)}
            className="flex min-h-11 w-full items-center gap-2 text-left"
          >
            <ChevronUpIcon
              width={18}
              height={18}
              className={`text-stone-400 ${open ? "rotate-180" : ""}`}
            />
            <span className="font-semibold">{t("lista.bag")}</span>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-accent-foreground tabular-nums">
              {entries.length}
            </span>
          </button>
        </h2>
        {!prompts && (
          <button type="button" onClick={start} className={`${primaryButton} min-h-11 rounded-full px-5 text-sm`}>
            {t("lista.putAwayAll")}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Measures the Bag tray into --tray-height on the page while it is shown, so
 * the floating +, the toasts and the foot of the list stay clear of it as it
 * folds and unfolds (see --tray-clearance in globals.css).
 */
function useTrayHeight() {
  const tray = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = tray.current;
    if (!element) return;
    const root = document.documentElement.style;
    const observer = new ResizeObserver(() => root.setProperty("--tray-height", `${element.offsetHeight}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.removeProperty("--tray-height");
    };
  }, []);
  return tray;
}

/**
 * An Entry in the Bag: its tick filled in (tapping it takes the Entry back
 * to the list), its name struck through, how many, and Put away, which first
 * asks for the date on the package if its Product has an Expiry Kind.
 */
function BagRow({ entry, onEmptied }: { entry: Entry; onEmptied?: () => void }) {
  const t = useT();
  const [askingDate, setAskingDate] = useState(false);
  const untick = useMutation(api.shoppingList.untick).withOptimisticUpdate(untickLocally);
  const putAwayEntry = useMutation(api.shoppingList.putAway).withOptimisticUpdate(putAwayLocally);
  const showPutAway = usePutAwayToast();

  const putAway = (expiryDate?: string) => {
    const done = putAwayEntry({ entryId: entry._id, expiryDate }).then(({ putAway }) => putAway);
    showPutAway(t("lista.putAwayDone", { name: entry.name }), done);
    onEmptied?.();
  };

  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          onClick={() => void untick({ entryId: entry._id })}
          aria-label={t("lista.untick", { name: entry.name })}
          className="flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <CheckIcon width={16} height={16} strokeWidth={3} />
          </span>
        </button>
        <span className="min-w-0 flex-1 truncate text-stone-500 line-through">{entry.name}</span>
        <Quantity entry={entry} />
        <button
          type="button"
          className={`${textLink} min-h-11 shrink-0 px-2 text-sm`}
          aria-label={t("lista.putAwayName", { name: entry.name })}
          onClick={() => (entry.asksForDate ? setAskingDate(true) : putAway())}
        >
          {t("lista.putAway")}
        </button>
      </div>
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
 * Tapping a One-off: its Category, which moves it on the list at once; then
 * whether it should become a Product, with a line on what that means and the
 * form to make it one. Deleting it from the list is here too.
 */
function OneOffSheet({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const t = useT();
  const deleteEntry = useDeleteEntry();
  const setCategory = useMutation(api.shoppingList.setOneOffCategory).withOptimisticUpdate(setOneOffCategoryLocally);
  return (
    <Sheet title={entry.name} onClose={onClose}>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-stone-500">{t("product.category")}</span>
        <CategorySelect
          value={entry.categoryId}
          onChange={(categoryId) => void setCategory({ entryId: entry._id, categoryId })}
          className={`${field} w-full px-3`}
        />
      </label>
      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{t("lista.oneOffTitle")}</h3>
        <p className="text-sm text-stone-500">{t("lista.oneOffHint", { name: entry.name })}</p>
        <MakeProduct entry={entry} onDone={onClose} />
      </section>
      <button
        type="button"
        onClick={() => {
          onClose();
          deleteEntry(entry);
        }}
        className="flex min-h-11 items-center justify-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400"
      >
        <TrashIcon width={16} height={16} />
        {t("lista.deleteButton")}
      </button>
    </Sheet>
  );
}

/**
 * Turns a One-off into a Product: its name pre-filled and a Location to
 * choose. The Product takes the One-off's Category.
 */
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
    await makeProduct({ entryId: entry._id, name, locationId, categoryId: entry.categoryId });
    rememberLocation(locationId);
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-2"
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
