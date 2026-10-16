"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { navigate } from "@/components/AppLink";
import BarcodeScanner, { prepareScanner } from "@/components/BarcodeScanner";
import { CategorySelect } from "@/components/CategorySelect";
import { DatePrompt } from "@/components/DatePrompt";
import { ExpiryKindSelect } from "@/components/ExpiryKindSelect";
import { MinusIcon, PlusIcon } from "@/components/icons";
import { crossFade, Reveal, useEnterExit } from "@/components/motion";
import { stepButton } from "@/components/NumberStepper";
import { useNeedMoreToast } from "@/components/NeedMore";
import { useRunningLowToast, useUndoStockChange } from "@/components/StockToasts";
import { useUndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SCAN_MODES, type ScanMode } from "@/convex/scanModes";
import type { ExpiryKind } from "@/convex/stock";
import { haptic } from "@/lib/haptics";
import { useT } from "@/lib/i18n";
import { card, field, primaryButton, secondaryButton, textLink } from "@/lib/styles";
import { lastLocation, lastScanMode, rememberLocation, rememberScanMode } from "@/lib/remembered";

type ScanOutcome = Exclude<FunctionReturnType<typeof api.barcodes.scan>, { unknown: true }>;
type Suggestion = FunctionReturnType<typeof api.barcodes.lookup>;


/**
 * Scan: the camera starts at once, in the last used mode, and scans
 * continuously. Each scan shows a confirmation with the Product and its new
 * Stock; an unknown barcode opens a card over the paused camera, whose one
 * button sends it all (see `UnknownBarcodeCard`). An Add scan of a known
 * Product with an Expiry Kind then asks for the package's date (Skip is the
 * big button), with the camera paused until it is answered.
 */
export default function ScanScreen() {
  const t = useT();
  const scan = useMutation(api.barcodes.scan);
  const dateScan = useMutation(api.barcodes.dateScan);
  const showConfirmation = useScanConfirmation();
  const [mode, setMode] = useState<ScanMode>(lastScanMode);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [awaitingDate, setAwaitingDate] = useState<ScanOutcome | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [reads, setReads] = useState(0);

  useEffect(() => prepareScanner(), []);

  const scanned = (outcome: ScanOutcome) => {
    showConfirmation(outcome);
    if (outcome.asksForDate) setAwaitingDate((current) => current ?? outcome);
  };

  const onCode = async (code: string) => {
    // Confirm the read at once, before the server has answered.
    setReads((count) => count + 1);
    haptic();
    const result = await scan({ code, mode });
    if (result.unknown) setUnknownCode((current) => current ?? result.code);
    else scanned(result);
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label={t("scan.mode")} className="flex rounded-xl bg-stone-200/60 p-1 dark:bg-stone-800">
        {SCAN_MODES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === mode}
            onClick={() => {
              setMode(option);
              rememberScanMode(option);
            }}
            className={`min-h-11 flex-1 rounded-lg px-2 py-1.5 text-sm leading-tight font-semibold ${
              option === mode ? "bg-accent text-accent-foreground shadow-sm" : "text-stone-600 dark:text-stone-400"
            }`}
          >
            {t(`scan.mode.${option}`)}
          </button>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {awaitingDate && (
          <Reveal key="awaitingDate">
            <DatePrompt
              key={`${awaitingDate.productId}-${awaitingDate.to}`}
              name={awaitingDate.name}
              answerLabel={t("common.save")}
              onAnswer={(expiryDate) => {
                setAwaitingDate(null);
                if (expiryDate) void dateScan({ productId: awaitingDate.productId, expiryDate });
              }}
            />
          </Reveal>
        )}
      </AnimatePresence>
      {cameraError ? (
        <p className="rounded-xl bg-amber-100 px-4 py-3 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200">
          {t("scan.cameraError")}
        </p>
      ) : (
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black">
          <BarcodeScanner
            onCode={(code) => void onCode(code)}
            onError={() => setCameraError(true)}
            onReady={() => setCameraReady(true)}
            paused={unknownCode !== null || awaitingDate !== null}
          />
          {!cameraReady && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
              {t("scan.starting")}
            </p>
          )}
          <p className="absolute inset-x-0 bottom-0 bg-black/50 px-4 py-2 text-center text-sm text-white">
            {t("scan.hint")}
          </p>
          {reads > 0 && <ReadFlash key={reads} />}
          <AnimatePresence>
            {unknownCode !== null && (
              <UnknownBarcodeCard
                key={unknownCode}
                code={unknownCode}
                mode={mode}
                onSent={(outcome, undo) => {
                  setUnknownCode(null);
                  showConfirmation(outcome, undo);
                }}
                onSkip={() => setUnknownCode(null)}
              />
            )}
          </AnimatePresence>
        </div>
      )}
      <button
        type="button"
        onClick={() => navigate("/koti")}
        className={`${secondaryButton} min-h-11 py-3`}
      >
        {t("scan.stop")}
      </button>
    </div>
  );
}

