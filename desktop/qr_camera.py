#!/usr/bin/env python3
"""
Webcam QR scanning for the CSC Mint VERIFY station.

Offline. No network. Uses OpenCV's built-in QRCodeDetector (no zbar, no DLLs
beyond what opencv-python ships).

Design notes
------------
* The camera loop is driven by Tk's ``after()`` so the Tkinter mainloop stays
  responsive and everything runs on the main thread (OpenCV's HighGUI windows
  are not thread-safe on Windows).
* The live preview is an ``cv2.imshow`` window so we don't need Pillow.
* Closing the preview window, pressing ESC, or a successful decode all stop
  the loop and release the camera.

If ``opencv-python`` isn't installed, ``available()`` returns False and the
caller falls back to the keyboard-wedge USB scanner flow.
"""

from __future__ import annotations

import sys

_cv2 = None
_import_error = None

try:  # pragma: no cover - environment dependent
    import cv2 as _cv2  # type: ignore
except Exception as exc:  # pragma: no cover
    _import_error = exc


def available() -> bool:
    """True when webcam scanning can be attempted."""
    return _cv2 is not None


def diagnostics() -> str:
    """Return a human-readable report of camera readiness."""
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
    found = list_cameras()
    if found:
        lines.append("Cameras detected: {}".format(", ".join("#{}".format(i) for i in found)))
    else:
        lines.append("Cameras detected: NONE")
        lines.append("If a webcam is plugged in, try changing the camera # or reconnecting it.")
    return "\n".join(lines)


def unavailable_reason() -> str:
    return (
        "OpenCV isn't installed in this build, so the camera can't be used.\n\n"
        "Install it with:  python -m pip install opencv-python\n"
        "(offline: copy the opencv_python wheel to the USB package folder)\n\n"
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
        # 720p gives the detector enough pixels for a small engraved QR.
        try:
            self.cap.set(_cv2.CAP_PROP_FRAME_WIDTH, 1280)
            self.cap.set(_cv2.CAP_PROP_FRAME_HEIGHT, 720)
        except Exception:
            pass
        self.detector = _cv2.QRCodeDetector()
        try:
            _cv2.namedWindow(self.window_title, _cv2.WINDOW_NORMAL)
            _cv2.resizeWindow(self.window_title, 720, 480)
        except Exception:
            pass
        self.on_status("camera live — hold the QR steady in frame")
        self._tick()
        return True

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

    # -- frame loop --------------------------------------------------------

    def _tick(self):
        if self._stopped or self.cap is None:
            return
        try:
            ok, frame = self.cap.read()
            if not ok or frame is None:
                self._after_id = self.widget.after(30, self._tick)
                return

            text = self._decode(frame)

            try:
                _cv2.imshow(self.window_title, frame)
                key = _cv2.waitKey(1) & 0xFF
            except Exception:
                key = 255
            if key == 27:  # ESC
                self.on_status("camera cancelled")
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
                    self._after_id = self.widget.after(15, self._tick)
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

        self._after_id = self.widget.after(15, self._tick)

    def _decode(self, frame) -> str:
        """Return decoded QR text, or '' when this frame has none."""
        # detectAndDecodeMulti catches codes that are off-centre or paired with
        # a second code in frame; fall back to the single-code path.
        try:
            ok, texts, _pts, _straight = self.detector.detectAndDecodeMulti(frame)
            if ok and texts:
                for t in texts:
                    if t and t.strip():
                        self._draw_hit(frame)
                        return t.strip()
        except Exception:
            pass
        try:
            text, pts, _straight = self.detector.detectAndDecode(frame)
            if text and text.strip():
                if pts is not None:
                    self._draw_hit(frame)
                return text.strip()
        except Exception:
            pass
        return ""

    def _draw_hit(self, frame):
        try:
            h, w = frame.shape[:2]
            _cv2.rectangle(frame, (0, 0), (w - 1, h - 1), (0, 220, 0), 12)
        except Exception:
            pass
