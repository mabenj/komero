"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import BarcodeScanner, { prepareScanner } from "@/components/BarcodeScanner";
import { DatePrompt } from "@/components/DatePrompt";
import { ExpiryKindSelect } from "@/components/ExpiryKindSelect";
import { crossFade, Reveal } from "@/components/motion";
import { Sheet } from "@/components/Sheet";
import { useNeedMoreToast } from "@/components/NeedMore";
import { usePutAwayToast, useRunningLowToast, useUndoStockChange } from "@/components/StockToasts";
import { useUndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SCAN_MODES, type ScanMode } from "@/convex/scanModes";
import type { ExpiryKind } from "@/convex/stock";
import { haptic } from "@/lib/haptics";
import { useT } from "@/lib/i18n";
import { card, field, primaryButton, secondaryButton } from "@/lib/styles";
import { lastLocation, lastScanMode, rememberLocation, rememberScanMode } from "@/lib/remembered";

type ScanOutcome = Exclude<FunctionReturnType<typeof api.barcodes.scan>, { unknown: true }>;
type Suggestion = FunctionReturnType<typeof api.barcodes.lookup>;

const fieldClass = `${field} w-full px-4 py-2`;
const segments = "flex rounded-xl bg-stone-200/60 p-1 dark:bg-stone-800";

/**
 * Scan: pick a mode (the last one is preselected), then scan continuously.
 * Each scan shows a confirmation with the Product and its new Stock; an
 * unknown barcode asks which Product it is, then the mode applies. An Add scan
 * of a Product with an Expiry Kind then asks for the package's date (Skip is
 * the big button), with the camera paused until it is answered.
 */
export default function ScanScreen() {
  const [mode, setMode] = useState<ScanMode>(lastScanMode);
  const [scanning, setScanning] = useState(false);

  useEffect(() => prepareScanner(), []);

  const choose = (next: ScanMode) => {
    setMode(next);
    rememberScanMode(next);
  };

  if (!scanning) {
    return (
      <ModePicker
        mode={mode}
        onPick={(picked) => {
          choose(picked);
          setScanning(true);
        }}
      />
    );
  }
  return <Scanning mode={mode} onModeChange={choose} onStop={() => setScanning(false)} />;
}

function ModePicker({ mode, onPick }: { mode: ScanMode; onPick: (mode: ScanMode) => void }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t("scan.chooseMode")}</h2>
      {SCAN_MODES.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onPick(option)}
          className={`flex flex-col items-start gap-0.5 rounded-2xl px-5 py-4 text-left ${
            option === mode ? "bg-accent text-accent-foreground" : card
          }`}
        >
          <span className="text-xl font-semibold">{t(`scan.mode.${option}`)}</span>
          <span className={`text-sm ${option === mode ? "opacity-80" : "text-stone-500"}`}>
            {t(`scan.mode.${option}Hint`)}
          </span>
        </button>
      ))}
    </div>
  );
}

function Scanning({
  mode,
  onModeChange,
  onStop,
}: {
  mode: ScanMode;
  onModeChange: (mode: ScanMode) => void;
  onStop: () => void;
}) {
  const t = useT();
  const scan = useMutation(api.barcodes.scan);
  const dateScan = useMutation(api.barcodes.dateScan);
  const showConfirmation = useScanConfirmation();
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [awaitingDate, setAwaitingDate] = useState<ScanOutcome | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [reads, setReads] = useState(0);

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
      <div role="group" aria-label={t("scan.mode")} className={segments}>
        {SCAN_MODES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === mode}
            onClick={() => onModeChange(option)}
            className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold ${
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
        </div>
      )}
      <button
        type="button"
        onClick={onStop}
        className={`${secondaryButton} min-h-11 py-3`}
      >
        {t("scan.stop")}
      </button>
      <AnimatePresence>
        {unknownCode !== null && (
          <UnknownBarcode
            key={unknownCode}
            code={unknownCode}
            mode={mode}
            onDone={(outcome) => {
              setUnknownCode(null);
              scanned(outcome);
            }}
            onCancel={() => setUnknownCode(null)}
          />
        )}
      </AnimatePresence>
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
 * The confirmation after each scan: the Product and its new Stock, with undo.
 * A Use that makes the Product Running Low gets Koti's "running low" toast
 * with "Add to list" instead. Undoing a Put Away from the Bag puts it back in the Bag.
 */
function useScanConfirmation() {
  const t = useT();
  const showUndoToast = useUndoToast();
  const showNeedMoreToast = useNeedMoreToast();
  const showRunningLow = useRunningLowToast();
  const showPutAway = usePutAwayToast();
  const undoStockChange = useUndoStockChange();

  return useCallback(
    (outcome: ScanOutcome) => {
      const { name, from, to } = outcome;
      const product = { _id: outcome.productId, name };
      const undo = undoStockChange(product, outcome);
      switch (outcome.action) {
        case "restock":
          return showUndoToast(t("scan.restocked", { name, stock: to }), undo);
        case "putAway":
          return showPutAway(t("scan.putAway", { name, stock: to }), outcome.putAway);
        case "use":
          if (from === to) return showUndoToast(t("scan.alreadyOut", { name }));
          if (!outcome.crossedIntoRunningLow) return showUndoToast(t("scan.used", { name, stock: to }), undo);
          return showRunningLow(product, undo);
        case "needMore":
          return showNeedMoreToast(outcome, outcome);
      }
    },
    [showUndoToast, showNeedMoreToast, showRunningLow, showPutAway, undoStockChange, t],
  );
}