/**
 * A lake-blue glow around the viewfinder that closes in and fades, the moment
 * a barcode is read; key it by the read so each one flashes. Under reduced
 * motion it only fades, briefly.
 */
function ReadFlash() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-2xl bg-accent/20 ring-4 ring-accent ring-inset"
      initial={reduced ? { opacity: 1 } : { opacity: 1, scale: 1.04 }}
      animate={reduced ? { opacity: 0 } : { opacity: 0, scale: 1 }}
      transition={reduced ? crossFade : { duration: 0.5, ease: "easeOut" }}
    />
  );
}

/**
 * The confirmation after each scan or send: the Product and its new Stock,
 * with undo. A Use that makes the Product Running Low gets Koti's "running
 * low" toast with "Add to list" instead. A send brings its own undo, which
 * takes the whole send back.
 */
function useScanConfirmation() {
  const t = useT();
  const showUndoToast = useUndoToast();
  const showNeedMoreToast = useNeedMoreToast();
  const showRunningLow = useRunningLowToast();
  const undoStockChange = useUndoStockChange();

  return useCallback(
    (outcome: ScanOutcome, undoSend?: () => void) => {
      const { name, from, to } = outcome;
      const product = { _id: outcome.productId, name };
      const undo = undoSend ?? undoStockChange(product, outcome);
      switch (outcome.action) {
        case "restock":
          return showUndoToast(t("scan.restocked", { name, count: to - from, stock: to }), undo);
        case "use":
          if (from === to) return showUndoToast(t("scan.alreadyOut", { name }), undoSend);
          if (!outcome.crossedIntoRunningLow) return showUndoToast(t("scan.used", { name, stock: to }), undo);
          return showRunningLow(product, undo);
        case "needMore":
          if (undoSend) return showUndoToast(t("lista.onList", { name, quantity: outcome.quantity }), undoSend);
          return showNeedMoreToast(outcome, outcome);
      }
    },
    [showUndoToast, showNeedMoreToast, showRunningLow, undoStockChange, t],
  );
}

type Existing = { _id: Id<"products">; name: string; expiryKind: ExpiryKind | null };

const chip =
  "min-h-11 max-w-full truncate rounded-full border border-stone-300 bg-surface px-3 text-sm disabled:opacity-40 dark:border-stone-700";

/**
 * An unknown barcode: a compact card over the paused camera, so each item
 * takes one stop and one press. Open Food Facts is asked at once; its name
 * shows large (tap it to edit), and with no suggestion the name field opens
 * for typing. Location starts as the last one used, Category as none, and
 * Expiry Kind as Open Food Facts' guess; each is a chip to tap. A name that is
 * already a Product's says so and greys the chips out, since the barcode then
 * joins that Product; "It's an existing Product" searches for one instead.
 * The stepper (Add, Need more) and the date (Add, with an Expiry Kind) apply
 * either way. The button sends it all; Skip, or a swipe down on the grabber,
 * saves nothing.
 */
