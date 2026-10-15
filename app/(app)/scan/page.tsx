"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import BarcodeScanner, { prepareScanner } from "@/components/BarcodeScanner";
import { useNeedMore, useNeedMoreToast } from "@/components/NeedMore";
import { useUndoToast } from "@/components/UndoToast";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useT } from "@/lib/i18n";
import { lastLocation, rememberLocation } from "@/lib/lastLocation";
import { lastScanMode, rememberScanMode, SCAN_MODES, type ScanMode } from "@/lib/lastScanMode";

type ScanOutcome = Exclude<FunctionReturnType<typeof api.barcodes.scan>, { unknown: true }>;
type Suggestion = FunctionReturnType<typeof api.barcodes.lookup>;
type ExpiryKind = "bestBefore" | "useBy" | null;

const fieldClass = "min-h-11 w-full rounded-xl border border-zinc-300 bg-background px-4 py-2 text-base dark:border-zinc-700";

/**
 * Scan: pick a mode (the last one is preselected), then scan continuously.
 * Each scan shows a confirmation with the Product and its new Stock; an
 * unknown barcode asks which Product it is, then the mode applies.
 */
export default function ScanPage() {
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
            option === mode ? "bg-foreground text-background" : "border border-zinc-300 dark:border-zinc-700"
          }`}
        >
          <span className="text-xl font-semibold">{t(`scan.mode.${option}`)}</span>
          <span className={`text-sm ${option === mode ? "opacity-80" : "text-zinc-500"}`}>
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
  const confirm = useScanConfirmation();
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);

  const onCode = async (code: string) => {
    const result = await scan({ code, mode });
    if (result.unknown) setUnknownCode((current) => current ?? result.code);
    else confirm(result);
  };

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label={t("scan.mode")} className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {SCAN_MODES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === mode}
            onClick={() => onModeChange(option)}
            className={`min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold ${
              option === mode ? "bg-background shadow" : "text-zinc-500"
            }`}
          >
            {t(`scan.mode.${option}`)}
          </button>
        ))}
      </div>
      {cameraError ? (
        <p className="rounded-xl bg-amber-100 px-4 py-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t("scan.cameraError")}
        </p>
      ) : (
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-black">
          <BarcodeScanner
            onCode={(code) => void onCode(code)}
            onError={() => setCameraError(true)}
            paused={unknownCode !== null}
          />
          <p className="absolute inset-x-0 bottom-0 bg-black/50 px-4 py-2 text-center text-sm text-white">
            {t("scan.hint")}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={onStop}
        className="min-h-11 rounded-xl border border-zinc-300 py-3 font-semibold dark:border-zinc-700"
      >
        {t("scan.stop")}
      </button>
      {unknownCode !== null && (
        <UnknownBarcode
          code={unknownCode}
          mode={mode}
          onDone={(outcome) => {
            setUnknownCode(null);
            confirm(outcome);
          }}
          onCancel={() => setUnknownCode(null)}
        />
      )}
    </div>
  );
}

/**
 * The confirmation after each scan: the Product and its new Stock, with undo.
 * A Use that makes the Product Running Low gets Koti's "running low" toast
 * with "Add to list" instead. A Put Away from the Bag has no undo, as on Lista.
 */
function useScanConfirmation() {
  const t = useT();
  const showUndoToast = useUndoToast();
  const showNeedMoreToast = useNeedMoreToast();
  const needMore = useNeedMore();
  const undoStockChange = useMutation(api.products.undoStockChange);

  return useCallback(
    (outcome: ScanOutcome) => {
      const { productId, name, from, to } = outcome;
      const undo = () => void undoStockChange({ productId, from, to });
      switch (outcome.action) {
        case "restock":
          return showUndoToast(t("scan.restocked", { name, stock: to }), undo);
        case "putAway":
          return showUndoToast(t("scan.putAway", { name, stock: to }));
        case "use":
          if (from === to) return showUndoToast(t("scan.alreadyOut", { name }));
          if (!outcome.crossedIntoRunningLow) return showUndoToast(t("scan.used", { name, stock: to }), undo);
          return showUndoToast(t("koti.runningLow", { name }), undo, {
            label: t("koti.addToList"),
            run: () => void needMore(productId),
          });
        case "needMore":
          return showNeedMoreToast(outcome);
      }
    },
    [showUndoToast, showNeedMoreToast, needMore, undoStockChange, t],
  );
}

/**
 * An unknown barcode: either a New Product (name typed, Location chosen) or
 * an existing Product (searched). The barcode is linked, then the mode applies.
 * Open Food Facts is asked in the background; its suggestion fills the name
 * only if the Member hasn't started typing, and never links by itself.
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
    `min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold ${choice === tab ? "bg-background shadow" : "text-zinc-500"}`;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-h-[85dvh] max-w-xl flex-col gap-4 overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-background px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl dark:border-zinc-800">
      <h2 className="text-lg font-semibold">{t("scan.unknownTitle", { code })}</h2>
      <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
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
      {failed && <p className="text-sm text-red-600">{t("scan.linkFailed")}</p>}
      <button
        type="button"
        onClick={onCancel}
        className="min-h-11 rounded-xl border border-zinc-300 py-3 font-semibold dark:border-zinc-700"
      >
        {t("common.cancel")}
      </button>
    </div>
  );
}

function NewProductForm({
  suggestion,
  onSubmit,
}: {
  suggestion: Suggestion | null;
  onSubmit: (name: string, locationId: Id<"locations">, expiryKind: ExpiryKind) => void;
}) {
  const t = useT();
  const inventory = useQuery(api.inventory.get);
  const nameField = useRef<HTMLInputElement>(null);
  const [typedName, setTypedName] = useState<string | null>(null);
  const [pickedLocation, setPickedLocation] = useState<Id<"locations"> | null>(null);
  const [pickedExpiryKind, setPickedExpiryKind] = useState<ExpiryKind | undefined>(undefined);
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
        {suggested && <span className="text-xs text-zinc-500">{t("scan.suggestedName")}</span>}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-sm text-zinc-500">{t("product.homeLocation")}</span>
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
        <span className="text-sm text-zinc-500">{t("product.expiryKind")}</span>
        <select
          value={expiryKind ?? "none"}
          onChange={(event) => {
            const value = event.target.value;
            setPickedExpiryKind(value === "bestBefore" || value === "useBy" ? value : null);
          }}
          className={fieldClass}
        >
          <option value="none">{t("product.expiryKind.none")}</option>
          <option value="bestBefore">{t("product.expiryKind.bestBefore")}</option>
          <option value="useBy">{t("product.expiryKind.useBy")}</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={name.trim() === "" || !locationId}
        className="min-h-11 rounded-xl bg-foreground py-3 text-lg font-semibold text-background disabled:opacity-40"
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
      {result && result.matches.length === 0 && <p className="text-sm text-zinc-500">{t("scan.noMatches")}</p>}
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {result?.matches.map((product) => (
          <li key={product._id}>
            <button
              type="button"
              onClick={() => onPick(product._id)}
              className="flex min-h-11 w-full flex-col items-start py-2 text-left"
            >
              <span>{product.name}</span>
              <span className="text-xs text-zinc-500">{product.locationName}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
