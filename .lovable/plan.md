
# Blockchain Mint v2 — Plan

A rebuild of the Cold Storage Coins / Blockchain Mint companion app, distributed through Apple App Store and Google Play. Built as a TanStack Start web app, wrapped natively with Capacitor. Part of the honest.money ecosystem.

## Product Scope

The app does NOT generate or hold private keys. It is a companion + verification + commerce app for already-loaded physical coins.

Core jobs:
1. **Verify authenticity** — scan a coin (QR / NFC / public address) and confirm it's a genuine Cold Storage Coins / Blockchain Mint product, show mint metadata.
2. **Check balances & history** — read-only blockchain lookup for any public address.
3. **Receive** — show address + QR for a watched coin so others can send funds to it.
4. **Alerts & notifications** — push notification when a watched address receives, spends, or crosses a threshold; price alerts.
5. **Sweep / redeem** — import a coin's private key (camera-scan the hidden key under the tamper sticker) and broadcast a sweep transaction to an address the user chooses. Key is used in-memory only, never stored.
6. **Shop** — browse and order physical coins, tied into honest.money checkout.

## Supported Chains (launch)

BTC, LTC, DOGE, BCH, ETH (+ ERC-20 tokens), BSC (+ BEP-20), ADA, SOL, BNB, TEXITcoin (TXC), Iskander.

Per-chain work is the long pole — see Phasing below.

## Information Architecture

```text
/                      Home: watched coins, total value, recent activity
/scan                  Camera: QR / NFC scan → verify or sweep flow
/verify/:address       Authenticity result + mint metadata + chain summary
/coin/:id              Watched coin detail: balance, tx history, receive, alerts
/sweep                 Guided sweep wizard (scan key → choose dest → confirm → broadcast)
/shop                  Product grid (honest.money catalog)
/shop/:slug            Product detail + buy
/alerts                Alert rules list + create
/settings              Currency, theme, notifications, security (biometric lock)
/about                 Manifesto, terms, privacy, honest.money link
```

Bottom tab bar (native feel): Home · Scan · Shop · Alerts · Settings.

## Key Handling Rules (non-negotiable)

- App never generates private keys.
- Sweep keys live in memory only for the duration of the wizard, then are zeroed. No disk, no cloud, no logs, no analytics events containing key material.
- Watched addresses (public only) are stored locally and optionally synced to the user's account for push notifications.
- Biometric lock (Face ID / fingerprint) gates the sweep flow.

## Native Capabilities (via Capacitor plugins)

- Camera (QR scan): `@capacitor-mlkit/barcode-scanning`
- NFC read: `@capawesome-team/capacitor-nfc`
- Push notifications: `@capacitor/push-notifications` + FCM (Android) / APNs (iOS)
- Biometric auth: `capacitor-native-biometric`
- Haptics, StatusBar, SplashScreen, App, Preferences
- Share sheet for receive addresses

## Backend (Lovable Cloud)

- Auth: email/password + Google + Apple (Apple required for App Store).
- Tables: `profiles`, `watched_addresses`, `alert_rules`, `device_tokens`, `products`, `orders`, `verification_records`.
- Server functions: `lookupAddress`, `getTxHistory`, `broadcastTx`, `verifyMintRecord`, `createAlert`, `registerDeviceToken`, `createOrder`.
- Public route `src/routes/api/public/chain-webhook.ts` for incoming chain-watcher webhooks → push notifications.
- Chain data via per-chain RPC/explorer APIs (Blockstream/Mempool, Etherscan, BscScan, Blockchair, Helius for SOL, Blockfrost for ADA, TXC node).
- Push delivery via FCM (covers both Android directly and iOS via APNs).

## Design Direction

Hardware-product feel — brushed metal, mint-mark engraving, monospaced address text, satisfying tactile confirmations. NOT generic crypto-wallet purple. I'll generate 3 design directions before building the UI shell.

## Footer (per workspace standard)

Part of the [honest.money](https://honest.money) ecosystem · Terms · Privacy · Manifesto. Terms / Privacy / Manifesto pages drafted as part of this build (privacy doc is also required for both store listings).

## Phasing

**Phase 1 — Web foundation + 3 chains (BTC, ETH, TXC)**
Routes, auth, design system, watched addresses, balance lookup, tx history, receive, verify flow, shop scaffolding, push token registration, alerts table. Sweep for the 3 chains. Footer + legal pages.

**Phase 2 — Native wrap**
Capacitor init, iOS + Android projects, camera/NFC/biometric/push plugins wired, app icons + splash, deep links for `coldstoragecoins://verify/:address`.

**Phase 3 — Remaining chains**
LTC, DOGE, BCH, BSC + BEP-20, ADA, SOL, BNB, Iskander, ERC-20 token support. One chain adapter per PR.

**Phase 4 — Store submission (I'll write step-by-step guides for each)**
- Apple: bundle ID, App Store Connect listing, screenshots (6.7" + 6.1" + iPad), privacy nutrition labels, export compliance (uses standard crypto → self-classification), TestFlight, review notes explaining "no key generation, verification + sweep companion for physical coins" to pre-empt the wallet-policy reviewer.
- Google: Play Console listing, signed AAB, data safety form, content rating, internal testing track → closed → production. Financial-features declaration.

**Phase 5 — Shop checkout + ongoing**
honest.money product sync, Stripe or existing honest.money payment rail, order tracking, post-launch alert refinements.

## What I need from you to start Phase 1

1. Confirm honest.money is the canonical brand link (and whether shop checkout goes through an existing honest.money endpoint or needs Stripe set up inside this app).
2. Whether the existing app's user accounts / order history need to be migrated, or this is a clean start.
3. Bundle IDs you want to keep vs. new — Apple `id1352363663` (`com.???`) and Google `com.coldstoragecoins`. Keeping them lets you ship as an update to existing installs; new bundle IDs mean new listings.

## Technical Notes (for reference)

- Stack: TanStack Start v1 + React 19 + Tailwind v4 + shadcn, Lovable Cloud (Postgres + auth + edge), Capacitor 6 for native wrap.
- Cloudflare Workers runtime for server fns — all chain calls go through `fetch` to RPC/explorer HTTPS endpoints (no Node-only libs). `bitcoinjs-lib`, `ethers`, `@solana/web3.js`, `@emurgo/cardano-serialization-lib-browser` are all Worker/edge compatible.
- Sweep signing happens **client-side** in the browser/webview using pure-JS libs so private keys never touch the server.
- Push: device token → Cloud table → server fn calls FCM; chain webhooks fan out per watched address.
- No service worker / PWA offline cache — this ships as a native app, not an installable PWA, so we skip the offline-SW path entirely.
- Lovable can't submit to the stores or sign binaries; I'll deliver the Capacitor projects + a written submission runbook you execute locally with Xcode and Android Studio.
