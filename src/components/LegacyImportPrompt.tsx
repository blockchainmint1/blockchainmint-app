/**
 * First-launch handler for legacy Blockchain Mint data.
 *
 * Silently auto-imports the user's coins from the previous install (we never
 * stored private keys, so there's no trust decision to make) and then shows
 * a one-time welcome dialog asking for a store review.
 */
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  applyLegacyImport, legacyPromptDismissed, markLegacyDeclined,
  previewLegacyBlob, readLegacyBlobNative,
} from "@/lib/legacyImport";
import { toast } from "sonner";

const WELCOME_FLAG = "csc.welcome.v5.shown";
const APP_STORE_URL = "https://apps.apple.com/us/app/blockchain-mint/id1352363663";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.coldstoragecoins";

function detectPlatform(): "ios" | "android" | "web" {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "web";
}

export function LegacyImportPrompt() {
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // 1. Silent legacy import (only if not already done)
      if (!legacyPromptDismissed()) {
        try {
          const blob = await readLegacyBlobNative();
          if (!cancelled && blob) {
            const p = previewLegacyBlob(blob);
            if (p.importable.length > 0) {
              const n = applyLegacyImport(p);
              setImportedCount(n);
              toast.success(`Restored ${n} ${n === 1 ? "coin" : "coins"} from your previous install`);
            } else {
              markLegacyDeclined();
            }
          } else if (!cancelled && !blob) {
            // No legacy data on this device — don't keep polling forever
            markLegacyDeclined();
          }
        } catch {
          // Ignore — never block the app on import failures
        }
      }

      // 2. Show welcome dialog once per install
      if (!cancelled && typeof window !== "undefined" && !localStorage.getItem(WELCOME_FLAG)) {
        setWelcomeOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dismissWelcome = () => {
    if (typeof window !== "undefined") localStorage.setItem(WELCOME_FLAG, String(Date.now()));
    setWelcomeOpen(false);
  };

  const leaveReview = () => {
    const platform = detectPlatform();
    const url = platform === "android" ? PLAY_STORE_URL : APP_STORE_URL;
    window.open(url, "_blank", "noopener,noreferrer");
    dismissWelcome();
  };

  return (
    <Dialog open={welcomeOpen} onOpenChange={(v) => { if (!v) dismissWelcome(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to the new Blockchain Mint</DialogTitle>
          <DialogDescription>
            {importedCount > 0 ? (
              <>We brought your <strong>{importedCount}</strong> {importedCount === 1 ? "coin" : "coins"} over from the old version. Everything's faster, prettier, and ready to go.</>
            ) : (
              <>A complete rebuild — faster, prettier, and ready for your collection.</>
            )}
            {" "}If you like it, a quick review goes a long way toward fixing our ratings.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={dismissWelcome}>Maybe later</Button>
          <Button onClick={leaveReview}>Leave a review</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
