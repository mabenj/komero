"use client";

import { useEffect, useEffectEvent, useRef } from "react";

type Props = {
  /** Called once per barcode read; the same code again within about 2 s is ignored. */
  onCode: (code: string) => void;
  /** The camera didn't start: permission denied, no camera, or not HTTPS. */
  onError?: (err: unknown) => void;
  /** The camera's video is playing. */
  onReady?: () => void;
  /** Stops decoding (the camera stays on), e.g. while the unknown barcode sheet is open. */
  paused?: boolean;
};

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;
// A code still in view keeps the window open, so a package held to the camera counts once.
const REPEAT_WINDOW_MS = 2000;
// About 8 decodes a second: plenty for EAN/UPC, easy on the battery.
const SCAN_INTERVAL_MS = 120;

/** Warms up the decoder (a ~1 MB WebAssembly download), so the first scan is instant. */
export function prepareScanner() {
  import("barcode-detector/ponyfill")
    .then(({ prepareZXingModule }) => prepareZXingModule({ fireImmediately: true }))
    // Offline it just isn't ready yet; starting the camera loads it again.
    .catch(() => {});
}

/**
 * The back camera, decoding EAN-13, EAN-8, UPC-A and UPC-E continuously with
 * the ZXing WebAssembly decoder (iPhone Safari has no native BarcodeDetector,
 * and using the same decoder everywhere gives the same codes on every phone).
 * The camera turns off when this unmounts.
 */
export default function BarcodeScanner({ onCode, onError, onReady, paused = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const emitCode = useEffectEvent((code: string) => onCode(code));
  const emitError = useEffectEvent((err: unknown) => onError?.(err));
  const emitReady = useEffectEvent(() => onReady?.());
  const isPaused = useEffectEvent(() => paused);

  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let last = { code: "", at: 0 };
    const stopCamera = () => stream?.getTracks().forEach((track) => track.stop());

    (async () => {
      try {
        const { BarcodeDetector } = await import("barcode-detector/ponyfill");
        const detector = new BarcodeDetector({ formats: [...FORMATS] });
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) return stopCamera();
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        emitReady();

        const tick = async () => {
          if (cancelled) return;
          if (!isPaused() && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            try {
              const [hit] = await detector.detect(video);
              if (hit) {
                const now = Date.now();
                if (hit.rawValue !== last.code || now - last.at > REPEAT_WINDOW_MS) emitCode(hit.rawValue);
                last = { code: hit.rawValue, at: now };
              }
            } catch {
              // One undecodable frame is fine.
            }
          }
          timer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        void tick();
      } catch (err) {
        if (!cancelled) emitError(err);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopCamera();
    };
  }, []);

  return <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />;
}
