"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { createContext, useContext, useEffect, useState } from "react";
import { Cupboard } from "@/components/Cupboard";
import { DatePrompt } from "@/components/DatePrompt";
import { usePutAwayToast } from "@/components/StockToasts";
import { CheckIcon, TrashIcon } from "@/components/icons";
import { landInBag, Reveal, RollingNumber, settle, useRowMotion, useSectionMotion } from "@/components/motion";
import { useNeedMore } from "@/components/NeedMore";
import { NumberStepper, stepButton } from "@/components/NumberStepper";
import { useUndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { nameKey } from "@/convex/productNames";
import { useT } from "@/lib/i18n";
import {
  putAwayAllLocally,
  putAwayLocally,
  removeLocally,
  setQuantityLocally,
  tickLocally,
  untickLocally,
} from "@/lib/listUpdates";
import { lastLocation, rememberLocation } from "@/lib/remembered";
import { cardList, field, primaryButton, secondaryButton, textLink } from "@/lib/styles";

type Entry = {
  _id: Id<"entries">;
  name: string;
  quantity: number;
  productId?: Id<"products">;
  stock?: number;
  asksForDate?: boolean;
};

// How long "All put away!" shows after Put Away empties the Bag.
const ALL_PUT_AWAY_MS = 4000;

/**
 * What an Entry stands for, the same on the list and in the Bag, and before
 * and after the server gives a new Entry its id: its Product, or a One-off's name.
 */
const thingOf = (entry: Entry) => entry.productId ?? `oneOff:${nameKey(entry.name)}`;

/**
 * Rows moving between the list and the Bag (a Tick, or taking it back out):
 * the thing that just moved, and the things listed only once, which are the
 * ones that can move.
 */
const Moving = createContext<{ moved: string | null; onMove: (thing: string | null) => void; movable: Set<string> }>({
  moved: null,
  onMove: () => {},
  movable: new Set(),
});

/** The things listed exactly once across the list and the Bag. */
function listedOnce(entries: Entry[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(thingOf(entry), (counts.get(thingOf(entry)) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count === 1).map(([thing]) => thing));
}

/** The shared Shopping List: to-buy Entries grouped by Location, then One-offs under "Other", then the Bag. */
export default function ListaScreen() {
  const t = useT();
  const list = useQuery(api.shoppingList.get);
  const [allPutAway, setAllPutAway] = useState(false);
  const [moved, setMoved] = useState<string | null>(null);

  useEffect(() => {
    if (!allPutAway) return;
    const timer = setTimeout(() => setAllPutAway(false), ALL_PUT_AWAY_MS);
    return () => clearTimeout(timer);
  }, [allPutAway]);

  if (list === undefined) return <p className="text-stone-500">{t("common.loading")}</p>;

  const nothingToBuy = list.locations.length === 0 && list.oneOffs.length === 0;
  // An undo that refills the Bag ends the moment.
  const showAllPutAway = allPutAway && list.bag.length === 0;
  const movable = listedOnce([...list.locations.flatMap((location) => location.entries), ...list.oneOffs, ...list.bag]);
  // One layout group, so a row that moves or leaves moves everything below it smoothly.
  return (
    <LayoutGroup>
      <Moving value={{ moved, onMove: setMoved, movable }}>
        <div className="flex flex-col gap-6">
          <AddToList />
          {/* With nothing left to buy, "All put away!" turns into the empty list in place, so the cupboard stays put. */}
          {nothingToBuy && list.bag.length === 0 && <CupboardNote allPutAway={showAllPutAway} />}
          <AnimatePresence initial={false}>
            {list.locations.map((location) => (
              <EntryGroup key={location._id} title={location.name} entries={location.entries} />
            ))}
            {list.oneOffs.length > 0 && <EntryGroup key="oneOffs" title={t("lista.other")} entries={list.oneOffs} />}
            {list.bag.length > 0 && <Bag key="bag" entries={list.bag} onEmptied={() => setAllPutAway(true)} />}
          </AnimatePresence>
          {showAllPutAway && !nothingToBuy && <CupboardNote allPutAway />}
        </div>
      </Moving>
    </LayoutGroup>
  );
}

/**
 * The cupboard with a short, friendly line: nothing to buy, or for a moment
 * after Put Away empties the Bag, "All put away!".
 */
function CupboardNote({ allPutAway }: { allPutAway: boolean }) {
  const t = useT();
  return (
    <div role="status" className="flex flex-col items-center gap-3 px-6 py-4 text-center">
      <Cupboard />
      <h2 className="font-display text-2xl">{t(allPutAway ? "lista.allPutAwayTitle" : "lista.emptyTitle")}</h2>
      <p className="text-stone-600 dark:text-stone-400">
        {t(allPutAway ? "lista.allPutAwayHint" : "lista.emptyHint")}
      </p>
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
  const pick = (product: { _id: Id<"products">; name: string }) => {
    setText("");
    needMore(product);
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
                onClick={() => pick(product)}
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
  const sectionMotion = useSectionMotion();
  return (
    <motion.section {...sectionMotion} className="flex flex-col gap-1.5">
      <h2 className="px-1 font-display text-lg">{title}</h2>
      <ul className={`${cardList} flex flex-col`}>
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            // On the list a thing has one Entry, so the row stays when the server gives it a new id.
            <EntryRow key={thingOf(entry)} entry={entry} />
          ))}
        </AnimatePresence>
      </ul>
    </motion.section>
  );
}

/**
 * "In the bag": Entries ticked off in the shop, put away one at a time or all
 * at once. "Put away all" first asks for a date for each Product with an Expiry Kind.
 */
function Bag({ entries, onEmptied }: { entries: Entry[]; onEmptied: () => void }) {
  const t = useT();
  const sectionMotion = useSectionMotion();
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
    <motion.section {...sectionMotion} className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 px-1">
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
      <AnimatePresence initial={false}>
        {prompts && (
          <Reveal key="prompts">
            <DatePrompt
              key={prompts.asking[prompts.index]._id}
              name={prompts.asking[prompts.index].name}
              step={{ index: prompts.index, count: prompts.asking.length }}
              onAnswer={answer}
              onCancel={() => setPrompts(null)}
            />
          </Reveal>
        )}
      </AnimatePresence>
      <ul className={`${cardList} flex flex-col`}>
        <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <EntryRow key={entry._id} entry={entry} inBag onEmptied={entries.length === 1 ? onEmptied : undefined} />
          ))}
        </AnimatePresence>
      </ul>
    </motion.section>
  );
}

