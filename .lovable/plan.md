## My honest take on the audit

Short version: **this is a legitimately good audit.** Whoever did it actually read the code (file paths and line numbers match), understood the stack (TanStack Start + Supabase + Capacitor + non-custodial wallet), and the severity calls are fair. No FUD, no padded findings. They also correctly call out what we got *right* (non-custodial signing, RLS + RESTRICTIVE policies, the order-price trigger, no real secrets in git).

Of the 18 findings, **1 is a real bug we missed, 3 are meaningful hardening gaps, the rest are best-practice polish.** Here's the honest breakdown:

### Findings that are real and we should fix

**BM-01 — Cron webhook auth uses the public anon key. (High, real bug.)**
This is the one that genuinely stings. `watch-tick.ts` checks `apikey === SUPABASE_PUBLISHABLE_KEY`, but that key is *public by design* — it ships in the JS bundle. So the endpoint is effectively unauthenticated, and it drives the service-role client + paid Alchemy/CMC calls. An attacker can't steal funds with it, but they can burn our API budget and spam pushes. **They're right, we missed it.** Fix is a dedicated `CRON_SECRET` compared in constant time.

**BM-02 — No CSP / security headers. (High, real gap.)**
We emit zero security headers. For a wallet where users paste private keys into a webpage, a locked `connect-src` is the single highest-leverage control we don't have. Honest answer: we never added a header layer because TanStack Start doesn't ship one by default and it wasn't on our radar. They're right to flag it High.

**BM-04 / BM-05 — No rate limiting on public server fns + device endpoints. (Medium, real.)**
`lookupAddress`, `broadcastSweep`, `registerDevice` etc. are wide open. Same cost-abuse / alerting-DoS story as BM-01. Easy win with a small per-IP limiter + a Cloudflare WAF rule.

**BM-12 — Native `LegacyDataBridge` ships private keys across the bridge. (High, real, mobile-only.)**
The Kotlin/Swift shims dump *all* of legacy AsyncStorage to JS, including `privateKey`. Our `legacyImport.ts` ignores the field, but the secret is already in the WebView heap by then — and that WebView loads a remote origin (BM-03), so any future XSS turns into key exfiltration. The fix is to strip secrets at the native layer before they cross the bridge. Genuinely missed.

**BM-08 — `.env` is tracked in git.**
Only public values are in there today, so no leak happened, but they're right that this is a footgun waiting for the first time anyone adds a real secret. Untrack + `.env.example`.

### Findings that are fair but more nuanced

**BM-03 — `server.url` points at the live web origin (remote-shell WebView).**
This is a real architectural tradeoff, not a bug. We chose it deliberately so we can ship updates without an App Store resubmission — which was *your explicit ask*. The auditor is right that it makes the web origin the trust root for the whole installed base. The mitigation isn't "stop doing it"; it's the things we should already be doing: HSTS preload, drop wildcard `allowNavigation`, strong CSP (BM-02), subdomain monitoring. Worth a conscious "yes, we accept this" rather than a fix.

**BM-06 / BM-07 — Address-swap protection + screen-capture / biometric on sweep.**
These are user-protection enhancements, not bugs in our code. They're the highest-value adds for actual fund safety on a non-custodial wallet (clipboard hijackers and screenshot malware are the realistic 2025 threats). Worth doing.

**BM-09 / BM-10 / BM-11 — verbose errors, dual lockfiles, loose address regex.**
Low/info. Real, cheap, do them while we're in there.

### Where I'd push back (mildly)

- They label **BM-03 as High**. I'd call it Medium-with-accepted-risk given the product decision. As long as we ship BM-02 (CSP) and lock `allowNavigation`, the practical blast radius is small.
- The **AI-AGENT-SECURITY-PROMPT.md** rules are good but partly redundant with my existing instructions (no secrets in client, RLS on every table, never accept private keys server-side, etc.). I'd still adopt it as a project rule so it's enforced explicitly.
- They flag the "wiped from memory" UI copy as overstated (BM-07). Fair — it should say "cleared from this screen" rather than implying GC magic.

