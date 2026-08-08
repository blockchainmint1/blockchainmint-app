#!/usr/bin/env python3
"""
Webcam QR scanning for the CSC Mint VERIFY station.

Offline. No network. Multi-engine decoder, in priority order:

  1. WeChat QR (``cv2.wechat_qrcode.WeChatQRCode``) — ships with
     ``opencv-contrib-python``. CNN detector + optional super-resolution.
     By far the best on small, low-contrast, motion-blurred, or partially
     glared codes — exactly the laser-engraved / sticker-on-shiny-gold case.
  2. ZBar (``pyzbar``) — battle-tested C library, excellent on damaged and
     low-resolution symbols. The Windows wheel bundles its own DLLs.
  3. OpenCV ``QRCodeDetector`` (+ curved variant) — last-resort fallback so
     a plain ``opencv-python`` install still works.

Each engine is run over several *image variants* (raw, grayscale + CLAHE,
unsharp-masked, adaptive-threshold, 2x upscaled centre crop). A hit from any
engine on any variant wins. This is the single biggest accuracy lever: most
"won't scan" cases are contrast/scale problems, not detector problems.

Design notes
------------
* The camera loop is driven by Tk's ``after()`` so the Tkinter mainloop stays
  responsive and everything runs on the main thread (OpenCV's HighGUI windows
  are not thread-safe on Windows).
* The live preview is a ``cv2.imshow`` window so we don't need Pillow.
* Camera is opened at 1080p MJPG with autofocus on — webcam defaults
  (640x480, YUY2) throw away the detail a small QR needs.
* Preview hotkeys: ESC cancel, ``+``/``-`` zoom, ``f`` autofocus toggle,
  ``[``/``]`` manual focus, ``e``/``d`` exposure.
"""

from __future__ import annotations

import sys
import threading as _threading
import time



_cv2 = None
_np = None
_import_error = None

try:  # pragma: no cover - environment dependent
    import cv2 as _cv2  # type: ignore
    import numpy as _np  # type: ignore
except Exception as exc:  # pragma: no cover
    _import_error = exc

_pyzbar = None
_pyzbar_error = None
try:  # pragma: no cover
    from pyzbar import pyzbar as _pyzbar  # type: ignore
except Exception as exc:  # pragma: no cover
    _pyzbar_error = exc

# WeChat model files are optional; the detector works (without the
# super-resolution stage) when constructed with empty paths.
_wechat = None
_wechat_error = None


def _wechat_detector():
    global _wechat, _wechat_error
    if _wechat is not None or _wechat_error is not None:
        return _wechat
    if _cv2 is None:
        return None
    try:
        _wechat = _cv2.wechat_qrcode.WeChatQRCode()
    except Exception as exc:  # opencv-python (non-contrib) or missing models
        _wechat_error = exc
        _wechat = None
    return _wechat


def available() -> bool:
    """True when webcam scanning can be attempted."""
    return _cv2 is not None


def engines() -> list[str]:
    """Names of decode engines actually usable in this build."""
    names = []
    if _wechat_detector() is not None:
        names.append("WeChat QR (opencv-contrib)")
    if _pyzbar is not None:
        names.append("ZBar (pyzbar)")
    if _cv2 is not None:
        names.append("OpenCV QRCodeDetector")
    return names


