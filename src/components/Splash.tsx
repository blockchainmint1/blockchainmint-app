import { useEffect, useState } from "react";

/**
 * Brief mint-stamping splash on first load. Sessionstorage-gated so it
 * shows once per browser session, not every navigation.
 */
export function Splash({ minDuration = 900 }: { minDuration?: number }) {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("csc.splash.seen") !== "1";
  });

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      sessionStorage.setItem("csc.splash.seen", "1");
      setVisible(false);
    }, minDuration);
    return () => clearTimeout(t);
  }, [visible, minDuration]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background"
      style={{ animation: "csc-splash-fade 200ms ease-out 700ms forwards" }}
    >
      <div className="relative">
        <div
          className="medallion-gold size-36 rounded-full"
          style={{ animation: "csc-splash-strike 600ms cubic-bezier(.2,.7,.2,1)" }}
        >
          <div
            className="absolute inset-[10%] flex items-center justify-center rounded-full"
            style={{ boxShadow: "inset 0 0 0 1px oklch(0 0 0 / 0.25), inset 0 0 0 2px oklch(1 0 0 / 0.18)" }}
          >
            <span className="font-serif text-5xl font-semibold" style={{ color: "oklch(0.22 0.02 60)" }}>BM</span>
          </div>
        </div>
      </div>
      <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
        Cold Storage Coins
      </p>
      <style>{`
        @keyframes csc-splash-strike {
          0%   { transform: scale(0.6) rotate(-12deg); opacity: 0; filter: blur(6px); }
          60%  { transform: scale(1.06) rotate(0deg);  opacity: 1; filter: blur(0); }
          100% { transform: scale(1)    rotate(0deg);  opacity: 1; }
        }
        @keyframes csc-splash-fade {
          to { opacity: 0; visibility: hidden; }
        }
      `}</style>
    </div>
  );
}