/**
 * An unknown barcode: either a New Product (name typed, Category chosen) or
 * an existing Product (searched), in a sheet over the paused camera. The
 * barcode is linked, then the mode applies. Open Food Facts is asked in the
 * background; its suggestion fills the name only if the Member hasn't started
 * typing, and never links by itself.
 */
function UnknownBarcode({
  code,
  mode,
  onDone,
  onCancel,
}: {
  code: string;
  mode: ScanMode;
  onDone: (outcome: ScanOutcome) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [choice, setChoice] = useState<"new" | "existing">("new");
  const [failed, setFailed] = useState(false);
  const linkNew = useMutation(api.barcodes.linkNew);
  const link = useMutation(api.barcodes.link);
  const lookup = useAction(api.barcodes.lookup);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);

  useEffect(() => {
    let current = true;
    lookup({ code })
      .then((found) => current && setSuggestion(found))
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [code, lookup]);

  const finish = (linking: Promise<ScanOutcome | null>) => {
    setFailed(false);
    linking.then((outcome) => outcome && onDone(outcome)).catch(() => setFailed(true));
  };

  const tabClass = (tab: "new" | "existing") =>
    `min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold ${choice === tab ? "bg-surface shadow-sm" : "text-stone-600 dark:text-stone-400"}`;

  return (
    <Sheet title={t("scan.unknownTitle", { code })} onClose={onCancel}>
      <div className={segments}>
        <button type="button" aria-pressed={choice === "new"} onClick={() => setChoice("new")} className={tabClass("new")}>
          {t("scan.newProduct")}
        </button>
        <button
          type="button"
          aria-pressed={choice === "existing"}
          onClick={() => setChoice("existing")}
          className={tabClass("existing")}
        >
          {t("scan.existingProduct")}
        </button>
      </div>
      {choice === "new" ? (
        <NewProductForm
          suggestion={suggestion}
          onSubmit={(name, locationId, expiryKind) => {
            rememberLocation(locationId);
            finish(linkNew({ code, name, locationId, mode, expiryKind }));
          }}
        />
      ) : (
        <ExistingProductSearch onPick={(productId) => finish(link({ code, productId, mode }))} />
      )}
      {failed && <p className="text-sm text-amber-700 dark:text-amber-400">{t("scan.linkFailed")}</p>}
      <button
        type="button"
        onClick={onCancel}
        className={`${secondaryButton} min-h-11 py-3`}
      >
        {t("common.cancel")}
      </button>
    </Sheet>
  );
}

function NewProductForm({
  suggestion,
  onSubmit,
}: {
  suggestion: Suggestion | null;
  onSubmit: (name: string, locationId: Id<"locations">, expiryKind: ExpiryKind | null) => void;
}) {
  const t = useT();
  const inventory = useQuery(api.inventory.get);
  const nameField = useRef<HTMLInputElement>(null);
  const [typedName, setTypedName] = useState<string | null>(null);
  const [pickedLocation, setPickedLocation] = useState<Id<"locations"> | null>(null);
  const [pickedExpiryKind, setPickedExpiryKind] = useState<ExpiryKind | null | undefined>(undefined);
  const name = typedName ?? suggestion?.name ?? "";
  const suggested = typedName === null && name !== "";
  const expiryKind = pickedExpiryKind === undefined ? (suggestion?.expiryKind ?? null) : pickedExpiryKind;
  const remembered = inventory?.find((location) => location._id === lastLocation())?._id;
  const locationId = pickedLocation ?? remembered ?? inventory?.[0]?._id;

  // A suggested name is selected, so typing replaces it ("Eila laktoositon…" → "Maito").
  useEffect(() => {
    if (suggested && document.activeElement === nameField.current) nameField.current?.select();
  }, [suggested]);

  const submit = () => {
    if (name.trim() !== "" && locationId) onSubmit(name, locationId, expiryKind);
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <input
          ref={nameField}
          value={name}
          onChange={(event) => setTypedName(event.target.value)}
          placeholder={t("scan.productName")}
          aria-label={t("scan.productName")}
          autoFocus
          autoComplete="off"
          enterKeyHint="done"
          className={fieldClass}
        />
        {suggested && <span className="text-xs text-stone-500">{t("scan.suggestedName")}</span>}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-stone-500">{t("product.homeLocation")}</span>
        <select
          value={locationId ?? ""}
          onChange={(event) => setPickedLocation(event.target.value as Id<"locations">)}
          className={fieldClass}
        >
          {inventory?.map((location) => (
            <option key={location._id} value={location._id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-stone-500">{t("product.expiryKind")}</span>
        <ExpiryKindSelect value={expiryKind} onChange={setPickedExpiryKind} className={fieldClass} />
      </label>
      <button
        type="submit"
        disabled={name.trim() === "" || !locationId}
        className={`${primaryButton} min-h-11 py-3 text-lg`}
      >
        {t("common.save")}
      </button>
    </form>
  );
}

function ExistingProductSearch({ onPick }: { onPick: (productId: Id<"products">) => void }) {
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
        className={fieldClass}
      />
      {result && result.matches.length === 0 && <p className="text-sm text-stone-500">{t("scan.noMatches")}</p>}
      <ul className="flex flex-col divide-y divide-stone-200 dark:divide-stone-800">
        {result?.matches.map((product) => (
          <li key={product._id}>
            <button
              type="button"
              onClick={() => onPick(product._id)}
              className="flex min-h-11 w-full flex-col items-start py-2 text-left"
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