def diagnostics() -> str:
    """Return a human-readable report of camera + decoder readiness."""
    lines = []
    if _cv2 is None:
        lines.append("OpenCV: NOT loaded")
        lines.append("Camera scanning: UNAVAILABLE in this build")
        lines.append("Details: {}".format(_import_error or "unknown import error"))
        lines.append("USB keyboard-wedge scanners still work.")
        return "\n".join(lines)

    lines.append("OpenCV: loaded (cv2 present)")
    try:
        lines.append("OpenCV version: {}".format(_cv2.__version__))
    except Exception:
        pass

    lines.append("")
    lines.append("Decode engines:")
    if _wechat_detector() is not None:
        lines.append("  [OK]   WeChat QR  — best engine (opencv-contrib-python)")
    else:
        lines.append("  [MISS] WeChat QR  — install opencv-contrib-python for the")
        lines.append("                     high-accuracy CNN decoder")
        if _wechat_error:
            lines.append("                     ({})".format(_wechat_error))
    if _pyzbar is not None:
        lines.append("  [OK]   ZBar       — strong on damaged/low-res codes")
    else:
        lines.append("  [MISS] ZBar       — install pyzbar for a second opinion")
        if _pyzbar_error:
            lines.append("                     ({})".format(_pyzbar_error))
    lines.append("  [OK]   OpenCV QRCodeDetector — fallback")

    lines.append("")
    found = list_cameras()
    if found:
        lines.append("Cameras detected: {}".format(", ".join("#{}".format(i) for i in found)))
    else:
        lines.append("Cameras detected: NONE")
        lines.append("If a webcam is plugged in, try changing the camera # or reconnecting it.")

    lines.append("")
    lines.append("Preview hotkeys: ESC cancel | +/- zoom | f autofocus | [ ] focus | e/d exposure")
    return "\n".join(lines)


def unavailable_reason() -> str:
    return (
        "OpenCV isn't installed in this build, so the camera can't be used.\n\n"
        "Install it with:  python -m pip install opencv-contrib-python pyzbar\n"
        "(offline: copy those wheels to the USB package folder)\n\n"
        "You can still scan with a USB keyboard-wedge QR scanner — just click "
        "into the box and scan.\n\n"
        "Details: {}".format(_import_error)
    )


def list_cameras(max_index: int = 5) -> list[int]:
    """Probe camera indexes 0..max_index-1 and return the ones that open."""
    if _cv2 is None:
        return []
    found = []
    for idx in range(max_index):
        cap = _open(idx)
        if cap is not None and cap.isOpened():
            ok, _frame = cap.read()
            if ok:
                found.append(idx)
        if cap is not None:
            cap.release()
    return found


def _open(index: int):
    if _cv2 is None:
        return None
    try:
        if sys.platform.startswith("win"):
            # DirectShow avoids the ~2s MSMF startup stall on most webcams.
            cap = _cv2.VideoCapture(index, _cv2.CAP_DSHOW)
            if cap.isOpened():
                return cap
            cap.release()
        return _cv2.VideoCapture(index)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Image variants — the accuracy multiplier
# ---------------------------------------------------------------------------

def _variants(frame, aggressive: bool):
    """Yield progressively harder-working views of one frame.

    Cheap variants first so the common case stays fast; ``aggressive`` adds
    the expensive ones (used on every Nth frame or once we're struggling).
    """
    yield frame
    if _np is None:
        return
    try:
        gray = _cv2.cvtColor(frame, _cv2.COLOR_BGR2GRAY)
    except Exception:
        return

    # CLAHE: local contrast. Kills the gold-coin glare gradient that flattens
    # a sticker's black/white into mid-grey.
    try:
        clahe = _cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        eq = clahe.apply(gray)
        yield eq
    except Exception:
        eq = gray

    # Unsharp mask: recovers edges lost to a soft/out-of-focus close-up.
    try:
        blur = _cv2.GaussianBlur(eq, (0, 0), 3)
        yield _cv2.addWeighted(eq, 1.8, blur, -0.8, 0)
    except Exception:
        pass

    if not aggressive:
        return

    # Centre crop, upscaled: a small code in the middle of a 1080p frame has
    # too few pixels per module until we zoom into it.
    try:
        h, w = gray.shape[:2]
        cy, cx = h // 2, w // 2
        half = min(h, w) // 3
        crop = eq[max(0, cy - half):cy + half, max(0, cx - half):cx + half]
        if crop.size:
            yield _cv2.resize(crop, None, fx=2.0, fy=2.0, interpolation=_cv2.INTER_CUBIC)
    except Exception:
        pass

    # Adaptive threshold: hard binarisation for engraved/etched codes where
    # the "black" is just a duller shade of metal.
    try:
        yield _cv2.adaptiveThreshold(
            eq, 255, _cv2.ADAPTIVE_THRESH_GAUSSIAN_C, _cv2.THRESH_BINARY, 31, 5
        )
    except Exception:
        pass

    # Otsu on a blurred copy: good for printed stickers under uneven light.
    try:
        soft = _cv2.GaussianBlur(eq, (5, 5), 0)
        _t, otsu = _cv2.threshold(soft, 0, 255, _cv2.THRESH_BINARY + _cv2.THRESH_OTSU)
        yield otsu
    except Exception:
        pass


