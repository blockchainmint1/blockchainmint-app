import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDeviceAlerts, markAllDeviceAlertsRead, markDeviceAlertRead } from "@/lib/devices.functions";
import { getDeviceId } from "@/lib/deviceId";
import { Bell, BellOff, CheckCheck, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { CHAINS } from "@/lib/chains";
import { CoinLogo } from "@/components/CoinLogo";

export const Route = createFileRoute("/_app/alerts")({
  head: () => ({ meta: [{ title: "Alerts — Blockchain Mint" }] }),
  component: AlertsPage,
});

function AlertsPage() {
  const [deviceId, setDeviceId] = useState<string>("");
  useEffect(() => { setDeviceId(getDeviceId()); }, []);

  const listFn = useServerFn(listDeviceAlerts);
  const markFn = useServerFn(markDeviceAlertRead);
  const markAllFn = useServerFn(markAllDeviceAlertsRead);
  const qc = useQueryClient();

  const { data: alerts, isFetching, refetch } = useQuery({
    queryKey: ["device-alerts", deviceId],
    queryFn: () => listFn({ data: { device_id: deviceId } }),
    enabled: !!deviceId,
    refetchInterval: 60_000,
  });

  const unread = (alerts ?? []).filter(a => !a.read_at).length;

  async function markRead(id: string) {
    if (!deviceId) return;
    await markFn({ data: { device_id: deviceId, alert_id: id } });
    qc.invalidateQueries({ queryKey: ["device-alerts", deviceId] });
  }

  async function markAll() {
    if (!deviceId) return;
    await markAllFn({ data: { device_id: deviceId } });
    qc.invalidateQueries({ queryKey: ["device-alerts", deviceId] });
  }

  return (
    <div className="px-5 pt-10">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Alerts</p>
          <h1 className="mt-1 font-serif text-3xl text-foreground">Notifications</h1>
          {unread > 0 && <p className="mt-1 text-xs text-primary">{unread} unread</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground"
            aria-label="Refresh"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
          {unread > 0 && (
            <button
              onClick={markAll}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
      </header>

      {alerts && alerts.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center">
          <BellOff className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-serif text-lg text-foreground">No alerts yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We check every watched coin every 15 minutes. As soon as something moves you'll see it here — and on your home screen once the native app is installed.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {(alerts ?? []).map(a => {
          const chain = CHAINS[a.chain as keyof typeof CHAINS];
          return (
            <li
              key={a.id}
              onClick={() => !a.read_at && markRead(a.id)}
              className={`flex items-start gap-3 rounded-lg border p-3 transition ${
                a.read_at
                  ? "border-border bg-card/60"
                  : "border-primary/40 bg-card cursor-pointer hover:border-primary"
              }`}
            >
              {chain ? <CoinLogo chain={chain.id} size={28} /> : <Bell className="mt-0.5 size-5 text-primary" />}
              <div className="min-w-0 flex-1">
                <p className="font-serif text-sm text-foreground">{a.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.body}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  {new Date(a.created_at).toLocaleString()} · {a.kind.replace("_", " ")}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-center text-[11px] text-muted-foreground">
        Tip: tap a coin on <Link to="/home" className="text-primary hover:underline">Home</Link> to set per-coin thresholds.
      </p>
    </div>
  );
}