### Why we missed what we missed (honest)

- **BM-01:** classic "the cron pattern uses the apikey header" muscle memory. The header *name* is `apikey`, but the *value* needs to be a real secret, not the publishable key. I should have caught this when wiring `watch-tick.ts`.
- **BM-02:** no header layer was ever scaffolded; we built features and never circled back to platform hardening.
- **BM-04/05:** I treated server functions as "internal" because they're called from our own client — forgot they're public HTTPS endpoints to anyone with `curl`.
- **BM-12:** the native bridge shipped as a "read everything, filter in JS" convenience. That's exactly the wrong default for a wallet.

Net: the audit is worth taking seriously and acting on. None of these are "your app is broken today"; they're "an attacker who shows up tomorrow has more rope than they should."

---

## Proposed remediation plan

I'd ship in 3 phases so we don't smash version 5.0.0 mid-review. Each phase is its own approved plan.

**Phase A — Fix the real bugs (do this first, ~1 build)**
1. BM-01: add `CRON_SECRET` via `generate_secret`, switch `watch-tick.ts` to require `x-cron-secret` header with constant-time compare, update pg_cron job.
2. BM-08: untrack `.env`, add `.env.example`, update `.gitignore`.
3. BM-12: patch `native-templates/{ios,android}/LegacyDataBridge*` to strip `privateKey` / mnemonic / seed fields before returning the blob; add a test to `legacyImport.ts`.
4. BM-07 copy fix: soften the "wiped from memory" string in `_app.sweep.tsx`.

**Phase B — Platform hardening (~1 build)**
5. BM-02: add `src/lib/security-headers.ts` (CSP, HSTS, frame-ancestors, Permissions-Policy with camera=self) wired into `src/server.ts`. Ship as `Content-Security-Policy-Report-Only` first, verify Capacitor + Google OAuth + push still work on a TestFlight build, then flip to enforcing.
6. BM-04 / BM-05: add `src/lib/rateLimit.ts` (per-IP sliding window, in-memory per worker is fine for v1), apply to `lookupAddress`, `getTxHistory`, `verifyMintRecord`, `getSweepUtxos`, `getEthSweepContext`, `broadcastSweep`, `broadcastEthSweep`, `registerDevice`, `syncDeviceWatched`, alert endpoints.
7. BM-10: standardize on bun; delete `package-lock.json`.
8. BM-11 / BM-09: tighten server-fn address validation with per-chain regex; map upstream errors to generic client messages.

**Phase C — User-fund protections on the sweep screen (~1 build, native rebuild required)**
9. BM-07: install `@capawesome/capacitor-screen-protector`, guard sweep + QR screens.
10. BM-07: install `@capgo/capacitor-native-biometric`, require biometric before Broadcast.
11. BM-06: redesign the "Review & Broadcast" step — chunked full-address display, retype-last-4 confirmation, warn on near-duplicate addresses in history.
12. BM-03 mitigation: drop wildcards from `allowNavigation`, enable HSTS preload on the domain.

**Not doing (with reason)**
- Full migration to bundled native assets (BM-03 "ideal" fix). Conflicts with the product decision to push updates without store resubmission. Mitigations above are the trade.
- CSP nonce upgrade. Nice-to-have; the locked `connect-src` is what actually protects against key exfiltration.

**Adopt as a project rule**
- Save the relevant bits of `AI-AGENT-SECURITY-PROMPT.md` to project memory so I don't regress on key handling, secret placement, RLS, or rate limiting in future builds.

If you approve, I'd start with **Phase A** — it's the only one that includes a real-bug fix and it doesn't need a new TestFlight build (cron change + native bridge edit + git hygiene). Phases B and C each want their own round of device testing before going to Apple.