def _decode_wechat(img) -> str:
    det = _wechat_detector()
    if det is None:
        return ""
    try:
        texts, _pts = det.detectAndDecode(img)
        for t in texts or ():
            if t and t.strip():
                return t.strip()
    except Exception:
        pass
    return ""


def _decode_zbar(img) -> str:
    if _pyzbar is None:
        return ""
    try:
        for sym in _pyzbar.decode(img):
            try:
                t = sym.data.decode("utf-8", "ignore").strip()
            except Exception:
                continue
            if t:
                return t
    except Exception:
        pass
    return ""


def _decode_opencv(img, detector) -> str:
    if detector is None:
        return ""
    try:
        ok, texts, _pts, _straight = detector.detectAndDecodeMulti(img)
        if ok and texts:
            for t in texts:
                if t and t.strip():
                    return t.strip()
    except Exception:
        pass
    try:
        text, pts, _straight = detector.detectAndDecode(img)
        if text and text.strip():
            return text.strip()
    except Exception:
        pass
    # Curved: engraved codes on a domed coin face read as warped grids.
    try:
        text, _pts, _straight = detector.detectAndDecodeCurved(img)
        if text and text.strip():
            return text.strip()
    except Exception:
        pass
    return ""


def decode_image(img, aggressive: bool = True, detector=None) -> str:
    """Run every available engine over every variant. First hit wins."""
    if _cv2 is None:
        return ""
    if detector is None:
        try:
            detector = _cv2.QRCodeDetector()
        except Exception:
            detector = None
    for variant in _variants(img, aggressive):
        for fn in (_decode_wechat, _decode_zbar):
            text = fn(variant)
            if text:
                return text
        text = _decode_opencv(variant, detector)
        if text:
            return text
    return ""


