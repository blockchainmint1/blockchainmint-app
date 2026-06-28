/**
 * Watch tick — called every 15 minutes by pg_cron.
 *
 * For every row in device_watched:
 *   - re-summarize the address (balance + tx count + latest tx)
 *   - diff against stored last_balance / last_tx_hash
 *   - emit an alert row (kind: incoming | outgoing | balance_above | balance_below)
 *     if a threshold crossed or a new positive delta landed
 *
 * Then for every chain in price_state:
 *   - refetch USD price
 *   - emit price_above / price_below alerts for any watched row crossing
 *
 * Each new alert row dispatches a push via FCM if the device has a token.
 *
 * Auth: the Supabase publishable key in the `apikey` header (the cron pattern).
 */

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/watch-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const got = request.headers.get("apikey") ?? request.headers.get("Apikey");
        if (!expected || got !== expected) {
          return new Response("forbidden", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { summarize } = await import("@/lib/chains.functions");
        const { priceUsd } = await import("@/lib/prices.server");
        const { sendPush } = await import("@/lib/push.server");

        type WatchRow = {
          id: string;
          device_id: string;
          chain: string;
          address: string;
          nickname: string | null;
          incoming_enabled: boolean;
          balance_above: number | null;
          balance_below: number | null;
          price_above: number | null;
          price_below: number | null;
          last_balance: number | null;
          last_tx_hash: string | null;
          last_checked_at: string | null;
        };

        type DeviceRow = { device_id: string; push_token: string | null };

        const { data: rows, error: loadErr } = await supabaseAdmin
          .from("device_watched")
          .select("id,device_id,chain,address,nickname,incoming_enabled,balance_above,balance_below,price_above,price_below,last_balance,last_tx_hash,last_checked_at")
          .order("last_checked_at", { ascending: true, nullsFirst: true })
          .limit(500);

        if (loadErr) {
          return Response.json({ ok: false, error: loadErr.message }, { status: 500 });
        }

        const watched = (rows ?? []) as WatchRow[];
        const deviceIds = Array.from(new Set(watched.map(r => r.device_id)));
        const { data: deviceRows } = await supabaseAdmin
          .from("devices")
          .select("device_id,push_token")
          .in("device_id", deviceIds);
        const tokenByDevice = new Map<string, string | null>(
          ((deviceRows ?? []) as DeviceRow[]).map(d => [d.device_id, d.push_token]),
        );

        let balanceAlerts = 0;
        let priceAlerts = 0;
        let pushSent = 0;
        const chainsSeen = new Set<string>();

        // ----- balance / incoming pass --------------------------------------
        for (const w of watched) {
          chainsSeen.add(w.chain);
          let summary;
          try {
            summary = await summarize(w.chain as Parameters<typeof summarize>[0], w.address);
          } catch (e) {
            console.error("[watch-tick] summarize failed", w.chain, w.address, e);
            continue;
          }
          const newBalance = summary.balance;
          const oldBalance = Number(w.last_balance ?? 0);
          const delta = newBalance - oldBalance;
          const events: Array<{ kind: string; title: string; body: string }> = [];

          if (w.last_checked_at && Math.abs(delta) > 1e-12) {
            if (delta > 0 && w.incoming_enabled) {
              events.push({
                kind: "incoming",
                title: `Incoming ${w.chain.toUpperCase()}`,
                body: `${formatAmt(delta)} ${w.chain.toUpperCase()} landed in ${w.nickname ?? short(w.address)}.`,
              });
            } else if (delta < 0) {
              events.push({
                kind: "outgoing",
                title: `Outgoing ${w.chain.toUpperCase()}`,
                body: `${formatAmt(-delta)} ${w.chain.toUpperCase()} left ${w.nickname ?? short(w.address)}.`,
              });
            }
          }

          if (w.balance_above != null && oldBalance < w.balance_above && newBalance >= w.balance_above) {
            events.push({
              kind: "balance_above",
              title: `${w.chain.toUpperCase()} balance crossed ${w.balance_above}`,
              body: `${w.nickname ?? short(w.address)} is now ${formatAmt(newBalance)} ${w.chain.toUpperCase()}.`,
            });
          }
          if (w.balance_below != null && oldBalance > w.balance_below && newBalance <= w.balance_below) {
            events.push({
              kind: "balance_below",
              title: `${w.chain.toUpperCase()} balance fell below ${w.balance_below}`,
              body: `${w.nickname ?? short(w.address)} is now ${formatAmt(newBalance)} ${w.chain.toUpperCase()}.`,
            });
          }

          for (const ev of events) {
            balanceAlerts++;
            const { data: alertRow } = await supabaseAdmin
              .from("device_alerts")
              .insert({
                device_id: w.device_id,
                chain: w.chain,
                address: w.address,
                kind: ev.kind,
                title: ev.title,
                body: ev.body,
                payload: { balance: newBalance, delta },
              })
              .select("id")
              .single();

            const token = tokenByDevice.get(w.device_id);
            if (token) {
              const sent = await sendPush({
                token,
                title: ev.title,
                body: ev.body,
                data: {
                  kind: ev.kind,
                  chain: w.chain,
                  address: w.address,
                  alert_id: alertRow?.id ?? "",
                },
              });
              if (sent) pushSent++;
            }
          }

          await supabaseAdmin
            .from("device_watched")
            .update({
              last_balance: newBalance,
              last_checked_at: new Date().toISOString(),
            })
            .eq("id", w.id);
        }

        // ----- price pass ----------------------------------------------------
        type PriceRow = { chain: string; last_price: number | null };
        const { data: priceState } = await supabaseAdmin
          .from("chain_price_state")
          .select("chain,last_price")
          .in("chain", Array.from(chainsSeen));
        const lastPriceByChain = new Map<string, number | null>(
          ((priceState ?? []) as PriceRow[]).map(p => [p.chain, p.last_price == null ? null : Number(p.last_price)]),
        );

        for (const chain of chainsSeen) {
          let newPrice: number | null = null;
          try {
            newPrice = await priceUsd(chain as Parameters<typeof priceUsd>[0]);
          } catch (e) {
            console.error("[watch-tick] price fetch failed", chain, e);
          }
          const oldPrice = lastPriceByChain.get(chain) ?? null;

          if (newPrice != null && oldPrice != null) {
            const crossers = watched.filter(w => w.chain === chain && (w.price_above != null || w.price_below != null));
            for (const w of crossers) {
              const events: Array<{ kind: string; title: string; body: string }> = [];
              if (w.price_above != null && oldPrice < w.price_above && newPrice >= w.price_above) {
                events.push({
                  kind: "price_above",
                  title: `${w.chain.toUpperCase()} crossed $${w.price_above}`,
                  body: `${w.chain.toUpperCase()} is now $${newPrice.toFixed(2)}.`,
                });
              }
              if (w.price_below != null && oldPrice > w.price_below && newPrice <= w.price_below) {
                events.push({
                  kind: "price_below",
                  title: `${w.chain.toUpperCase()} fell below $${w.price_below}`,
                  body: `${w.chain.toUpperCase()} is now $${newPrice.toFixed(2)}.`,
                });
              }
              for (const ev of events) {
                priceAlerts++;
                const { data: alertRow } = await supabaseAdmin
                  .from("device_alerts")
                  .insert({
                    device_id: w.device_id,
                    chain: w.chain,
                    address: w.address,
                    kind: ev.kind,
                    title: ev.title,
                    body: ev.body,
                    payload: { price: newPrice, prev_price: oldPrice },
                  })
                  .select("id")
                  .single();
                const token = tokenByDevice.get(w.device_id);
                if (token) {
                  const sent = await sendPush({
                    token,
                    title: ev.title,
                    body: ev.body,
                    data: {
                      kind: ev.kind,
                      chain: w.chain,
                      alert_id: alertRow?.id ?? "",
                    },
                  });
                  if (sent) pushSent++;
                }
              }
            }
          }

          if (newPrice != null) {
            await supabaseAdmin
              .from("chain_price_state")
              .upsert(
                { chain, last_price: newPrice, last_checked_at: new Date().toISOString() },
                { onConflict: "chain" },
              );
          }
        }

        return Response.json({
          ok: true,
          watched: watched.length,
          balance_alerts: balanceAlerts,
          price_alerts: priceAlerts,
          push_sent: pushSent,
        });
      },
    },
  },
});

function short(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function formatAmt(n: number): string {
  if (!isFinite(n)) return "?";
  if (Math.abs(n) >= 1) return n.toFixed(4).replace(/\.?0+$/, "");
  return n.toFixed(8).replace(/\.?0+$/, "");
}
