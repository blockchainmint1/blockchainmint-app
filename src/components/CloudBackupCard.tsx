import { useCloudBackup } from "@/lib/api/useCloudBackup";
import { CloudUpload, Loader2 } from "lucide-react";

/** Cloud backup of the coin list via the Admin API's `/my-coins` endpoints. */
export function CloudBackupCard() {
  const { available, state, message, sync } = useCloudBackup();
  if (!available) return null;

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <CloudUpload className="size-5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground">Cloud backup</p>
          <p className="text-[11px] text-muted-foreground">
            {message ?? "Your coin list syncs to your account on every launch."}
          </p>
        </div>
      </div>
      <button
        onClick={() => void sync()}
        disabled={state === "syncing"}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium transition hover:border-primary/40 disabled:opacity-60"
      >
        {state === "syncing" && <Loader2 className="size-4 animate-spin" />}
        {state === "syncing" ? "Syncing…" : "Sync now"}
      </button>
    </section>
  );
}