class QrCameraSession:
    """One live-preview scanning session bound to a Tk widget's event loop."""

    def __init__(self, widget, on_result, on_status=None, camera_index=0,
                 window_title="Scan QR — ESC to cancel",
                 continuous=False, repeat_cooldown_ms=2500):
        self.widget = widget
        self.on_result = on_result
        self.on_status = on_status or (lambda _msg: None)
        self.camera_index = camera_index
        self.window_title = window_title
        # continuous=True keeps the camera running after a decode so the
        # station can take the seed scan and the sticker scan back-to-back
        # without the operator touching anything.
        self.continuous = continuous
        self.repeat_cooldown_ms = repeat_cooldown_ms
        self.cap = None
        self.detector = None
        self._stopped = False
        self._after_id = None
        self._last_text = None
        self._last_text_at = 0.0
        self._frames = 0
        self._misses = 0
        self._zoom = None
        self._focus = None
        self._exposure = None
        # Decoding runs on a worker thread so the preview never stalls: the
        # multi-engine pipeline costs 100-400ms per frame, which is exactly
        # what made the old single-threaded loop look like 1 fps / 20s behind.
        self._lock = _threading.Lock()
        self._pending = None        # newest frame handed to the decoder
        self._decoded = None        # text the worker found, picked up in _tick
        self._decode_busy = False
        self._worker = None
        self._hit_until = 0.0


    # -- lifecycle ---------------------------------------------------------

    def start(self) -> bool:
        if _cv2 is None:
            self.on_status("camera unavailable — OpenCV not installed")
            return False
        self.cap = _open(self.camera_index)
        if self.cap is None or not self.cap.isOpened():
            self.on_status("could not open camera #{}".format(self.camera_index))
            self.stop()
            return False
        self._configure_camera()
        self.detector = _cv2.QRCodeDetector()
        try:
            _cv2.namedWindow(self.window_title, _cv2.WINDOW_NORMAL)
            _cv2.resizeWindow(self.window_title, 900, 600)
        except Exception:
            pass
        eng = engines()
        self.on_status("camera live ({}) — hold the QR steady, 6–10in away".format(
            eng[0] if eng else "no decoder"))
        self._tick()
        return True

    def _configure_camera(self):
        """Push the webcam into the highest-detail mode it supports."""
        cap = self.cap
        def _set(prop, value):
            try:
                cap.set(prop, value)
            except Exception:
                pass
        # MJPG first: most USB webcams only offer 1080p over MJPG, and the
        # default YUY2 caps them at 640x480 — far too few pixels for a small QR.
        try:
            _set(_cv2.CAP_PROP_FOURCC, _cv2.VideoWriter_fourcc(*"MJPG"))
        except Exception:
            pass
        _set(_cv2.CAP_PROP_FRAME_WIDTH, 1920)
        _set(_cv2.CAP_PROP_FRAME_HEIGHT, 1080)
        if (cap.get(_cv2.CAP_PROP_FRAME_WIDTH) or 0) < 1200:
            _set(_cv2.CAP_PROP_FRAME_WIDTH, 1280)
            _set(_cv2.CAP_PROP_FRAME_HEIGHT, 720)
        _set(_cv2.CAP_PROP_BUFFERSIZE, 1)   # always decode the newest frame
        _set(_cv2.CAP_PROP_AUTOFOCUS, 1)
        _set(_cv2.CAP_PROP_FPS, 30)

    def stop(self):
        if self._stopped:
            return
        self._stopped = True
        if self._after_id is not None:
            try:
                self.widget.after_cancel(self._after_id)
            except Exception:
                pass
            self._after_id = None
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None
        if _cv2 is not None:
            try:
                _cv2.destroyWindow(self.window_title)
            except Exception:
                pass
            for _ in range(4):
                try:
                    _cv2.waitKey(1)
                except Exception:
                    break

    # -- manual camera controls -------------------------------------------

    def _bump(self, prop, attr, delta, lo, hi):
        cap = self.cap
        if cap is None:
            return
        cur = getattr(self, attr)
        if cur is None:
            try:
                cur = cap.get(prop)
            except Exception:
                cur = lo
        cur = max(lo, min(hi, (cur or lo) + delta))
        setattr(self, attr, cur)
        try:
            cap.set(prop, cur)
        except Exception:
            pass
        self.on_status("{} = {:.0f}".format(attr.strip("_"), cur))

    def _handle_key(self, key) -> bool:
        """Return False when the session should stop."""
        if key == 27:  # ESC
            self.on_status("camera cancelled")
            return False
        if key in (ord("+"), ord("=")):
            self._bump(_cv2.CAP_PROP_ZOOM, "_zoom", 20, 0, 500)
        elif key in (ord("-"), ord("_")):
            self._bump(_cv2.CAP_PROP_ZOOM, "_zoom", -20, 0, 500)
        elif key == ord("f"):
            try:
                self.cap.set(_cv2.CAP_PROP_AUTOFOCUS,
                             0 if self.cap.get(_cv2.CAP_PROP_AUTOFOCUS) else 1)
                self.on_status("autofocus toggled")
            except Exception:
                pass
        elif key == ord("["):
            self._bump(_cv2.CAP_PROP_FOCUS, "_focus", -5, 0, 255)
        elif key == ord("]"):
            self._bump(_cv2.CAP_PROP_FOCUS, "_focus", 5, 0, 255)
        elif key == ord("e"):
            self._bump(_cv2.CAP_PROP_EXPOSURE, "_exposure", 1, -13, 0)
        elif key == ord("d"):
            self._bump(_cv2.CAP_PROP_EXPOSURE, "_exposure", -1, -13, 0)
        return True

    # -- frame loop --------------------------------------------------------

    def _decode_worker(self):
        """Chew on the newest frame off the UI thread; never blocks preview."""
        while not self._stopped:
            with self._lock:
                frame = self._pending
                self._pending = None
            if frame is None:
                time.sleep(0.01)
                continue
            self._decode_busy = True
            try:
                aggressive = self._misses > 8
                text = decode_image(frame, aggressive=aggressive,
                                    detector=self.detector)
            except Exception:
                text = ""
            self._decode_busy = False
            if text:
                self._misses = 0
                with self._lock:
                    self._decoded = text
            else:
                self._misses += 1

    def _tick(self):
        if self._stopped or self.cap is None:
            return
        try:
            # Drain any frames the driver buffered while the last decode ran,
            # so what's on screen is live instead of seconds behind.
            for _ in range(4):
                if not self.cap.grab():
                    break
            ok, frame = self.cap.retrieve()
            if not ok or frame is None:
                ok, frame = self.cap.read()
            if not ok or frame is None:
                self._after_id = self.widget.after(15, self._tick)
                return

            self._frames += 1
            # Hand the decoder a frame only when it's free — queuing more just
            # builds latency.
            if not self._decode_busy:
                with self._lock:
                    self._pending = frame.copy()

            with self._lock:
                text = self._decoded
                self._decoded = None

            if text:
                self._hit_until = time.time() + 0.35
            if time.time() < self._hit_until:
                self._draw_hit(frame)

            self._draw_hud(frame)

            try:
                _cv2.imshow(self.window_title, frame)
                key = _cv2.waitKey(1) & 0xFF
            except Exception:
                key = 255
            if key != 255 and not self._handle_key(key):
                self.stop()
                return
            try:
                if _cv2.getWindowProperty(self.window_title, _cv2.WND_PROP_VISIBLE) < 1:
                    self.on_status("camera closed")
                    self.stop()
                    return
            except Exception:
                pass

            if text:
                now = time.time() * 1000.0
                if (self.continuous and text == self._last_text
                        and now - self._last_text_at < self.repeat_cooldown_ms):
                    # Same code still sitting in frame — ignore the echo.
                    self._after_id = self.widget.after(5, self._tick)
                    return
                self._last_text = text
                self._last_text_at = now
                if not self.continuous:
                    self.stop()
                try:
                    self.on_result(text)
                except Exception as exc:
                    self.on_status("scan handler failed: {}".format(exc))
                if not self.continuous or self._stopped:
                    return

        except Exception as exc:
            self.on_status("camera error: {}".format(exc))
            self.stop()
            return

        self._after_id = self.widget.after(5, self._tick)


    # -- overlays ----------------------------------------------------------

    def _draw_hit(self, frame):
        try:
            h, w = frame.shape[:2]
            _cv2.rectangle(frame, (0, 0), (w - 1, h - 1), (0, 220, 0), 12)
        except Exception:
            pass

    def _draw_hud(self, frame):
        try:
            h, w = frame.shape[:2]
            # Aim box: keeps the operator inside the high-res centre crop.
            half = min(h, w) // 3
            cy, cx = h // 2, w // 2
            _cv2.rectangle(frame, (cx - half, cy - half), (cx + half, cy + half),
                           (200, 200, 200), 1)
            _cv2.putText(frame, "ESC cancel  +/- zoom  f autofocus  [ ] focus  e/d exposure",
                         (12, h - 14), _cv2.FONT_HERSHEY_SIMPLEX, 0.5, (230, 230, 230), 1,
                         _cv2.LINE_AA)
        except Exception:
            pass
