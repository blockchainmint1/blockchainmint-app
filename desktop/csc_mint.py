#!/usr/bin/env python3
"""
CSC Mint — Blockchain Mint Cold Storage Coin keygen + QA station.

Ugly. Bulletproof. Offline. Zero network code anywhere in this file.

Replaces csc-manager-ui on the air-gapped laser PC. It drives the same coin
service plugins that live in ../keygen-plugins (txc12, txc24, eth12, eth24),
so there is exactly ONE implementation of the crypto and it is the one already
reviewed and tested.

Two tabs:

  MINT    pick a coin type, a count, a laser prefix, an output folder.
          Generates, self-verifies (round-trip re-derivation + duplicate
          detection), then writes the laser files:

              keypair.txt   CSV master (seed,address,privkey,derivation)
              key.txt       the engraved secret — the seed phrase, one per line
              labels.txt    the sticker — <address>,<assetId>
              snip.txt      6-char Asset IDs
              numbers.txt   <LASER><0000> laser sequence
              wif.txt       WIF / hex private key (optional, see checkbox)

  VERIFY  QA station. Two ways to scan, both offline:
            * webcam — click SCAN SEED / SCAN STICKER (needs opencv-python)
            * USB keyboard-wedge scanner — click into the box and scan
          Big green MATCH or big red MISMATCH. Handles wedge scanners that eat
          the spaces between words.

Run:      python csc_mint.py
Build exe: see build_windows.bat
"""

from __future__ import annotations

import importlib.util
import os
import sys
import traceback
import datetime

import tkinter as tk
from tkinter import ttk, filedialog, messagebox

# Webcam QR scanning (optional — falls back to USB keyboard-wedge scanners).
try:
    from . import qr_camera  # type: ignore
except Exception:  # running as a script or frozen by PyInstaller
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import qr_camera  # type: ignore

APP_TITLE = "CSC Mint — Blockchain Mint keygen / QA station"

# --------------------------------------------------------------------------
# Plugin discovery
#
# In dev: ../keygen-plugins next to this file.
# Frozen (PyInstaller --add-data): sys._MEIPASS/keygen-plugins.
# --------------------------------------------------------------------------

PLUGIN_FILES = [
    ("TXC — 24 word seed", "txc24.py", "Txc24CoinService"),
    ("TXC — 12 word seed", "txc12.py", "Txc12CoinService"),
    ("ETH / EVM — 24 word seed", "eth24.py", "Eth24CoinService"),
    ("ETH / EVM — 12 word seed", "eth12.py", "Eth12CoinService"),
]


def _candidate_dirs():
    """Every place the plugin .py files might live, in priority order."""
    cands = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        cands += [
            os.path.join(meipass, "keygen-plugins"),
            os.path.join(meipass, "_internal", "keygen-plugins"),
            meipass,
        ]
    # Folder the .exe (or script) actually sits in
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
    else:
        exe_dir = os.path.dirname(os.path.abspath(__file__))
    here = os.path.dirname(os.path.abspath(__file__))
    for base in (exe_dir, here, os.getcwd()):
        cands += [
            os.path.join(base, "keygen-plugins"),
            os.path.join(os.path.dirname(base), "keygen-plugins"),
            base,
        ]
    # de-dupe, preserve order
    seen, out = set(), []
    for c in cands:
        c = os.path.normpath(c)
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


# Set once a folder is confirmed (or chosen by the user).
_PLUGIN_DIR = None


def plugin_dir() -> str:
    global _PLUGIN_DIR
    if _PLUGIN_DIR:
        return _PLUGIN_DIR
    for cand in _candidate_dirs():
        if os.path.isdir(cand) and any(
            os.path.isfile(os.path.join(cand, f)) for _l, f, _c in PLUGIN_FILES
        ):
            _PLUGIN_DIR = cand
            return cand
    return _candidate_dirs()[0]


def load_services(directory=None):
    """Import each plugin file by path and pull out its CoinService class."""
    d = directory or plugin_dir()
    out = []
    errors = []
    for label, filename, classname in PLUGIN_FILES:
        path = os.path.join(d, filename)
        if not os.path.isfile(path):
            errors.append("{}: not found at {}".format(filename, path))
            continue
        try:
            modname = "cscmint_plugin_" + os.path.splitext(filename)[0]
            spec = importlib.util.spec_from_file_location(modname, path)
            mod = importlib.util.module_from_spec(spec)
            sys.modules[modname] = mod
            spec.loader.exec_module(mod)  # type: ignore[union-attr]
            out.append((label, getattr(mod, classname), mod))
        except Exception as exc:  # pragma: no cover
            errors.append("{}: {}".format(filename, exc))
    return out, errors



