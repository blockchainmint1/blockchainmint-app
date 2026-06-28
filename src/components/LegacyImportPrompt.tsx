/**
 * First-launch detector + modal for legacy Blockchain Mint data.
 *
 * On native, polls the LegacyDataBridge once. If a blob is found and the user
 * hasn't decided yet, pops a dialog summarizing the importable coins and lets
 * them accept or skip. Web shows nothing — the manual path lives at /import.
 */
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  applyLegacyImport, legacyPromptDismissed, markLegacyDeclined,
  previewLegacyBlob, readLegacyBlobNative, type LegacyImportPreview,
} from "@/lib/legacyImport";
import { toast } from "sonner";

export function LegacyImportPrompt() {
  const [preview, setPreview] = useState<LegacyImportPreview | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (legacyPromptDismissed()) return;
    let cancelled = false;
    void (async () => {
      const blob = await readLegacyBlobNative();
      if (cancelled || !blob) return;
      const p = previewLegacyBlob(blob);
      if (p.importable.length === 0) {
        markLegacyDeclined();
        return;
      }
      setPreview(p);
      setOpen(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!preview) return null;

  const accept = () => {
    const n = applyLegacyImport(preview);
    toast.success(`Imported ${n} ${n === 1 ? "coin" : "coins"} from your old app`);
    setOpen(false);
  };
  const decline = () => {
    markLegacyDeclined();
    setOpen(false);
    toast("You can still import later from Settings");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) decline(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bring over your old coins?</DialogTitle>
          <DialogDescription>
            We found <strong>{preview.importable.length}</strong> {preview.importable.length === 1 ? "coin" : "coins"} from your previous Blockchain Mint install on this device.
            {preview.unrecognized.length > 0 && <> {preview.unrecognized.length} couldn't be read and will be skipped.</>}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-56 overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
          <ul className="space-y-1.5">
            {preview.importable.slice(0, 50).map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="font-mono uppercase text-muted-foreground">{c.chain}</span>
                <span className="flex-1 truncate font-mono text-foreground/80">{c.address}</span>
              </li>
            ))}
            {preview.importable.length > 50 && (
              <li className="pt-1 text-center text-muted-foreground">+ {preview.importable.length - 50} more</li>
            )}
          </ul>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={decline}>Not now</Button>
          <Button onClick={accept}>Import {preview.importable.length}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
