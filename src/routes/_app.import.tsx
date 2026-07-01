import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, FileJson, CheckCircle2, AlertTriangle, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  applyLegacyImport, previewLegacyBlob, readLegacyBlobNative,
  type LegacyBlob, type LegacyImportPreview,
} from "@/lib/legacyImport";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/import")({
  head: () => ({ meta: [{ title: "Import old coins — Blockchain Mint" }] }),
  component: ImportPage,
});

function ImportPage() {
  const navigate = useNavigate();
  const [raw, setRaw] = useState("");
  const [preview, setPreview] = useState<LegacyImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  function analyze() {
    setError(null);
    setPreview(null);
    if (!raw.trim()) { setError("Paste your exported JSON above."); return; }
    let blob: LegacyBlob;
    try {
      blob = JSON.parse(raw) as LegacyBlob;
    } catch {
      setError("That doesn't look like valid JSON.");
      return;
    }
    // Accept either the full AsyncStorage dump OR just the wallets array.
    if (Array.isArray(blob)) blob = { wallets: blob as LegacyBlob["wallets"] };
    const p = previewLegacyBlob(blob);
    if (p.importable.length === 0 && p.unrecognized.length === 0) {
      setError("No wallets found in that JSON.");
      return;
    }
    setPreview(p);
  }

  function doImport() {
    if (!preview) return;
    const n = applyLegacyImport(preview);
    toast.success(`Imported ${n} ${n === 1 ? "coin" : "coins"}`);
    navigate({ to: "/home" });
  }

  return (
    <div className="px-5 pt-10">
      <button onClick={() => navigate({ to: "/settings" })} className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Settings
      </button>

      <header className="mb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Migration</p>
        <h1 className="mt-1 font-serif text-3xl text-foreground">Import old coins</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          On a device that already has the previous Blockchain Mint installed, your coins are imported automatically the first time you open the new app.
          To bring them over by hand, paste a JSON export below.
        </p>
      </header>

      <section className="mb-4 rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileJson className="size-4 text-primary" /> Paste JSON
        </div>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={8}
          placeholder='{ "wallets": [ { "publicKey": "bc1q…", "name": "Birthday 2019" }, … ] }'
          className="font-mono text-xs"
        />
        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3.5" /> {error}
          </p>
        )}
        <Button onClick={analyze} className="mt-3 w-full">Analyze</Button>
      </section>

      {preview && (
        <section className="mb-4 rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <CheckCircle2 className="size-4 text-primary" /> Preview
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            <strong className="text-foreground">{preview.importable.length}</strong> ready to import
            {preview.unrecognized.length > 0 && <> · {preview.unrecognized.length} unrecognized (skipped)</>}
          </p>
          <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
            <ul className="space-y-1.5 text-xs">
              {preview.importable.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="font-mono uppercase text-muted-foreground">{c.chain}</span>
                  <span className="flex-1 truncate font-mono text-foreground/80">{c.address}</span>
                  {c.label && <span className="text-muted-foreground">{c.label}</span>}
                </li>
              ))}
            </ul>
          </div>
          <Button onClick={doImport} className="mt-3 w-full">Import {preview.importable.length} coins</Button>
        </section>
      )}
    </div>
  );
}
