# Desktop QA station auto-detect + auto-advance

## Goal
Make the CSC Mint desktop VERIFY tab feel like the old QA station: scan the coin, scan the sticker, see a big pass/fail indicator, and advance to the next coin with minimal keystrokes.

## What it does now
- The operator must pick a coin type from a dropdown before scanning.
- SCAN SEED fills the seed box; SCAN STICKER fills the sticker box and optionally runs verify.
- After a verify, the operator must click CLEAR / NEXT COIN.
- There is no keyboard shortcut and no large pass/fail indicator.

## What we'll change

### 1. Auto-detect coin type
- After the SEED scan, count the words (12 vs 24).
- After the STICKER scan, read the address format:
  - `0x...` → ETH
  - TXC/CashAddr style → TXC
- Combine word count + address format to pick the right plugin (`txc12`, `txc24`, `eth12`, `eth24`).
- The dropdown still exists but updates automatically; the operator can override it manually.

### 2. Big pass/fail indicator
- Replace the small banner with a large, high-contrast verdict area:
  - Green check + "MATCH — apply sticker"
  - Red X + "MISMATCH — DO NOT APPLY"
- Keep the detailed text below for debugging.

### 3. Auto-verify and auto-advance
- After a STICKER scan, automatically run verify.
- If the result is MATCH, wait a configurable short delay (default 1.5s) then automatically clear the form and focus the seed box for the next coin.
- If MISMATCH, do NOT auto-clear; require a manual action so the operator must see the error.

### 4. Keyboard shortcut
- Bind the spacebar to the same action as CLEAR / NEXT COIN.
- When a verdict is shown, pressing space clears it and focuses the seed box.
- When waiting for a scan, pressing space does nothing (prevents accidental clears).

### 5. Keep the USB scanner fallback
- The keyboard-wedge scanner path remains unchanged: type into the box and press Enter.
- Auto-detect still works on pasted/typed input, not just camera scans.

## Files to change
- `desktop/csc_mint.py` — VerifyTab logic, new UI, key bindings, auto-clear timer.
- `desktop/qr_camera.py` — optional: ensure the scan result callback can be fired repeatedly after a clear.

## Out of scope
- Mobile app scan flow (that already has its own detection).
- Adding new coin types beyond the existing TXC/ETH plugins.

## Verification
- Test with a real webcam and a printed sticker.
- Test with USB scanner by typing a seed and sticker into the boxes.
- Confirm MATCH auto-clears and MISMATCH does not.
- Confirm spacebar clears only after a verdict is displayed.
