#!/usr/bin/env python3
"""
CSC Mint — Blockchain Mint Cold Storage Coin keygen + QA station.

Ugly. Bulletproof. Offline. Zero network code anywhere in this file.

Replaces csc-manager-ui on the air-gapped laser PC. It drives the same coin
service plugins that live in ../keygen-plugins (txc12, eth12, btc12,
ltc12, dash12, xmr12),
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

  VERIFY  QA station. Pick the coin type, press START, and the camera runs
          continuously: scan the seed QR, then the sticker QR. Giant green ✓
          (SPACE = next coin) or giant red ✗ (needs a click, and resumes
          waiting for the SAME sticker so a missed sticker scan never loses
          the coin). USB keyboard-wedge scanners feed the manual box.

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

APP_VERSION = "1.3.0"
APP_TITLE = f"CSC Mint v{APP_VERSION} — Blockchain Mint keygen / QA station"

# --------------------------------------------------------------------------
# Plugin discovery
#
# In dev: ../keygen-plugins next to this file.
# Frozen (PyInstaller --add-data): sys._MEIPASS/keygen-plugins.
# --------------------------------------------------------------------------

PLUGIN_FILES = [
    ("TXC — 12 word seed", "txc12.py", "Txc12CoinService"),
    ("ETH / EVM — 12 word seed", "eth12.py", "Eth12CoinService"),
    ("BTC — 12 word seed", "btc12.py", "Btc12CoinService"),
    ("LTC — 12 word seed", "ltc12.py", "Ltc12CoinService"),
    ("DASH — 12 word seed", "dash12.py", "Dash12CoinService"),
    ("XMR — 12 word seed", "xmr12.py", "Xmr12CoinService"),
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


def detect_service_label(services, seed_text: str, sticker_address: str) -> str | None:
    """Pick the right plugin from seed word count + sticker address format."""
    words = len(seed_text.strip().split())
    if words != 12:
        return None
    raw = sticker_address.strip()
    addr = raw.lower()
    if addr.startswith("0x"):
        chain = "ETH"
    elif addr.startswith("txc:") or raw.startswith("T"):
        chain = "TXC"
    elif raw.startswith("X") and len(raw) in range(30, 40):
        chain = "DASH"
    elif raw.startswith("L") or raw.startswith("M") or addr.startswith("ltc1"):
        chain = "LTC"
    elif raw.startswith("1") or raw.startswith("3") or addr.startswith("bc1"):
        chain = "BTC"
    elif (raw.startswith("4") or raw.startswith("8")) and len(raw) >= 90:
        chain = "XMR"
    else:
        return None
    for label, _cls, _mod in services:
        if chain in label and str(words) in label:
            return label
    return None



# --------------------------------------------------------------------------
# GUI
# --------------------------------------------------------------------------


BIG = ("Segoe UI", 12)
HUGE = ("Segoe UI", 22, "bold")
GIANT = ("Segoe UI", 32, "bold")
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
                "(the one containing txc12.py), or Cancel to quit.".format(
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
    """QA station.

    Flow (hands-free after the first click):

        idle     → big START button
        seed     → camera live, waiting for the seed QR
        sticker  → seed accepted, camera still live, waiting for the sticker QR
        match    → giant green ✓ ; SPACEBAR starts the next coin
        error    → giant red ✗ ; needs a mouse click, then goes BACK to the
                   state it failed in (a bad sticker keeps the same seed, so a
                   missed sticker scan doesn't force a re-scan of the coin)
    """

    IDLE, SEED, STICKER, MATCH, ERROR = "idle", "seed", "sticker", "match", "error"

    def __init__(self, parent, app: App):
        super().__init__(parent)
        self.app = app
        self.cam_session = None
        self.state = self.IDLE
        self.resume_state = self.SEED
        self.seed = ""
        self.expected_address = ""
        self.expected_asset_id = ""

        # -- header: coin type + camera ------------------------------------
        top = ttk.Frame(self)
        top.pack(fill="x", padx=12, pady=(12, 4))
        ttk.Label(top, text="Coin type", font=BIG).pack(side="left")
        labels = app.service_labels()
        default = next((l for l in labels if "TXC" in l and "12" in l), labels[0])
        self.coin_var = tk.StringVar(value=default)
        ttk.Combobox(
            top, textvariable=self.coin_var, values=labels,
            state="readonly", width=28, font=BIG,
        ).pack(side="left", padx=8)

        ttk.Label(top, text="Camera #", font=MONO).pack(side="left", padx=(16, 2))
        self.cam_index_var = tk.StringVar(value="0")
        ttk.Spinbox(top, from_=0, to=8, width=4, textvariable=self.cam_index_var,
                    font=MONO).pack(side="left", padx=(2, 8))
        ttk.Button(top, text="Find cameras", command=self.find_cameras).pack(side="left")
        ttk.Button(top, text="Diagnostics", command=self.camera_diagnostics).pack(side="left", padx=(6, 0))

        self.cam_status = ttk.Label(self, text="", font=MONO)
        self.cam_status.pack(fill="x", padx=12)

        # -- the big stage --------------------------------------------------
        self.stage = tk.Frame(self, bg="#222", height=220)
        self.stage.pack(fill="x", padx=12, pady=(6, 0))
        self.stage.pack_propagate(False)

        self.start_btn = tk.Button(
            self.stage, text="▶  START", font=("Segoe UI", 40, "bold"),
            bg="#0d47a1", fg="white", activebackground="#1565c0",
            activeforeground="white", command=self.start_station,
        )
        self.start_btn.pack(expand=True, fill="both", padx=40, pady=30)

        self.verdict = tk.Label(self.stage, text="", font=("Segoe UI", 96, "bold"),
                                bg="#222", fg="white")
        self.banner = tk.Label(self, text="press START to begin", font=GIANT,
                               bg="#333", fg="white", height=2)
        self.banner.pack(fill="x", padx=12)

        # Error acknowledgement — only visible while a red ✗ is on screen.
        self.ack_btn = tk.Button(self, text="CLEAR ERROR  (click to continue)",
                                 font=HUGE, bg="#b71c1c", fg="white",
                                 activebackground="#c62828", activeforeground="white",
                                 command=self.ack_error)

        # -- captured values ------------------------------------------------
        info = ttk.Frame(self)
        info.pack(fill="x", padx=12, pady=(8, 0))
        self.seed_label = tk.Label(info, text="seed     : —", font=MONO, anchor="w",
                                   justify="left", wraplength=920)
        self.seed_label.pack(fill="x")
        self.addr_label = tk.Label(info, text="expected : —", font=MONO, anchor="w",
                                   justify="left", wraplength=920)
        self.addr_label.pack(fill="x")

        # -- manual / USB wedge fallback -------------------------------------
        man = ttk.Frame(self)
        man.pack(fill="x", padx=12, pady=(8, 0))
        ttk.Label(man, text="Manual / USB scanner:", font=MONO).pack(side="left")
        self.manual_var = tk.StringVar()
        ent = tk.Entry(man, textvariable=self.manual_var, font=MONO)
        ent.pack(side="left", fill="x", expand=True, padx=6)
        ent.bind("<Return>", self._manual_submit)
        self.manual_entry = ent
        ttk.Button(man, text="Enter", command=lambda: self._manual_submit(None)).pack(side="left")
        ttk.Button(man, text="Stop / Reset", command=self.reset_station).pack(side="left", padx=(6, 0))

        self.detail = tk.Text(self, height=8, font=MONO, bg="#111", fg="#ddd", wrap="none")
        self.detail.pack(fill="both", expand=True, padx=12, pady=10)

        if not qr_camera.available():
            self.set_cam_status("no camera support in this build (USB scanner still works)")

        # Spacebar only advances from a green MATCH.
        for widget in (self, self.banner, self.stage, self.verdict, self.detail):
            widget.bind("<Key-space>", self._on_space)
        self.bind_all("<Key-space>", self._on_space_global, add="+")

    # -- camera plumbing ---------------------------------------------------

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

    def camera_diagnostics(self):
        report = qr_camera.diagnostics()
        self.set_cam_status(report.splitlines()[0])
        messagebox.showinfo("Camera diagnostics", report)

    def _camera_on(self, title):
        """Run one continuous session that feeds every decode into on_scan."""
        self._camera_off()
        if not qr_camera.available():
            self.set_cam_status("camera off — use the manual box or a USB scanner")
            return
        try:
            index = int(self.cam_index_var.get())
        except ValueError:
            index = 0
        session = qr_camera.QrCameraSession(
            self, on_result=self.on_scan, on_status=self.set_cam_status,
            camera_index=index, window_title=title, continuous=True,
        )
        self.cam_session = session
        if not session.start():
            self.cam_session = None

    def _camera_off(self):
        if self.cam_session is not None:
            self.cam_session.stop()
            self.cam_session = None

    # -- stage rendering ----------------------------------------------------

    def _show_start(self):
        self.verdict.pack_forget()
        self.ack_btn.pack_forget()
        self.start_btn.pack(expand=True, fill="both", padx=40, pady=30)
        self.stage.config(bg="#222")

    def _show_live(self):
        self.start_btn.pack_forget()
        self.ack_btn.pack_forget()
        self.verdict.config(text="◉  CAMERA LIVE", font=("Segoe UI", 44, "bold"),
                            bg="#102a43", fg="#8fd3ff")
        self.stage.config(bg="#102a43")
        self.verdict.pack(expand=True, fill="both")

    def _show_verdict(self, symbol, color, fg="white"):
        self.start_btn.pack_forget()
        self.verdict.config(text=symbol, font=("Segoe UI", 110, "bold"), bg=color, fg=fg)
        self.stage.config(bg=color)
        self.verdict.pack(expand=True, fill="both")

    def set_banner(self, text, color):
        self.banner.config(text=text, bg=color)

    def show(self, lines):
        self.detail.delete("1.0", "end")
        self.detail.insert("end", "\n".join(lines))

    # -- state machine ------------------------------------------------------

    def start_station(self):
        self.seed = ""
        self.expected_address = ""
        self.expected_asset_id = ""
        self.seed_label.config(text="seed     : —")
        self.addr_label.config(text="expected : —")
        self._enter_seed()

    def _enter_seed(self):
        self.state = self.SEED
        self.resume_state = self.SEED
        self._show_live()
        self.set_banner("WAITING FOR SEED QR", "#0d47a1")
        self._camera_on("Scan SEED QR — ESC to stop")
        self.manual_entry.focus_set()

    def _enter_sticker(self):
        self.state = self.STICKER
        self.resume_state = self.STICKER
        self._show_live()
        self.set_banner("WAITING FOR PUBLIC KEY STICKER", "#4a3800")
        self._camera_on("Scan STICKER QR — ESC to stop")
        self.manual_entry.focus_set()

    def _enter_match(self):
        self.state = self.MATCH
        self._camera_off()
        self.ack_btn.pack_forget()
        self._show_verdict("✓", "#1b5e20")
        self.set_banner("MATCH — apply the sticker, then press SPACE", "#1b5e20")
        self.focus_set()

    def _enter_error(self, headline, lines, resume_state):
        self.state = self.ERROR
        self.resume_state = resume_state
        self._camera_off()
        self._show_verdict("✗", "#b71c1c")
        self.set_banner(headline, "#b71c1c")
        self.ack_btn.pack(fill="x", padx=12, pady=(6, 0))
        self.show(lines)

    def ack_error(self):
        """Manual acknowledgement — resume exactly where we failed."""
        self.ack_btn.pack_forget()
        if self.resume_state == self.STICKER and self.seed:
            self._enter_sticker()
        else:
            self.start_station()

    def reset_station(self):
        self._camera_off()
        self.state = self.IDLE
        self.seed = ""
        self.expected_address = ""
        self.expected_asset_id = ""
        self.seed_label.config(text="seed     : —")
        self.addr_label.config(text="expected : —")
        self.manual_var.set("")
        self.show([])
        self._show_start()
        self.set_banner("press START to begin", "#333")

    def _on_space(self, _event):
        if self.state == self.MATCH:
            self.start_station()
        return "break"

    def _on_space_global(self, event):
        """Space advances from MATCH even when focus wandered — but never
        while the operator is typing in an entry/text widget."""
        if self.state != self.MATCH:
            return None
        if isinstance(event.widget, (tk.Entry, tk.Text, ttk.Entry, ttk.Combobox)):
            return None
        self.start_station()
        return "break"

    # -- scan handling ------------------------------------------------------

    def _manual_submit(self, _event=None):
        text = self.manual_var.get().strip()
        if not text:
            return "break"
        self.manual_var.set("")
        if self.state in (self.IDLE, self.MATCH):
            self.start_station()
        self.on_scan(text)
        return "break"

    @staticmethod
    def _looks_like_seed(text: str) -> bool:
        return len(text.strip().split()) >= 12

    def on_scan(self, text: str):
        text = (text or "").strip()
        if not text:
            return
        if self.state == self.SEED:
            self._handle_seed(text)
        elif self.state == self.STICKER:
            self._handle_sticker(text)
        # verdict states ignore scans until they're cleared

    def _handle_seed(self, text):
        if not self._looks_like_seed(text):
            self._enter_error(
                "THAT'S NOT A SEED — scan the laser-etched QR",
                ["scanned: {}".format(text)],
                self.SEED,
            )
            return
        try:
            service, _mod = self.app.service_for(self.coin_var.get())
            coin = service.get_coin_from_mnemonic(text)
            asset_id = service.generate_asset_id(coin)
        except Exception as exc:
            self._enter_error(
                "BAD SEED — do not ship this coin",
                [str(exc), "", "scanned: {}".format(text)],
                self.SEED,
            )
            return
        self.seed = coin.seed
        self.expected_address = coin.address
        self.expected_asset_id = asset_id
        self.seed_label.config(text="seed     : {}".format(coin.seed))
        self.addr_label.config(text="expected : {}   ({})".format(coin.address, asset_id))
        self.show([
            "coin type      : {}".format(self.coin_var.get()),
            "derivation     : {}".format(service.derivation_path()),
            "expect address : {}".format(coin.address),
            "expect assetID : {}".format(asset_id),
            "",
            "Now scan the sticker.",
        ])
        self._enter_sticker()

    def _handle_sticker(self, text):
        # Operator scanned the NEXT coin's seed without scanning this sticker.
        if self._looks_like_seed(text):
            self._enter_error(
                "STICKER MISSED — that was a seed",
                [
                    "You scanned a seed phrase while the station was waiting",
                    "for a sticker.",
                    "",
                    "Still waiting for : {}".format(self.expected_address),
                    "assetID           : {}".format(self.expected_asset_id),
                    "",
                    "Clear this error and scan the sticker for THIS coin.",
                ],
                self.STICKER,
            )
            return

        parts = [p.strip() for p in text.replace("\t", ",").split(",") if p.strip()]
        address = parts[0]
        asset_id = parts[1] if len(parts) > 1 else None
        try:
            service, _mod = self.app.service_for(self.coin_var.get())
            r = service.verify_pair(self.seed, address, asset_id)
        except Exception as exc:
            self._enter_error("ERROR — DO NOT APPLY",
                              [str(exc), "", traceback.format_exc()], self.STICKER)
            return

        detail = [
            "expected address  : {}".format(r["expected_address"]),
            "scanned  address  : {}".format(r["scanned_address"]),
            "expected asset id : {}".format(r["expected_asset_id"]),
            "scanned  asset id : {}".format(r["scanned_asset_id"]),
            "derivation        : {}".format(r["derivation"]),
            "",
            "address match     : {}".format("yes" if r["address_ok"] else "NO"),
            "asset id match    : {}".format("yes" if r["asset_id_ok"] else "NO"),
        ]
        if r["match"]:
            self.show(detail)
            self._enter_match()
        else:
            hint = detect_service_label(self.app.services, self.seed, address)
            if hint and hint != self.coin_var.get():
                detail += ["", "NOTE: that sticker looks like {} — check the coin type.".format(hint)]
            self._enter_error("MISMATCH — DO NOT APPLY", detail, self.STICKER)




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
