import { useEffect, useRef, useState } from "react";
import type { Html5Qrcode as Html5QrcodeType } from "html5-qrcode";
import { Camera, CameraOff } from "lucide-react";

type Props = {
  onResult: (text: string) => void;
  /** Pause the scanner once we have a hit so we don't fire repeatedly. */
  paused?: boolean;
};

// Preload the library as soon as the component mounts so start() (a user
// gesture) doesn't await a dynamic import before calling getUserMedia —
// iOS Safari and some Chromium builds drop the gesture across that await.
let html5QrcodePromise: Promise<typeof import("html5-qrcode")> | null = null;
function preload() {
  if (!html5QrcodePromise) html5QrcodePromise = import("html5-qrcode");
  return html5QrcodePromise;
}

/**
 * Live camera QR reader. Requests camera permission lazily on user tap so
 * iOS Safari doesn't reject the call. Cleans up cleanly on unmount.
 */
export function QrScanner({ onResult, paused }: Props) {
  const containerId = "qr-reader-region";
  const scannerRef = useRef<Html5QrcodeType | null>(null);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    preload();
    return () => {
      const s = scannerRef.current;
      if (s) {
        s.stop().catch(() => {});
        s.clear();
        scannerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!active || !scannerRef.current) return;
    if (paused) scannerRef.current.pause(true);
    else scannerRef.current.resume();
  }, [paused, active]);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const mod = await preload();
      const scanner = new mod.Html5Qrcode(containerId, { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        text => onResult(text),
        () => { /* per-frame failures are noisy; ignore */ },
      );
      setActive(true);
    } catch (e) {
      const err = e as { name?: string; message?: string };
      const msg =
        err?.name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access in your browser settings."
          : err?.name === "NotFoundError"
          ? "No camera found on this device."
          : err?.message || "Camera unavailable.";
      setError(msg);
      setActive(false);
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    const s = scannerRef.current;
    if (s) {
      try { await s.stop(); } catch { /* ignore */ }
      s.clear();
      scannerRef.current = null;
    }
    setActive(false);
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-secondary">
      <div id={containerId} className="absolute inset-0 [&_video]:size-full [&_video]:object-cover" />

      {!active && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="px-6 text-center">
            <Camera className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-2 text-xs text-muted-foreground">
              Point your camera at the QR engraved on the coin.
            </p>
            <button
              onClick={start}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Camera className="size-3.5" /> Start camera
            </button>
            {error && <p className="mt-3 text-[11px] text-destructive">{error}</p>}
          </div>
        </div>
      )}

      {active && (
        <>
          <div
            className="pointer-events-none absolute inset-6 rounded-xl border-2 border-primary/70"
            style={{ boxShadow: "0 0 0 9999px oklch(0 0 0 / 0.45)" }}
          />
          <button
            onClick={stop}
            className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-md border border-border bg-background/80 px-2.5 py-1.5 text-[11px] font-medium text-foreground backdrop-blur hover:bg-background"
          >
            <CameraOff className="size-3" /> Stop
          </button>
        </>
      )}
    </div>
  );
}
