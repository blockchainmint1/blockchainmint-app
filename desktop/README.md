# CSC Mint — offline desktop keygen + QA station

Replacement for `csc-manager-ui`. Ugly Tkinter GUI, no dependencies beyond
`bip_utils`, **zero network code**. It drives the same coin service plugins in
[`../keygen-plugins`](../keygen-plugins) that the app and QA flow already use,
so there is one implementation of the crypto, not two.

## What it does

**MINT tab** — pick coin type (TXC 12/24, ETH 12/24), count, laser prefix,
output folder. Before it writes a single byte it:

1. checks the batch for duplicate seeds, addresses and Asset IDs
2. re-derives every coin from its own words and confirms the address matches

If either gate fails, nothing is written. Then it emits the laser files:

| file | contents |
| --- | --- |
| `keypair.txt` | CSV master: `seed,address,privkey,derivation` |
| `key.txt` | the engraved secret — the seed phrase, one per line |
| `labels.txt` | the sticker — `<address>,<assetId>` |
| `snip.txt` | 6-char Asset IDs |
| `numbers.txt` | `<LASER><0000>` laser sequence |
| `wif.txt` | raw WIF / hex key — **off by default** (extra copy of the secret) |

Batches go into a timestamped subfolder so you can never overwrite one.

**VERIFY tab** — the QA station.

1. Scan the laser-etched QR into the SEED box. It immediately shows the address
   and Asset ID the sticker *should* say.
2. Scan the sticker into the STICKER box.
3. Giant green **MATCH — apply the sticker** or red **MISMATCH — DO NOT APPLY**.

Run-on seeds from keyboard-wedge scanners (the space-eating bug) are repaired
automatically by the plugins' `_normalize_mnemonic`, so a scan like
`rulepapersizeseek…` still resolves to the right coin.

## Running it from source

```
python -m pip install bip_utils
python desktop/csc_mint.py
```

## Getting it onto the air-gapped PC

The offline machine never touches the internet, so you build the app somewhere
else and carry one file across.

**On any internet-connected Windows PC** (with Python 3.9+ installed from
python.org — tick "Add Python to PATH"):

1. Copy this whole repo folder to that PC (git clone, or download the ZIP).
2. Double-click `desktop\build_windows.bat`.
3. It produces **`desktop\dist\CSCMint.exe`** — a single self-contained file
   with Python, `bip_utils` and the plugins baked in.
4. Put `CSCMint.exe` on a USB stick, copy it to the offline PC's desktop,
   double-click. Nothing to install over there. Ever.

That's the whole airgap story: **one .exe on a stick.** When you change a
plugin or the GUI here, rebuild the exe on the online PC and carry the new one
across.

### Verify the exe before you trust it

On the offline PC, mint a batch of 2 into a scratch folder, then use the VERIFY
tab with the seed from `key.txt` and the matching line from `labels.txt`. Green
banner = the build is good.

### End of shift

Same as always — DoD triple-pass wipe. The exe writes nothing outside the
output folder you choose, but the output folder holds live secrets.

## Why not just fix csc-manager-ui?

The space-eating scanner bug lives in that repo's `pynput` listener: `on_press`
only appends `key.char`, and the space bar has no `.char`. If you keep using
that app, the fix is:

```python
from pynput import keyboard

def on_press(self, key):
    if key == keyboard.Key.space:
        self.buffer += " "
        return
    char = getattr(key, "char", None)
    if char is not None:
        self.buffer += char
```

CSC Mint sidesteps it entirely — a QR/wedge scanner types straight into a
normal text box, spaces and all, and run-on strings get repaired anyway.

## "pygame.error: WASAPI can't find requested audio endpoint"

That crash comes from the **old** `csc-manager.py`, not from CSC Mint. Line 13
calls `pygame.mixer.init()` for its beep sounds; on a PC with no audio device
(or with the Windows Audio service off — common on a freshly imaged airgapped
box) WASAPI has no endpoint and pygame raises before the GUI ever opens.

Three ways out, best first:

1. **Use CSC Mint instead.** It has no pygame, no audio, no `pynput`, and no
   network. `CSCMint.exe` will start on that machine as-is.
2. **Patch the old app** — make the mixer optional:

   ```python
   try:
       pygame.mixer.init()
   except pygame.error:
       pass          # no audio device on this box; beeps disabled
   ```

   Every later `pygame.mixer.Sound(...).play()` needs the same guard, or set a
   `SOUND_OK = False` flag and check it before playing.
3. **Give Windows a fake audio endpoint** — enable the "Windows Audio" service
   (`services.msc`), or install a virtual audio driver. Works, but you're
   installing extra software on an airgapped mint station to hear a beep.