const tickButton =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-300 dark:border-stone-700";

/**
 * One Entry: a tick toggle, its name (and the Product's Stock at home), then
 * its quantity as a number that opens –, + and delete on the list, or the
 * quantity and Put away in the Bag. A One-off can be made into a Product.
 * Every change and its toast show at once, even on a weak signal in the shop.
 * Ticked, the row moves into the Bag (landing with a little bounce), and
 * taken back out, it moves back up; it slides in and out when added,
 * deleted or put away.
 */
function EntryRow({ entry, inBag = false, onEmptied }: { entry: Entry; inBag?: boolean; onEmptied?: () => void }) {
  const t = useT();
  const [makingProduct, setMakingProduct] = useState(false);
  const [askingDate, setAskingDate] = useState(false);
  const showUndoToast = useUndoToast();
  const setQuantity = useMutation(api.shoppingList.setQuantity).withOptimisticUpdate(setQuantityLocally);
  const tick = useMutation(api.shoppingList.tick).withOptimisticUpdate(tickLocally);
  const untick = useMutation(api.shoppingList.untick).withOptimisticUpdate(untickLocally);
  const putAwayEntry = useMutation(api.shoppingList.putAway).withOptimisticUpdate(putAwayLocally);
  const showPutAway = usePutAwayToast();
  const remove = useMutation(api.shoppingList.remove).withOptimisticUpdate(removeLocally);
  const restore = useMutation(api.shoppingList.restore);
  const rowMotion = useRowMotion();
  const reduced = useReducedMotion();
  const { moved, onMove, movable } = useContext(Moving);
  const thing = thingOf(entry);
  const moving = moved === thing && !reduced;

  const putAway = (expiryDate?: string) => {
    const done = putAwayEntry({ entryId: entry._id, expiryDate }).then(({ putAway }) => putAway);
    showPutAway(t("lista.putAwayDone", { name: entry.name }), done);
    onEmptied?.();
  };
  const tickEntry = () => {
    onMove(thing);
    void tick({ entryId: entry._id });
    showUndoToast(t("lista.ticked", { name: entry.name }), () => {
      onMove(thing);
      void untick({ entryId: entry._id });
    });
  };
  const untickEntry = () => {
    onMove(thing);
    void untick({ entryId: entry._id });
  };
  const deleteEntry = () => {
    void remove({ entryId: entry._id });
    const deleted = { productId: entry.productId, name: entry.name, quantity: entry.quantity };
    showUndoToast(t("lista.deleted", { name: entry.name }), () => void restore(deleted));
  };

  return (
    <motion.li
      {...rowMotion}
      // A thing on screen twice (say, in the Bag and on the list again) doesn't move between them.
      layoutId={movable.has(thing) ? thing : undefined}
      // A row that moved arrives as itself, not fading in.
      initial={moving ? false : rowMotion.initial}
      transition={{ ...rowMotion.transition, layout: moving && inBag ? landInBag : settle }}
      onLayoutAnimationComplete={moving ? () => onMove(null) : undefined}
      className="flex flex-col gap-2 px-4 py-1.5"
    >
      <div className="flex min-h-11 items-center gap-2">
        <button
          type="button"
          className={`${tickButton} ${inBag ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-600" : ""}`}
          aria-label={t(inBag ? "lista.untick" : "lista.tick", { name: entry.name })}
          aria-pressed={inBag}
          onClick={() => (inBag ? untickEntry() : tickEntry())}
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
            <span className="min-w-8 text-center font-display text-lg text-stone-500 tabular-nums">
              <RollingNumber value={entry.quantity}>{t("lista.quantity", { quantity: entry.quantity })}</RollingNumber>
            </span>
            <button
              type="button"
              className={`${secondaryButton} min-h-11 shrink-0 px-3`}
              aria-label={t("lista.putAwayName", { name: entry.name })}
              onClick={() => (entry.asksForDate ? setAskingDate(true) : putAway())}
            >
              {t("lista.putAway")}
            </button>
          </>
        ) : (
          <NumberStepper
            value={entry.quantity}
            text={t("lista.quantity", { quantity: entry.quantity })}
            label={t("lista.changeQuantity", { name: entry.name, quantity: entry.quantity })}
            onDecrease={() => void setQuantity({ entryId: entry._id, quantity: entry.quantity - 1 })}
            decreaseLabel={t("lista.decrease", { name: entry.name })}
            decreaseDisabled={entry.quantity <= 1}
            onIncrease={() => void setQuantity({ entryId: entry._id, quantity: entry.quantity + 1 })}
            increaseLabel={t("lista.increase", { name: entry.name })}
            extra={
              <button
                type="button"
                className={stepButton}
                aria-label={t("lista.delete", { name: entry.name })}
                onClick={deleteEntry}
              >
                <TrashIcon width={18} height={18} />
              </button>
            }
          />
        )}
      </div>
      <AnimatePresence initial={false}>
        {makingProduct && (
          <Reveal key="makeProduct">
            <MakeProduct entry={entry} onDone={() => setMakingProduct(false)} />
          </Reveal>
        )}
        {askingDate && (
          <Reveal key="askingDate">
            <DatePrompt
              name={entry.name}
              onAnswer={(expiryDate) => {
                setAskingDate(false);
                putAway(expiryDate);
              }}
              onCancel={() => setAskingDate(false)}
            />
          </Reveal>
        )}
      </AnimatePresence>
    </motion.li>
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