# --------------------------------------------------------------------------
# GUI
# --------------------------------------------------------------------------

BIG = ("Segoe UI", 12)
HUGE = ("Segoe UI", 22, "bold")
MONO = ("Consolas", 11)


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("980x740")
        self.minsize(880, 640)

        global _PLUGIN_DIR
        self.services, errors = load_services()
        while not self.services:
            searched = "\n".join("  " + p for p in _candidate_dirs())
            pick = messagebox.askretrycancel(
                "No coin plugins found",
                "Could not load any coin service plugins.\n\nSearched:\n{}\n\n{}\n\n"
                "Click Retry to browse for the 'keygen-plugins' folder "
                "(the one containing txc24.py), or Cancel to quit.".format(
                    searched, "\n".join(errors) or "(directory empty)"
                ),
            )
            if not pick:
                self.destroy()
                raise SystemExit(1)
            chosen = filedialog.askdirectory(title="Select the keygen-plugins folder")
            if not chosen:
                continue
            _PLUGIN_DIR = os.path.normpath(chosen)
            self.services, errors = load_services(_PLUGIN_DIR)
        self.plugin_errors = errors


        nb = ttk.Notebook(self)
        nb.pack(fill="both", expand=True, padx=8, pady=8)
        self.mint_tab = MintTab(nb, self)
        self.verify_tab = VerifyTab(nb, self)
        nb.add(self.mint_tab, text="  MINT  ")
        nb.add(self.verify_tab, text="  VERIFY  ")

        status = "Plugins: {}   |   {}".format(
            ", ".join(l for l, _c, _m in self.services), plugin_dir()
        )
        if errors:
            status += "   |   SKIPPED: " + "; ".join(errors)
        tk.Label(self, text=status, anchor="w", fg="#555").pack(fill="x", padx=10, pady=(0, 6))

    def service_labels(self):
        return [l for l, _c, _m in self.services]

    def service_for(self, label):
        for l, cls, mod in self.services:
            if l == label:
                return cls(), mod
        raise KeyError(label)


