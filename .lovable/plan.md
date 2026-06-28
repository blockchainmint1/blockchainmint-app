# Push Notifications — v1 Plan

Build the full push pipeline now so alerts are ready the moment we wrap in Capacitor. Native device tokens only land on a real device, but everything behind them (watcher, diff engine, threshold config, dispatch) can be built and tested today.

## What ships

1. **Anonymous device identity.** A random `device_id` minted in `localStorage` on first launch. Sent with every server call that needs to know "which device is this." No login required.
2. **Per-device watch sync.** Whenever the local portfolio changes (add coin, rename, delete), push the watched address list up to the backend keyed by `device_id`.
3. **Per-coin alert config UI.** On each coin's detail page, a "Notifications" section to toggle Incoming, set Balance threshold, and set Price threshold. Stored locally + synced to the backend.
4. **Backend watcher.** A `pg_cron` job every 15 min hits `/api/public/hooks/watch-tick`, which:
   - Pulls every active watched address.
   - Re-fetches balance + latest tx for each (reuses the existing chain helpers).
   - Diffs vs. stored last-seen state.
   - Emits alert rows for incoming funds / balance crossings / price crossings.
   - Dispatches push via FCM HTTP v1.
5. **Notifications inbox.** A `/alerts` screen replacing the current "coming soon" stub — lists historical alerts pulled from the backend by `device_id`, marks them read.
6. **Capacitor token registration (wired but inert in browser).** A `registerForPush()` helper that on native calls `PushNotifications.register()` and POSTs the APNs/FCM token to the backend; on web it no-ops cleanly. When you wrap with Capacitor later, push starts working with zero extra code.

## What needs your action (later, not now)

To actually deliver pushes on a real phone we'll need **one** of these from you when we're ready to test on device:

- **Firebase Cloud Messaging service account JSON** — FCM v1 handles Android natively AND iOS (Firebase forwards to APNs for you, given an APNs key). One credential, both platforms. Recommended.
- OR raw Apple **APNs auth key** (.p8) + a separate FCM setup for Android. More moving parts, no benefit unless you're avoiding Firebase entirely.

Either way I'll guide you through the console steps when we get to device testing. For now the dispatch layer is built against FCM v1 with a placeholder secret name (`FCM_SERVICE_ACCOUNT_JSON`) so it slots in cleanly.

## What can't be tested in the preview

Push delivery itself. Everything else (the watcher running, diffs detected, alert rows written, inbox populating, threshold UI) IS testable today. The pipeline up to "would have sent push" works end-to-end; the last hop becomes live the moment a real device registers a token.

---

## Technical details

### New DB tables (migration)

- `devices` — `device_id uuid pk`, `push_token text null`, `push_platform text null` (`ios`/`android`/`web`), `created_at`, `last_seen_at`. RLS: nobody (server-only writes via service role).
- `watched_addresses_v2` (replaces the old auth-bound one for this purpose) — `id pk`, `device_id`, `chain`, `address`, `nickname`, `last_balance numeric`, `last_tx_hash text`, `last_checked_at`. Unique `(device_id, chain, address)`.
- `alert_rules_v2` — `id pk`, `device_id`, `chain`, `address`, `kind` enum (`incoming`/`balance_above`/`balance_below`/`price_above`/`price_below`), `threshold numeric null`, `enabled bool`, `created_at`.
- `alerts` — `id pk`, `device_id`, `chain`, `address`, `kind`, `title`, `body`, `payload jsonb`, `tx_hash text null`, `created_at`, `read_at null`.
- `price_state` — `chain pk`, `last_price numeric`, `last_checked_at`. Used to diff price thresholds without re-fetching every tick.

All four tables: `GRANT` to `service_role` only; RLS enabled with no public policies. Reads happen through a signed server fn that takes the `device_id` from the client (treat the id as a bearer secret stored in localStorage).

### Server pieces

- `src/lib/devices.functions.ts` — `registerDevice({ device_id, push_token?, platform? })`, `syncWatched({ device_id, addresses })`, `setAlertRules({ device_id, rules })`, `listAlerts({ device_id })`, `markAlertRead({ alert_id, device_id })`.
- `src/routes/api/public/hooks/watch-tick.ts` — POST handler that runs the diff + dispatch loop. Authenticated with the Supabase anon key in the `apikey` header (cron pattern). Per-chain fan-out batched by provider to stay polite to Blockchair / Litecoinspace / etc.
- `src/lib/push.server.ts` — FCM v1 dispatcher. Reads `FCM_SERVICE_ACCOUNT_JSON` from env, mints an OAuth token via google-auth-library, POSTs to `fcm.googleapis.com/v1/projects/.../messages:send`. Silently logs and skips when the secret is missing (so today's preview doesn't error).
- `pg_cron` job: `*/15 * * * *` calling the hook.

### Client pieces

- `src/lib/deviceId.ts` — get-or-mint anonymous device id.
- `src/lib/push.ts` — `registerForPush()` (dynamic-imports `@capacitor/push-notifications` on native, no-ops on web).
- `src/lib/alertsSync.ts` — debounced effect: whenever local portfolio or alert rules change, push state to backend.
- `src/components/CoinAlerts.tsx` — three toggles + two threshold inputs, lives on the coin detail page.
- `src/routes/_app.alerts.tsx` — replaces the current placeholder; lists alerts from backend, pull-to-refresh, mark-read on tap.

### Phase order I'll build in

1. DB migration + server fns + cron route (testable via curl).
2. Client wiring: device id, sync, alert rules UI, alerts inbox.
3. FCM dispatcher (dormant until you add the credential).
4. Capacitor push registration helper (dormant until we wrap).