function UnknownBarcodeCard({
  code,
  mode,
  onSent,
  onSkip,
}: {
  code: string;
  mode: ScanMode;
  onSent: (outcome: ScanOutcome, undo: () => void) => void;
  onSkip: () => void;
}) {
  const t = useT();
  const linkNew = useMutation(api.barcodes.linkNew);
  const link = useMutation(api.barcodes.link);
  const undoSend = useMutation(api.barcodes.undoSend);
  const showRunningLow = useRunningLowToast();
  const lookup = useAction(api.barcodes.lookup);
  const inventory = useQuery(api.inventory.get);
  const cardMotion = useEnterExit({ y: "100%" });
  const drag = useDragControls();
  const nameField = useRef<HTMLInputElement>(null);

  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [choice, setChoice] = useState<"new" | "existing">("new");
  const [typedName, setTypedName] = useState<string | null>(null);
  const [picked, setPicked] = useState<Existing | null>(null);
  const [pickedLocation, setPickedLocation] = useState<Id<"locations"> | null>(null);
  // Unlike the Location, never remembered: the last Category is usually wrong for the next Product.
  const [categoryId, setCategoryId] = useState<Id<"categories"> | null>(null);
  const [pickedExpiryKind, setPickedExpiryKind] = useState<ExpiryKind | null | undefined>(undefined);
  const [quantity, setQuantity] = useState(1);
  const [date, setDate] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    lookup({ code })
      .catch(() => ({ name: null, expiryKind: null }))
      .then((found) => current && setSuggestion(found));
    return () => {
      current = false;
    };
  }, [code, lookup]);

  const name = typedName ?? suggestion?.name ?? "";
  const editing = typedName !== null || suggestion?.name === null;
  const match = useQuery(api.barcodes.productNamed, choice === "new" && name.trim() ? { name } : "skip");
  const remembered = inventory?.find((location) => location._id === lastLocation())?._id;
  const locationId = pickedLocation ?? remembered ?? inventory?.[0]?._id;
  const chosenExpiryKind = pickedExpiryKind === undefined ? (suggestion?.expiryKind ?? null) : pickedExpiryKind;
  const existing = choice === "existing" ? picked : match;
  const expiryKind = existing ? existing.expiryKind : chosenExpiryKind;
  const showsDate = mode === "add" && expiryKind !== null;
  const ready = choice === "existing" ? picked !== null : name.trim() !== "" && locationId !== undefined;

  const startEditing = () => {
    flushSync(() => setTypedName(name));
    nameField.current?.select();
  };

  const send = () => {
    if (!ready || sending) return;
    const packages = { mode, quantity, expiryDate: date || undefined };
    const sent =
      choice === "existing"
        ? link({ code, productId: picked!._id, ...packages })
        : linkNew({ code, name, locationId: locationId!, categoryId, expiryKind: chosenExpiryKind, ...packages });
    if (choice === "new") rememberLocation(locationId!);
    setSending(true);
    setFailed(false);
    sent
      .then((outcome) => {
        if (!outcome) return;
        const { productId, created, from, to, expiryDateBefore } = outcome;
        const entryId = outcome.action === "needMore" ? outcome.entryId : undefined;
        onSent(outcome, async () => {
          const undone = await undoSend({
            code: outcome.code,
            productId,
            created,
            from,
            to,
            expiryDateBefore,
            entryId,
            added: quantity,
          });
          if (undone.crossedIntoRunningLow) showRunningLow({ _id: productId, name: outcome.name });
        });
      })
      .catch(() => {
        setSending(false);
        setFailed(true);
      });
  };

  return (
    <motion.form
      {...cardMotion}
      drag="y"
      dragControls={drag}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.8 }}
      onDragEnd={(_, { offset, velocity }) => {
        if (offset.y > 80 || velocity.y > 500) onSkip();
      }}
      aria-label={t("scan.unknownTitle", { code })}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className={`${card} absolute inset-x-2 bottom-2 flex max-h-[calc(100%-1rem)] flex-col gap-3 overflow-y-auto px-4 pb-4`}
    >
      <div
        aria-hidden="true"
        onPointerDown={(event) => drag.start(event)}
        className="-mx-4 flex shrink-0 touch-none justify-center pt-2 pb-1"
      >
        <span className="h-1.5 w-10 rounded-full bg-stone-300 dark:bg-stone-600" />
      </div>
      {choice === "existing" ? (
        <ExistingProductSearch picked={picked?._id ?? null} onPick={setPicked} />
      ) : (
        <>
          {editing ? (
            <input
              ref={nameField}
              value={name}
              onChange={(event) => setTypedName(event.target.value)}
              placeholder={t("scan.productName")}
              aria-label={t("scan.productName")}
              autoFocus
              autoComplete="off"
              enterKeyHint="done"
              className={`${field} w-full px-3 py-1 font-display text-2xl`}
            />
          ) : suggestion === null ? (
            <button
              type="button"
              onClick={startEditing}
              aria-label={t("scan.lookingUp")}
              className="flex min-h-11 items-center"
            >
              <span className="h-7 w-2/3 animate-pulse rounded-lg bg-stone-200 dark:bg-stone-800" />
            </button>
          ) : (
            <button type="button" onClick={startEditing} className="flex min-h-11 flex-col items-start text-left">
              <span className="font-display text-2xl leading-tight">{name}</span>
              <span className="text-xs text-stone-500">{t("scan.suggestedName")}</span>
            </button>
          )}
          {match && (
            <p className="text-sm text-ink-accent">
              {t("scan.alreadyHome", { name: match.name, location: match.locationName })}
            </p>
          )}
          <fieldset disabled={!!match} className="flex flex-wrap gap-2">
            <select
              value={locationId ?? ""}
              onChange={(event) => setPickedLocation(event.target.value as Id<"locations">)}
              aria-label={t("product.homeLocation")}
              className={chip}
            >
              {inventory?.map((location) => (
                <option key={location._id} value={location._id}>
                  {location.name}
                </option>
              ))}
            </select>
            <CategorySelect
              value={categoryId}
              onChange={setCategoryId}
              aria-label={t("product.category")}
              className={chip}
            />
            <ExpiryKindSelect
              value={chosenExpiryKind}
              onChange={setPickedExpiryKind}
              aria-label={t("product.expiryKind")}
              className={chip}
            />
          </fieldset>
        </>
      )}
      <button
        type="button"
        onClick={() => setChoice(choice === "new" ? "existing" : "new")}
        className={`${textLink} min-h-11 self-start text-sm`}
      >
        {choice === "new" ? t("scan.existingProduct") : t("scan.newProduct")}
      </button>
      {mode !== "use" && (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm text-stone-500">{t("scan.packages")}</span>
          <button
            type="button"
            className={stepButton}
            disabled={quantity <= 1}
            aria-label={t("scan.fewer")}
            onClick={() => setQuantity(quantity - 1)}
          >
            <MinusIcon width={18} height={18} />
          </button>
          <span className="min-w-7 text-center font-display text-lg tabular-nums">{quantity}</span>
          <button
            type="button"
            className={stepButton}
            aria-label={t("scan.more")}
            onClick={() => setQuantity(quantity + 1)}
          >
            <PlusIcon width={18} height={18} />
          </button>
        </div>
      )}
      {showsDate && (
        <label className="flex items-center gap-2">
          <span className="flex-1 text-sm text-stone-500">{t("product.expiryDate")}</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={`${field} px-3 py-1`}
          />
        </label>
      )}
      {failed && <p className="text-sm text-amber-700 dark:text-amber-400">{t("scan.linkFailed")}</p>}
      <button type="submit" disabled={!ready || sending} className={`${primaryButton} min-h-14 text-lg`}>
        {t("common.save")}
      </button>
      <button type="button" onClick={onSkip} className="min-h-11 text-stone-500">
        {t("scan.skip")}
      </button>
    </motion.form>
  );
}

function ExistingProductSearch({
  picked,
  onPick,
}: {
  picked: Id<"products"> | null;
  onPick: (product: Existing) => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const result = useQuery(api.products.search, text.trim() ? { text } : "skip");

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("scan.searchProduct")}
        aria-label={t("scan.searchProduct")}
        autoFocus
        autoComplete="off"
        enterKeyHint="search"
        className={`${field} w-full px-4 py-2`}
      />
      {result && result.matches.length === 0 && <p className="text-sm text-stone-500">{t("scan.noMatches")}</p>}
      <ul className="flex flex-col divide-y divide-stone-200 dark:divide-stone-800">
        {result?.matches.map((product) => (
          <li key={product._id}>
            <button
              type="button"
              aria-pressed={product._id === picked}
              onClick={() => onPick(product)}
              className={`flex min-h-11 w-full flex-col items-start rounded-lg px-2 py-2 text-left ${
                product._id === picked ? "bg-accent/15" : ""
              }`}
            >
              <span>{product.name}</span>
              <span className="text-xs text-stone-500">{product.locationName}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