class MintTab(ttk.Frame):
    def __init__(self, parent, app: App):
        super().__init__(parent)
        self.app = app

        form = ttk.Frame(self)
        form.pack(fill="x", padx=12, pady=12)

        ttk.Label(form, text="Coin type", font=BIG).grid(row=0, column=0, sticky="w", pady=6)
        self.coin_var = tk.StringVar(value=app.service_labels()[0])
        ttk.Combobox(
            form, textvariable=self.coin_var, values=app.service_labels(),
            state="readonly", width=32, font=BIG,
        ).grid(row=0, column=1, sticky="w", padx=8)

        ttk.Label(form, text="How many coins", font=BIG).grid(row=1, column=0, sticky="w", pady=6)
        self.count_var = tk.StringVar(value="10")
        ttk.Entry(form, textvariable=self.count_var, width=10, font=BIG).grid(
            row=1, column=1, sticky="w", padx=8
        )

        ttk.Label(form, text="Laser prefix", font=BIG).grid(row=2, column=0, sticky="w", pady=6)
        self.laser_var = tk.StringVar(value="A")
        ttk.Entry(form, textvariable=self.laser_var, width=10, font=BIG).grid(
            row=2, column=1, sticky="w", padx=8
        )

        ttk.Label(form, text="Output folder", font=BIG).grid(row=3, column=0, sticky="w", pady=6)
        self.out_var = tk.StringVar(value=default_out_dir())
        ttk.Entry(form, textvariable=self.out_var, width=52, font=MONO).grid(
            row=3, column=1, sticky="w", padx=8
        )
        ttk.Button(form, text="Browse…", command=self.pick_dir).grid(row=3, column=2, sticky="w")

        self.wif_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            form,
            text="Also write wif.txt (raw private keys — extra copy of the secret)",
            variable=self.wif_var,
        ).grid(row=4, column=1, sticky="w", padx=8, pady=(10, 0))

        self.stamp_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            form,
            text="Write into a timestamped subfolder (never overwrite a batch)",
            variable=self.stamp_var,
        ).grid(row=5, column=1, sticky="w", padx=8)

        btns = ttk.Frame(self)
        btns.pack(fill="x", padx=12)
        self.go_btn = tk.Button(
            btns, text="GENERATE BATCH", font=HUGE, bg="#1b5e20", fg="white",
            activebackground="#2e7d32", activeforeground="white",
            height=2, command=self.run,
        )
        self.go_btn.pack(fill="x", pady=10)

        self.log = tk.Text(self, height=18, font=MONO, wrap="none", bg="#111", fg="#ddd")
        self.log.pack(fill="both", expand=True, padx=12, pady=(0, 12))
        self.say("Ready. Nothing has been written yet.")

    def pick_dir(self):
        d = filedialog.askdirectory(initialdir=self.out_var.get() or os.getcwd())
        if d:
            self.out_var.set(d)

    def say(self, msg):
        self.log.insert("end", msg + "\n")
        self.log.see("end")
        self.update_idletasks()

    def run(self):
        self.log.delete("1.0", "end")
        try:
            count = int(self.count_var.get())
        except ValueError:
            messagebox.showerror("Bad count", "Count must be a whole number.")
            return
        if count < 1 or count > 5000:
            messagebox.showerror("Bad count", "Count must be between 1 and 5000.")
            return
        laser = (self.laser_var.get() or "A").strip().upper()
        out = self.out_var.get().strip() or default_out_dir()
        if self.stamp_var.get():
            stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
            slug = self.coin_var.get().split(" ")[0].lower()
            out = os.path.join(out, "{}-{}-{}".format(slug, count, stamp))

        self.go_btn.config(state="disabled")
        try:
            service, _mod = self.app.service_for(self.coin_var.get())
            self.say("Coin type   : {}".format(self.coin_var.get()))
            self.say("Derivation  : {}".format(service.derivation_path()))
            self.say("Generating {} coins…".format(count))

            coins = [service.generate() for _ in range(count)]
            asset_ids = [service.generate_asset_id(c) for c in coins]

            # --- safety gate 1: no duplicates anywhere in the batch --------
            for label, values in (
                ("seed", [c.seed for c in coins]),
                ("address", [c.address for c in coins]),
                ("asset id", [a.upper() for a in asset_ids]),
            ):
                dupes = {v for v in values if values.count(v) > 1}
                if dupes:
                    raise RuntimeError(
                        "ABORT — duplicate {} in batch: {}".format(label, ", ".join(sorted(dupes)))
                    )
            self.say("OK  no duplicate seeds / addresses / asset IDs")

            # --- safety gate 2: re-derive every coin from its own words ----
            for i, coin in enumerate(coins):
                again = service.get_coin_from_mnemonic(coin.seed)
                if again.address != coin.address:
                    raise RuntimeError(
                        "ABORT — round-trip mismatch on coin #{}".format(i + 1)
                    )
            self.say("OK  every seed re-derives to its own address")

            os.makedirs(out, exist_ok=True)
            j = lambda n: os.path.join(out, n)  # noqa: E731

            write(j("keypair.txt"), [service.get_csv_header()] + [service.format(c) for c in coins])
            write(j("key.txt"), ["{}\n".format(c.seed) for c in coins])
            write(j("labels.txt"), ["{},{}\n".format(c.address, a) for c, a in zip(coins, asset_ids)])
            write(j("snip.txt"), ["{}\n".format(a) for a in asset_ids])
            write(j("numbers.txt"), ["{}{:04d}\n".format(laser, i) for i in range(count)])
            written = ["keypair.txt", "key.txt", "labels.txt", "snip.txt", "numbers.txt"]
            if self.wif_var.get():
                write(j("wif.txt"), ["{}\n".format(getattr(c, "private_key", "")) for c in coins])
                written.append("wif.txt")

            self.say("")
            self.say("Wrote to: {}".format(out))
            for name in written:
                self.say("   {}".format(name))
            self.say("")
            self.say("First coin preview:")
            self.say("   seed     {}".format(coins[0].seed))
            self.say("   address  {}".format(coins[0].address))
            self.say("   assetID  {}".format(asset_ids[0]))
            self.say("")
            self.say("REMINDER: wipe this machine at end of shift.")
        except Exception as exc:
            self.say("")
            self.say("!!! " + str(exc))
            self.say(traceback.format_exc())
            messagebox.showerror("Generation failed — nothing shipped", str(exc))
        finally:
            self.go_btn.config(state="normal")


