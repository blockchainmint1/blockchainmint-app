/**
 * Anonymous per-device server functions.
 *
 * The client mints a `device_id` uuid in localStorage and treats it as a
 * bearer secret. Server functions accept it and scope every read/write to
 * that device. Tables (devices, device_watched, device_alerts) are
 * service-role-only — RLS is enabled with no policies — so the only way to
 * reach them is through these handlers.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DeviceIdSchema = z.string().uuid();
const ChainSchema = z.enum([
  "btc","eth","ltc","doge","bch","bsc","ada","sol","bnb","txc","iskander",
] as const);

const WatchInput = z.object({
  chain: ChainSchema,
  address: z.string().min(8).max(120),
  nickname: z.string().max(80).nullish(),
  incoming_enabled: z.boolean().optional(),
  balance_above: z.number().nullable().optional(),
  balance_below: z.number().nullable().optional(),
  price_above: z.number().nullable().optional(),
  price_below: z.number().nullable().optional(),
});

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Idempotent upsert of the device row + optional push token. */
export const registerDevice = createServerFn({ method: "POST" })
  .inputValidator((input: {
    device_id: string;
    push_token?: string | null;
    push_platform?: "ios" | "android" | "web" | null;
    app_version?: string | null;
  }) =>
    z.object({
      device_id: DeviceIdSchema,
      push_token: z.string().max(500).nullish(),
      push_platform: z.enum(["ios", "android", "web"]).nullish(),
      app_version: z.string().max(40).nullish(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    type DeviceUpsert = {
      device_id: string;
      last_seen_at: string;
      push_token?: string | null;
      push_platform?: "ios" | "android" | "web" | null;
      app_version?: string | null;
    };
    const row: DeviceUpsert = {
      device_id: data.device_id,
      last_seen_at: new Date().toISOString(),
    };
    if (data.push_token !== undefined) row.push_token = data.push_token;
    if (data.push_platform !== undefined) row.push_platform = data.push_platform;
    if (data.app_version !== undefined) row.app_version = data.app_version;
    const { error } = await sb.from("devices").upsert(row, { onConflict: "device_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Replace the device's full watched-set + alert rules in one shot. */
export const syncDeviceWatched = createServerFn({ method: "POST" })
  .inputValidator((input: {
    device_id: string;
    addresses: Array<z.infer<typeof WatchInput>>;
  }) =>
    z.object({
      device_id: DeviceIdSchema,
      addresses: z.array(WatchInput).max(500),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = await admin();

    // Make sure the device row exists.
    await sb.from("devices").upsert(
      { device_id: data.device_id, last_seen_at: new Date().toISOString() },
      { onConflict: "device_id" },
    );

    // Delete rows that are no longer watched.
    const keys = data.addresses.map(a => `${a.chain}|${a.address.toLowerCase()}`);
    const { data: existing } = await sb
      .from("device_watched")
      .select("id,chain,address")
      .eq("device_id", data.device_id);
    const toDelete = (existing ?? [])
      .filter(r => !keys.includes(`${r.chain}|${r.address.toLowerCase()}`))
      .map(r => r.id);
    if (toDelete.length) {
      await sb.from("device_watched").delete().in("id", toDelete);
    }

    // Upsert each watched row (preserves last_balance/last_tx_hash if present).
    for (const a of data.addresses) {
      const payload = {
        device_id: data.device_id,
        chain: a.chain,
        address: a.address,
        nickname: a.nickname ?? null,
        incoming_enabled: a.incoming_enabled ?? true,
        balance_above: a.balance_above ?? null,
        balance_below: a.balance_below ?? null,
        price_above: a.price_above ?? null,
        price_below: a.price_below ?? null,
      };
      const { error } = await sb
        .from("device_watched")
        .upsert(payload, { onConflict: "device_id,chain,address", ignoreDuplicates: false });
      if (error) console.error("[syncDeviceWatched] upsert failed", error.message);
    }

    return { ok: true, count: data.addresses.length };
  });

export const listDeviceAlerts = createServerFn({ method: "POST" })
  .inputValidator((input: { device_id: string; limit?: number }) =>
    z.object({
      device_id: DeviceIdSchema,
      limit: z.number().int().min(1).max(200).optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const { data: rows, error } = await sb
      .from("device_alerts")
      .select("id,chain,address,kind,title,body,payload,tx_hash,created_at,read_at")
      .eq("device_id", data.device_id)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const markDeviceAlertRead = createServerFn({ method: "POST" })
  .inputValidator((input: { device_id: string; alert_id: string }) =>
    z.object({ device_id: DeviceIdSchema, alert_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await sb
      .from("device_alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("device_id", data.device_id)
      .eq("id", data.alert_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllDeviceAlertsRead = createServerFn({ method: "POST" })
  .inputValidator((input: { device_id: string }) =>
    z.object({ device_id: DeviceIdSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = await admin();
    const { error } = await sb
      .from("device_alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("device_id", data.device_id)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
