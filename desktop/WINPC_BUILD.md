# CSC Mint — clean build on a Windows PC (start-to-finish)

This is the **from-scratch** path for a Windows PC that has internet.
If the PC is air-gapped, use [`OFFLINE_BUILD.md`](./OFFLINE_BUILD.md) instead.

Do these one at a time. Each block is a single copy/paste.

---

## Step 1 — Install Python 3.11 (64-bit)

Download: https://www.python.org/downloads/release/python-3119/
Pick **"Windows installer (64-bit)"**.

In the installer, **tick "Add python.exe to PATH"** before clicking Install.

> Must be 3.11. `bip_utils` has no Windows wheels for 3.12+.

Open a **new** Command Prompt and confirm:

```bat
python --version
```

Expect `Python 3.11.9`.

---

## Step 2 — Get the code

If you have Git for Windows (https://git-scm.com/download/win):

```bat
cd %USERPROFILE%\Desktop
git clone <your-repo-url> blockchain-mint
cd blockchain-mint\desktop
```

No Git? Download the repo ZIP, extract to the Desktop, then:

```bat
cd %USERPROFILE%\Desktop\blockchain-mint\desktop
```

---

## Step 3 — Build the exe

```bat
build_windows.bat
```

That script does everything: installs `pyinstaller`, `bip_utils`, `coincurve`,
`opencv-python`, `numpy`, copies `..\keygen-plugins` in beside the app, and
runs PyInstaller with the flags that bundle the crypto and camera binaries.

Takes 3–6 minutes the first time.

---

## Step 4 — Find it

```
desktop\dist\CSCMint.exe
```

One self-contained file. Nothing else needs to travel with it.

---

## Step 5 — Smoke test it (5 minutes, do not skip)

1. Double-click `CSCMint.exe`.
2. **MINT tab** → coin type `TXC 24`, count `2`, output to a scratch folder → MINT.
3. Open the batch folder. You should see `keypair.txt`, `key.txt`,
   `labels.txt`, `snip.txt`, `numbers.txt`.
4. **VERIFY tab** → click **Camera diagnostics**.
   - "camera #0 found" = webcam ready.
   - "no cameras detected" but OpenCV loaded = build is fine, just no camera plugged in.
   - "no camera support" = the OpenCV bundle failed; rebuild.
5. Paste the first seed from `key.txt` into the SEED box, press Enter.
6. Paste the matching line from `labels.txt` into the STICKER box, press Enter.
7. You should get the giant green **✓ MATCH**. Press **space** to advance.
8. Now paste a *wrong* sticker line. You must get the red **✗ MISMATCH**, and it
   must **not** auto-advance.

If all 8 pass, the build is good.

---

## Step 6 — Ship it

The exe is a build artifact — **do not commit it to Git.** Commit the source
(`desktop/*.py`, `keygen-plugins/*.py`) and publish the built exe as a release:

1. Push the source changes to the repo.
2. Cut a GitHub Release tagged e.g. `csc-mint-v1.2.0`.
3. Attach `CSCMint.exe` as a release asset.
4. Record the checksum so the mint station operator can verify what they got:

```bat
certutil -hashfile dist\CSCMint.exe SHA256
```

Publish that SHA-256 next to the download link. Anyone on the offline PC can
re-run the same `certutil` command and compare before trusting the file.

---

## Rebuilding after a code change

```bat
cd %USERPROFILE%\Desktop\blockchain-mint
git pull
cd desktop
build_windows.bat
```

Then re-run Step 5. Every rebuild gets a fresh smoke test — the whole point of
this app is that a bad build silently mislabels real coins.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `'python' is not recognized` | PATH box wasn't ticked. Re-run the installer → Modify → Add to PATH. |
| `No module named coincurve._cffi_backend` | Stale build. Delete `desktop\build` and `desktop\dist`, re-run `build_windows.bat`. |
| `keygen-plugins\txc24.py not found` | You're running the bat from outside the repo. `cd` into the repo's `desktop` folder first. |
| Camera never opens | Close Teams/Zoom/Camera app — Windows only lets one process own the webcam. |
| `pygame.error: WASAPI...` | That's the *old* csc-manager app, not this one. See `README.md`. |