class VerifyTab(ttk.Frame):
    """QA station: scan coin, scan sticker, get a giant verdict."""

    def __init__(self, parent, app: App):
        super().__init__(parent)
        self.app = app
        self.cam_session = None

        top = ttk.Frame(self)
        top.pack(fill="x", padx=12, pady=(12, 4))
        ttk.Label(top, text="Coin type", font=BIG).pack(side="left")
        self.coin_var = tk.StringVar(value=app.service_labels()[0])
        ttk.Combobox(
            top, textvariable=self.coin_var, values=app.service_labels(),
            state="readonly", width=30, font=BIG,
        ).pack(side="left", padx=8)
        self.auto_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            top, text="Auto-verify when the sticker scan lands", variable=self.auto_var
        ).pack(side="left", padx=16)

        cam = ttk.Frame(self)
        cam.pack(fill="x", padx=12, pady=(0, 2))
        ttk.Label(cam, text="Camera #", font=MONO).pack(side="left")
        self.cam_index_var = tk.StringVar(value="0")
        ttk.Spinbox(cam, from_=0, to=8, width=4, textvariable=self.cam_index_var,
                    font=MONO).pack(side="left", padx=(4, 10))
        ttk.Button(cam, text="Find cameras", command=self.find_cameras).pack(side="left")
        ttk.Button(cam, text="Camera diagnostics", command=self.camera_diagnostics).pack(side="left", padx=(8, 0))
        self.cam_status = ttk.Label(cam, text="", font=MONO)
        self.cam_status.pack(side="left", padx=10)

        body = ttk.Frame(self)
        body.pack(fill="x", padx=12)

        seed_hdr = ttk.Frame(body)
        seed_hdr.pack(fill="x", pady=(10, 2))
        ttk.Label(seed_hdr, text="1.  SEED  (scan the laser-etched QR)", font=BIG).pack(side="left")
        tk.Button(seed_hdr, text="📷 SCAN SEED", font=BIG, bg="#0d47a1", fg="white",
                  activebackground="#1565c0", activeforeground="white",
                  command=self.scan_seed_camera).pack(side="right")
        self.seed_entry = tk.Text(body, height=3, font=MONO, wrap="word")
        self.seed_entry.pack(fill="x")
        self.seed_entry.bind("<Return>", self.seed_done)

        stick_hdr = ttk.Frame(body)
        stick_hdr.pack(fill="x", pady=(12, 2))
        ttk.Label(stick_hdr, text="2.  STICKER  (scan the printed label: address, or address,assetID)",
                  font=BIG).pack(side="left")
        tk.Button(stick_hdr, text="📷 SCAN STICKER", font=BIG, bg="#0d47a1", fg="white",
                  activebackground="#1565c0", activeforeground="white",
                  command=self.scan_sticker_camera).pack(side="right")
        self.sticker_var = tk.StringVar()
        self.sticker_entry = tk.Entry(body, textvariable=self.sticker_var, font=MONO)
        self.sticker_entry.pack(fill="x")
        self.sticker_entry.bind("<Return>", lambda _e: self.verify())

        row = ttk.Frame(self)
        row.pack(fill="x", padx=12, pady=10)
        tk.Button(row, text="VERIFY", font=HUGE, bg="#0d47a1", fg="white",
                  activebackground="#1565c0", activeforeground="white",
                  height=1, command=self.verify).pack(side="left", expand=True, fill="x")
        tk.Button(row, text="CLEAR / NEXT COIN", font=BIG, height=2,
                  command=self.clear).pack(side="left", padx=(10, 0))

        self.banner = tk.Label(self, text="waiting for a scan…", font=HUGE,
                               bg="#333", fg="white", height=2)
        self.banner.pack(fill="x", padx=12)

        self.detail = tk.Text(self, height=12, font=MONO, bg="#111", fg="#ddd", wrap="none")
        self.detail.pack(fill="both", expand=True, padx=12, pady=12)

        if not qr_camera.available():
            self.cam_status.config(text="no camera support in this build (USB scanner still works)")

        self.after(200, lambda: self.seed_entry.focus_set())

    # -- webcam ------------------------------------------------------------

    def set_cam_status(self, msg):
        self.cam_status.config(text=msg)

    def find_cameras(self):
        if not qr_camera.available():
            messagebox.showwarning("Camera unavailable", qr_camera.unavailable_reason())
            return
        self.set_cam_status("probing…")
        self.update_idletasks()
        found = qr_camera.list_cameras()
        if found:
            self.cam_index_var.set(str(found[0]))
            self.set_cam_status("cameras found: {}".format(", ".join(str(i) for i in found)))
        else:
            self.set_cam_status("no cameras detected")

    def _start_camera(self, title, on_text):
        if not qr_camera.available():
            messagebox.showwarning("Camera unavailable", qr_camera.unavailable_reason())
            return
        if self.cam_session is not None:
            self.cam_session.stop()
            self.cam_session = None
        try:
            index = int(self.cam_index_var.get())
        except ValueError:
            index = 0
        session = qr_camera.QrCameraSession(
            self, on_result=on_text, on_status=self.set_cam_status,
            camera_index=index, window_title=title,
        )
        self.cam_session = session
        if not session.start():
            self.cam_session = None

    def scan_seed_camera(self):
        def handle(text):
            self.cam_session = None
            self.seed_entry.delete("1.0", "end")
            self.seed_entry.insert("1.0", text)
            self.set_cam_status("seed captured from camera")
            self.preview_only()
            self.sticker_entry.focus_set()
        self._start_camera("Scan SEED QR — ESC to cancel", handle)

    def scan_sticker_camera(self):
        def handle(text):
            self.cam_session = None
            self.sticker_var.set(text)
            self.set_cam_status("sticker captured from camera")
            if self.auto_var.get():
                self.verify()
        self._start_camera("Scan STICKER QR — ESC to cancel", handle)


    # -- helpers -----------------------------------------------------------

    def seed_text(self):
        return self.seed_entry.get("1.0", "end").strip()

    def seed_done(self, _event):
        """Enter in the seed box (scanners send it) jumps to the sticker box."""
        self.sticker_entry.focus_set()
        self.preview_only()
        return "break"

    def clear(self):
        if self.cam_session is not None:
            self.cam_session.stop()
            self.cam_session = None
        self.seed_entry.delete("1.0", "end")
        self.sticker_var.set("")
        self.detail.delete("1.0", "end")
        self.set_banner("waiting for a scan…", "#333")
        self.seed_entry.focus_set()

    def set_banner(self, text, color):
        self.banner.config(text=text, bg=color)

    def show(self, lines):
        self.detail.delete("1.0", "end")
        self.detail.insert("end", "\n".join(lines))

    # -- actions -----------------------------------------------------------

    def preview_only(self):
        """Seed scanned, no sticker yet — show what the sticker SHOULD say."""
        seed = self.seed_text()
        if not seed:
            return
        try:
            service, _mod = self.app.service_for(self.coin_var.get())
            coin = service.get_coin_from_mnemonic(seed)
            asset_id = service.generate_asset_id(coin)
            self.set_banner("SEED OK — now scan the sticker", "#0d47a1")
            self.show([
                "words          : {}".format(coin.seed),
                "expect address : {}".format(coin.address),
                "expect assetID : {}".format(asset_id),
                "derivation     : {}".format(service.derivation_path()),
            ])
        except Exception as exc:
            self.set_banner("BAD SEED — do not ship this coin", "#b71c1c")
            self.show(["{}".format(exc)])

    def verify(self):
        seed = self.seed_text()
        sticker = self.sticker_var.get().strip()
        if not seed:
            self.set_banner("scan the coin first", "#333")
            return
        if not sticker:
            self.preview_only()
            return
        try:
            service, _mod = self.app.service_for(self.coin_var.get())
            parts = [p.strip() for p in sticker.replace("\t", ",").split(",") if p.strip()]
            address = parts[0]
            asset_id = parts[1] if len(parts) > 1 else None
            r = service.verify_pair(seed, address, asset_id)
            self.show([
                "expected address  : {}".format(r["expected_address"]),
                "scanned  address  : {}".format(r["scanned_address"]),
                "expected asset id : {}".format(r["expected_asset_id"]),
                "scanned  asset id : {}".format(r["scanned_asset_id"]),
                "derivation        : {}".format(r["derivation"]),
                "",
                "address match     : {}".format("yes" if r["address_ok"] else "NO"),
                "asset id match    : {}".format("yes" if r["asset_id_ok"] else "NO"),
            ])
            if r["match"]:
                self.set_banner("MATCH — apply the sticker", "#1b5e20")
            else:
                self.set_banner("MISMATCH — DO NOT APPLY", "#b71c1c")
        except Exception as exc:
            self.set_banner("ERROR — DO NOT APPLY", "#b71c1c")
            self.show([str(exc), "", traceback.format_exc()])


# --------------------------------------------------------------------------

def write(path, lines):
    with open(path, "w", newline="\n") as fh:
        fh.writelines(lines)


def default_out_dir():
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    base = desktop if os.path.isdir(desktop) else os.path.expanduser("~")
    return os.path.join(base, "csc-output")


def main():
    App().mainloop()


if __name__ == "__main__":
    main()
