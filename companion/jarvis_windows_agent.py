#!/usr/bin/env python3
"""
jarvis_windows_agent.py — Localhost-only Python Windows Desktop Agent for August / J.A.R.V.I.S.
Runs on http://127.0.0.1:4850 and requires X-Companion-Token matching ~/.august-companion-token.

Capabilities:
  - Installed app discovery (Windows Start Menu, Program Files, Registry Uninstall + PATH)
  - Verified app launching & running process/window enumeration
  - Window management (focus, minimize, maximize, restore, close) via pywinauto / ctypes
  - Mouse & Keyboard automation (move, click, double_click, right_click, scroll, drag, type, hotkey) via pyautogui
  - Screen Vision & OCR (mss desktop capture -> base64 PNG + rapidocr-onnxruntime bounding boxes)
  - File & folder management (search, category organizer for Downloads, SHA-256 duplicate scan)
  - System telemetry (CPU, RAM, battery, uptime, active foreground window) via psutil
  - System controls (volume via pycaw, brightness via screen-brightness-control, workstation lock)
"""

from __future__ import annotations

import base64
import ctypes
import hashlib
import hmac
import io
import json
import os
import platform
import re
import secrets
import shutil
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = int(os.environ.get("AUGUST_PYTHON_PORT", "4850"))
TOKEN_FILE = Path.home() / ".august-companion-token"
IS_WINDOWS = platform.system().lower() == "windows"


def load_or_create_token() -> str:
    env_tok = os.environ.get("AUGUST_COMPANION_TOKEN", "").strip()
    if env_tok:
        return env_tok
    if TOKEN_FILE.exists():
        tok = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if len(tok) >= 16:
            return tok
    tok = secrets.token_hex(24)
    try:
        TOKEN_FILE.write_text(tok, encoding="utf-8")
    except OSError:
        pass
    return tok


PAIRING_TOKEN = load_or_create_token()

# Optional native modules (degrade gracefully if a package is missing or OS is non-Windows)
try:
    import psutil  # type: ignore
except Exception:
    psutil = None

try:
    import pyautogui  # type: ignore
    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.05
except Exception:
    pyautogui = None

try:
    import mss  # type: ignore
    from PIL import Image  # type: ignore
except Exception:
    mss = None
    Image = None

try:
    from rapidocr_onnxruntime import RapidOCR  # type: ignore
    OCR_ENGINE = RapidOCR()
except Exception:
    OCR_ENGINE = None

try:
    import screen_brightness_control as sbc  # type: ignore
except Exception:
    sbc = None

try:
    from pywinauto import Desktop  # type: ignore
except Exception:
    Desktop = None


ALLOWED_SHORTCUT_KEYS = {
    "ctrl", "control", "alt", "shift", "win", "tab", "enter", "return",
    "escape", "esc", "space", "backspace", "delete", "up", "down", "left", "right",
    "home", "end", "pageup", "pagedown",
    *[chr(c) for c in range(ord("a"), ord("z") + 1)],
    *[str(d) for d in range(0, 10)],
    *[f"f{n}" for n in range(1, 13)],
}

CATEGORY_MAP = {
    "Documents": {".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".odt", ".xlsx", ".csv", ".pptx"},
    "Images": {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"},
    "Videos": {".mp4", ".mkv", ".mov", ".avi", ".webm", ".flv"},
    "Audio": {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"},
    "Archives": {".zip", ".rar", ".7z", ".tar", ".gz"},
    "Installers": {".exe", ".msi", ".msix", ".bat"},
    "Code": {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".css", ".cpp", ".java"},
}

SAFE_BASE_APP_ALLOWLIST = {
    "chrome": ["chrome.exe", "google chrome", r"C:\Program Files\Google\Chrome\Application\chrome.exe"],
    "edge": ["msedge.exe", "microsoft edge", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"],
    "firefox": ["firefox.exe", "mozilla firefox", r"C:\Program Files\Mozilla Firefox\firefox.exe"],
    "vscode": ["Code.exe", "visual studio code", str(Path.home() / "AppData/Local/Programs/Microsoft VS Code/Code.exe")],
    "terminal": ["wt.exe", "cmd.exe", "powershell.exe"],
    "notepad": ["notepad.exe"],
    "notes": ["notepad.exe"],
    "calculator": ["calc.exe"],
    "explorer": ["explorer.exe"],
    "taskmgr": ["taskmgr.exe"],
    "settings": ["ms-settings:"],
    "spotify": ["Spotify.exe", str(Path.home() / "AppData/Roaming/Spotify/Spotify.exe")],
    "discord": ["Discord.exe", str(Path.home() / "AppData/Local/Discord/Update.exe")],
    "vlc": ["vlc.exe", r"C:\Program Files\VideoLAN\VLC\vlc.exe"],
    "steam": ["steam.exe", r"C:\Program Files (x86)\Steam\steam.exe"],
}


def discover_installed_apps() -> List[Dict[str, str]]:
    found: Dict[str, Dict[str, str]] = {}

    # Seed common known apps present in PATH or standard folders
    for key, candidates in SAFE_BASE_APP_ALLOWLIST.items():
        for cand in candidates:
            if cand.startswith("ms-settings:"):
                found[key] = {"name": "Windows Settings", "execKey": key, "path": cand, "source": "uri"}
                break
            resolved = shutil.which(cand) or (cand if os.path.exists(cand) else None)
            if resolved:
                found[key] = {
                    "name": key.upper() if key in {"vlc", "obs"} else key.title(),
                    "execKey": key,
                    "path": resolved,
                    "source": "path",
                }
                break

    if IS_WINDOWS:
        # Scan Start Menu shortcuts (.lnk -> target via metadata name)
        start_dirs = [
            Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "Microsoft/Windows/Start Menu/Programs",
            Path(os.environ.get("APPDATA", str(Path.home() / "AppData/Roaming"))) / "Microsoft/Windows/Start Menu/Programs",
        ]
        for sdir in start_dirs:
            if not sdir.exists():
                continue
            for lnk in sdir.rglob("*.lnk"):
                stem = lnk.stem.strip()
                norm = stem.lower()
                if not norm or "uninstall" in norm or norm in found:
                    continue
                found[norm] = {
                    "name": stem,
                    "execKey": norm,
                    "path": str(lnk),
                    "source": "start_menu",
                }
                if len(found) >= 160:
                    break

        # Scan Windows Registry Uninstall keys for DisplayName + InstallLocation/DisplayIcon
        try:
            import winreg  # type: ignore
            reg_paths = [
                (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
                (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
                (winreg.HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
            ]
            for root, sub in reg_paths:
                try:
                    with winreg.OpenKey(root, sub) as key_handle:
                        count = winreg.QueryInfoKey(key_handle)[0]
                        for idx in range(count):
                            try:
                                sub_name = winreg.EnumKey(key_handle, idx)
                                with winreg.OpenKey(key_handle, sub_name) as app_key:
                                    display_name, _ = winreg.QueryValueEx(app_key, "DisplayName")
                                    if not display_name or len(str(display_name)) > 80:
                                        continue
                                    norm = str(display_name).strip().lower()
                                    if norm in found:
                                        continue
                                    icon_or_loc = ""
                                    for field in ("DisplayIcon", "InstallLocation"):
                                        try:
                                            val, _ = winreg.QueryValueEx(app_key, field)
                                            if val:
                                                icon_or_loc = str(val).split(",")[0].strip().strip('"')
                                                break
                                        except OSError:
                                            continue
                                    if icon_or_loc and icon_or_loc.lower().endswith(".exe") and os.path.exists(icon_or_loc):
                                        found[norm] = {
                                            "name": str(display_name).strip(),
                                            "execKey": norm,
                                            "path": icon_or_loc,
                                            "source": "registry",
                                        }
                            except OSError:
                                continue
                except OSError:
                    continue
        except Exception:
            pass

    return sorted(found.values(), key=lambda x: x["name"].lower())[:180]


def list_open_windows() -> List[Dict[str, Any]]:
    windows: List[Dict[str, Any]] = []
    if IS_WINDOWS and Desktop is not None:
        try:
            desk = Desktop(backend="uia")
            for w in desk.windows():
                try:
                    title = (w.window_text() or "").strip()
                    if not title:
                        continue
                    pid = w.process_id()
                    proc_name = ""
                    if psutil is not None:
                        try:
                            proc_name = psutil.Process(pid).name()
                        except Exception:
                            proc_name = f"pid:{pid}"
                    windows.append({
                        "hwnd": w.handle,
                        "title": title[:160],
                        "processName": proc_name,
                        "active": bool(w.has_keyboard_focus()),
                    })
                except Exception:
                    continue
        except Exception:
            pass

    if not windows and IS_WINDOWS:
        # ctypes Win32 fallback enumeration
        user32 = ctypes.windll.user32
        titles: List[Dict[str, Any]] = []
        EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
        fg_hwnd = user32.GetForegroundWindow()

        def foreach_win(hwnd: int, _lparam: int) -> bool:
            if user32.IsWindowVisible(hwnd):
                length = user32.GetWindowTextLengthW(hwnd)
                if length > 0:
                    buf = ctypes.create_unicode_buffer(length + 1)
                    user32.GetWindowTextW(hwnd, buf, length + 1)
                    title = buf.value.strip()
                    if title:
                        pid = ctypes.c_ulong()
                        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
                        pname = ""
                        if psutil is not None:
                            try:
                                pname = psutil.Process(pid.value).name()
                            except Exception:
                                pname = ""
                        titles.append({
                            "hwnd": int(hwnd),
                            "title": title[:160],
                            "processName": pname,
                            "active": int(hwnd) == int(fg_hwnd),
                        })
            return True

        user32.EnumWindows(EnumWindowsProc(foreach_win), 0)
        windows = titles

    return windows[:60]


def control_window(sub_action: str, target: str) -> Tuple[bool, str]:
    sub = sub_action.lower().strip()
    needle = target.lower().strip()
    if not needle:
        return False, "No target window name specified."

    wins = list_open_windows()
    matched = [
        w for w in wins
        if needle in str(w.get("title", "")).lower() or needle in str(w.get("processName", "")).lower()
    ]
    if not matched:
        return False, f'No open window matching "{target}" was found.'

    win_info = matched[0]
    hwnd = int(win_info.get("hwnd") or 0)
    title = str(win_info.get("title") or target)

    if IS_WINDOWS and hwnd:
        user32 = ctypes.windll.user32
        SW_MINIMIZE = 6
        SW_MAXIMIZE = 3
        SW_RESTORE = 9
        if sub == "minimize":
            user32.ShowWindow(hwnd, SW_MINIMIZE)
            return True, f'Minimized window "{title}".'
        if sub == "maximize":
            user32.ShowWindow(hwnd, SW_MAXIMIZE)
            user32.SetForegroundWindow(hwnd)
            return True, f'Maximized window "{title}".'
        if sub == "restore":
            user32.ShowWindow(hwnd, SW_RESTORE)
            return True, f'Restored window "{title}".'
        if sub == "focus":
            user32.ShowWindow(hwnd, SW_RESTORE)
            user32.SetForegroundWindow(hwnd)
            return True, f'Focused window "{title}".'
        if sub == "close":
            WM_CLOSE = 0x0010
            user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
            return True, f'Sent close signal to "{title}".'

    return False, f'Window control "{sub}" is unavailable for "{target}" on this host.'


def launch_installed_app(target: str) -> Tuple[bool, str, Dict[str, Any]]:
    needle = target.lower().strip()
    if not needle:
        return False, "Application name is empty.", {}

    apps = discover_installed_apps()
    match = next((a for a in apps if a["execKey"] == needle or a["name"].lower() == needle), None)
    if not match:
        match = next((a for a in apps if needle in a["name"].lower() or needle in a["execKey"]), None)

    if not match:
        return False, f'Application "{target}" was not found among installed apps.', {}

    app_path = match["path"]
    try:
        if IS_WINDOWS:
            if app_path.startswith("ms-settings:") or app_path.lower().endswith(".lnk"):
                os.startfile(app_path)  # type: ignore[attr-defined]
            else:
                subprocess.Popen([app_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            subprocess.Popen([app_path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        time.sleep(0.6)
        windows = list_open_windows()
        opened_win = next(
            (w for w in windows if needle in w["title"].lower() or needle in w["processName"].lower()),
            None,
        )
        return True, f'Launched {match["name"]}.', {
            "app": match,
            "verifiedWindow": opened_win,
        }
    except Exception as exc:
        return False, f'Failed to launch {match["name"]}: {exc}', {}


def capture_screen_with_ocr() -> Tuple[bool, str, Dict[str, Any]]:
    if mss is None or Image is None:
        return False, "Screen capture dependencies (mss / Pillow) are not installed.", {}
    try:
        with mss.mss() as sct:
            monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
            raw = sct.grab(monitor)
            img = Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
            orig_w, orig_h = img.size

            # Resize reasonably for OCR + Gemini vision while retaining legibility
            max_w = 1440
            if orig_w > max_w:
                ratio = max_w / float(orig_w)
                img = img.resize((max_w, max(1, int(orig_h * ratio))), Image.Resampling.LANCZOS)

            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            img_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        ocr_lines: List[str] = []
        elements: List[Dict[str, Any]] = []
        if OCR_ENGINE is not None:
            result, _ = OCR_ENGINE(buf.getvalue())
            if result:
                for item in result[:80]:
                    box, text, conf = item[0], str(item[1]).strip(), float(item[2])
                    if not text or conf < 0.45:
                        continue
                    ocr_lines.append(text)
                    cx = int(sum(pt[0] for pt in box) / 4.0)
                    cy = int(sum(pt[1] for pt in box) / 4.0)
                    elements.append({"text": text[:80], "x": cx, "y": cy})

        windows = list_open_windows()
        active = next((w for w in windows if w.get("active")), None)
        return True, "Captured desktop screen and extracted visible text.", {
            "capturedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "width": img.size[0],
            "height": img.size[1],
            "activeApp": active.get("processName") if active else "",
            "windowTitle": active.get("title") if active else "",
            "ocrText": "\n".join(ocr_lines)[:5000],
            "detectedElements": elements,
            "imageBase64": img_b64,
        }
    except Exception as exc:
        return False, f"Screen capture failed: {exc}", {}


def get_hardware_telemetry() -> Dict[str, Any]:
    data: Dict[str, Any] = {"pythonAgentReady": True}
    if psutil is not None:
        try:
            vm = psutil.virtual_memory()
            data["cpuPercent"] = round(psutil.cpu_percent(interval=0.15), 1)
            data["ramUsedGb"] = round(vm.used / (1024 ** 3), 2)
            data["ramTotalGb"] = round(vm.total / (1024 ** 3), 2)
            data["ramPercent"] = round(vm.percent, 1)
            data["uptimeMinutes"] = int((time.time() - psutil.boot_time()) / 60)
            bat = psutil.sensors_battery()
            if bat is not None:
                data["batteryPercent"] = round(bat.percent)
                data["batteryPlugged"] = bool(bat.power_plugged)
        except Exception:
            pass
    windows = list_open_windows()
    active = next((w for w in windows if w.get("active")), None)
    if active:
        data["activeApp"] = active.get("processName") or ""
        data["activeWindowTitle"] = active.get("title") or ""
    return data


def handle_mouse(params: Dict[str, Any]) -> Tuple[bool, str]:
    if pyautogui is None:
        return False, "pyautogui is not installed in the Python environment."
    sub = str(params.get("subAction") or "left_click").lower()
    x = params.get("x")
    y = params.get("y")
    try:
        if sub == "move" and x is not None and y is not None:
            pyautogui.moveTo(int(x), int(y), duration=0.25)
            return True, f"Moved cursor to ({int(x)}, {int(y)})."
        if sub == "left_click":
            if x is not None and y is not None:
                pyautogui.click(int(x), int(y), button="left")
                return True, f"Left-clicked at ({int(x)}, {int(y)})."
            pyautogui.click(button="left")
            return True, "Performed left click at current cursor position."
        if sub == "right_click":
            if x is not None and y is not None:
                pyautogui.click(int(x), int(y), button="right")
                return True, f"Right-clicked at ({int(x)}, {int(y)})."
            pyautogui.click(button="right")
            return True, "Performed right click."
        if sub == "double_click":
            if x is not None and y is not None:
                pyautogui.doubleClick(int(x), int(y))
                return True, f"Double-clicked at ({int(x)}, {int(y)})."
            pyautogui.doubleClick()
            return True, "Performed double click."
        if sub == "scroll":
            clicks = int(params.get("amount") or -350)
            pyautogui.scroll(clicks)
            return True, f"Scrolled screen ({clicks})."
        if sub == "drag" and x is not None and y is not None:
            pyautogui.dragTo(int(x), int(y), duration=0.35, button="left")
            return True, f"Dragged selection to ({int(x)}, {int(y)})."
        return False, f'Unsupported mouse action "{sub}".'
    except Exception as exc:
        return False, f"Mouse automation failed: {exc}"


def handle_keyboard(params: Dict[str, Any]) -> Tuple[bool, str]:
    if pyautogui is None:
        return False, "pyautogui is not installed in the Python environment."
    sub = str(params.get("subAction") or "type").lower()
    try:
        if sub == "type":
            text = str(params.get("value") or "")
            if not text:
                return False, "No text provided to type."
            pyautogui.write(text[:500], interval=0.02)
            return True, f'Typed "{text[:60]}" via keyboard.'
        if sub == "hotkey":
            raw_keys = params.get("keys") or []
            keys = [str(k).lower().strip() for k in raw_keys if str(k).lower().strip() in ALLOWED_SHORTCUT_KEYS]
            if not keys:
                return False, "No valid allowlisted keys specified."
            if len(keys) == 1:
                pyautogui.press(keys[0])
            else:
                pyautogui.hotkey(*keys)
            return True, f'Executed keyboard shortcut {" + ".join(keys)}.'
        return False, f'Unsupported keyboard action "{sub}".'
    except Exception as exc:
        return False, f"Keyboard automation failed: {exc}"


def set_system_volume(level: int) -> Tuple[bool, str]:
    level = max(0, min(100, int(level)))
    if IS_WINDOWS:
        try:
            from ctypes import POINTER, cast  # type: ignore
            from comtypes import CLSCTX_ALL  # type: ignore
            from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume  # type: ignore
            devices = AudioUtilities.GetSpeakers()
            interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
            volume = cast(interface, POINTER(IAudioEndpointVolume))
            volume.SetMasterVolumeLevelScalar(level / 100.0, None)
            return True, f"Windows master volume set to {level}%."
        except Exception as exc:
            return False, f"Audio endpoint adjustment failed: {exc}"
    return False, "pycaw volume control is Windows-only."


def set_screen_brightness(level: int) -> Tuple[bool, str]:
    level = max(5, min(100, int(level)))
    if sbc is None:
        return False, "screen-brightness-control package is not installed."
    try:
        sbc.set_brightness(level)
        return True, f"Display brightness set to {level}%."
    except Exception as exc:
        return False, f"Display brightness adjustment failed: {exc}"


def organize_downloads() -> Tuple[bool, str, Dict[str, Any]]:
    downloads = Path.home() / "Downloads"
    if not downloads.exists():
        return False, "Downloads directory does not exist.", {}
    moved: List[str] = []
    for entry in downloads.iterdir():
        if not entry.is_file() or entry.name.startswith("."):
            continue
        ext = entry.suffix.lower()
        dest_cat = "Other"
        for cat, exts in CATEGORY_MAP.items():
            if ext in exts:
                dest_cat = cat
                break
        if dest_cat == "Other":
            continue
        dest_dir = downloads / dest_cat
        dest_dir.mkdir(exist_ok=True)
        target = dest_dir / entry.name
        if target.exists():
            target = dest_dir / f"{entry.stem}_{int(time.time())}{entry.suffix}"
        shutil.move(str(entry), str(target))
        moved.append(f"{entry.name} -> {dest_cat}/")
        if len(moved) >= 120:
            break
    return True, f"Organized {len(moved)} file(s) in Downloads by category.", {"movedCount": len(moved), "sample": moved[:20]}


def find_duplicate_files(scope: str = "downloads") -> Tuple[bool, str, Dict[str, Any]]:
    root = Path.home() / ("Documents" if scope == "documents" else "Downloads")
    if not root.exists():
        return False, f'Folder "{root}" does not exist.', {}
    size_buckets: Dict[int, List[Path]] = {}
    for entry in root.iterdir():
        if entry.is_file():
            try:
                sz = entry.stat().st_size
                if sz > 0:
                    size_buckets.setdefault(sz, []).append(entry)
            except OSError:
                continue

    duplicates: List[Dict[str, Any]] = []
    for sz, paths in size_buckets.items():
        if len(paths) < 2:
            continue
        hashes: Dict[str, List[str]] = {}
        for p in paths[:20]:
            try:
                h = hashlib.sha256(p.read_bytes()[:1024 * 1024]).hexdigest()
                hashes.setdefault(h, []).append(p.name)
            except OSError:
                continue
        for h, names in hashes.items():
            if len(names) > 1:
                duplicates.append({"sizeBytes": sz, "files": names})

    return True, f"Found {len(duplicates)} duplicate file group(s) in {root.name}.", {"duplicates": duplicates[:25]}


def get_clipboard() -> Tuple[bool, str, Dict[str, Any]]:
    try:
        if IS_WINDOWS:
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-Command", "Get-Clipboard -Raw"],
                capture_output=True,
                text=True,
                timeout=4,
            )
            if proc.returncode == 0:
                text = (proc.stdout or "")[:8000]
                return True, "Read Windows clipboard.", {"text": text}
            return False, f"Clipboard read failed: {(proc.stderr or '').strip()}", {}
        if platform.system().lower() == "darwin":
            proc = subprocess.run(["pbpaste"], capture_output=True, text=True, timeout=4)
            return True, "Read macOS clipboard.", {"text": (proc.stdout or "")[:8000]}
        for cmd in (["xclip", "-selection", "clipboard", "-o"], ["xsel", "--clipboard", "--output"]):
            if shutil.which(cmd[0]):
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=4)
                if proc.returncode == 0:
                    return True, "Read clipboard.", {"text": (proc.stdout or "")[:8000]}
        return False, "No clipboard utility found on this host.", {}
    except Exception as exc:
        return False, f"Clipboard read failed: {exc}", {}


def set_clipboard(text: str) -> Tuple[bool, str, Dict[str, Any]]:
    clean = str(text or "")[:16000]
    try:
        if IS_WINDOWS:
            encoded = base64.b64encode(clean.encode("utf-8")).decode("ascii")
            ps = (
                f"$t=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{encoded}'));"
                "Set-Clipboard -Value $t"
            )
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps],
                capture_output=True,
                text=True,
                timeout=4,
            )
            if proc.returncode == 0:
                return True, f"Copied {len(clean)} character(s) to Windows clipboard.", {"length": len(clean)}
            return False, f"Clipboard write failed: {(proc.stderr or '').strip()}", {}
        if platform.system().lower() == "darwin":
            proc = subprocess.run(["pbcopy"], input=clean, text=True, timeout=4)
            return proc.returncode == 0, "Updated macOS clipboard.", {"length": len(clean)}
        for cmd in (["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]):
            if shutil.which(cmd[0]):
                proc = subprocess.run(cmd, input=clean, text=True, timeout=4)
                if proc.returncode == 0:
                    return True, "Updated clipboard.", {"length": len(clean)}
        return False, "No clipboard utility found on this host.", {}
    except Exception as exc:
        return False, f"Clipboard write failed: {exc}", {}


def check_blender() -> Dict[str, Any]:
    candidates: List[str] = []
    which_path = shutil.which("blender")
    if which_path:
        candidates.append(which_path)
    if IS_WINDOWS:
        base = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Blender Foundation"
        if base.exists():
            for child in sorted(base.glob("Blender*"), reverse=True):
                exe = child / "blender.exe"
                if exe.exists():
                    candidates.append(str(exe))
    for cand in candidates:
        if os.path.exists(cand):
            try:
                proc = subprocess.run([cand, "--version"], capture_output=True, text=True, timeout=4)
                ver = (proc.stdout or "").strip().splitlines()[0] if proc.stdout else "Installed"
                return {"installed": True, "path": cand, "version": ver}
            except Exception:
                return {"installed": True, "path": cand, "version": "Detected"}
    return {"installed": False, "path": "", "version": ""}


def dial_phone_number(phone: str) -> Tuple[bool, str, Dict[str, Any]]:
    raw = str(phone or "").strip()
    if not re.match(r"^[+0-9#*() -]{3,28}$", raw):
        return False, "Invalid phone number format.", {}
    compact = re.sub(r"[\s()-]+", "", raw)
    if len(compact) < 3:
        return False, "Phone number too short.", {}
    try:
        uri = f"tel:{compact}"
        if IS_WINDOWS:
            os.startfile(uri)  # type: ignore[attr-defined]
            return True, f"Handed off {compact} to Windows Phone Link / dialer.", {"uri": uri, "phone": compact}
        if platform.system().lower() == "darwin":
            subprocess.Popen(["open", uri], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True, f"Handed off {compact} to system dialer.", {"uri": uri, "phone": compact}
        if shutil.which("xdg-open"):
            subprocess.Popen(["xdg-open", uri], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return True, f"Handed off {compact} to system dialer.", {"uri": uri, "phone": compact}
        return False, "No OS tel: handler available on this host.", {}
    except Exception as exc:
        return False, f"Phone dial handoff failed: {exc}", {}


class AgentHandler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        return

    def _send_json(self, code: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        tok = self.headers.get("X-Companion-Token", "").strip()
        return bool(tok) and hmac.compare_digest(tok, PAIRING_TOKEN)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._send_json(200, {
                "ok": True,
                "agent": "jarvis_windows_agent",
                "platform": platform.system(),
                "ocrAvailable": OCR_ENGINE is not None,
                "mouseKeyboardAvailable": pyautogui is not None,
                "telemetryAvailable": psutil is not None,
            })
            return

        if not self._authorized():
            self._send_json(401, {"ok": False, "message": "Invalid or missing X-Companion-Token."})
            return

        if parsed.path == "/apps":
            apps = discover_installed_apps()
            self._send_json(200, {"ok": True, "message": f"Discovered {len(apps)} installed application(s).", "data": {"apps": apps}})
            return

        if parsed.path == "/windows":
            wins = list_open_windows()
            self._send_json(200, {"ok": True, "message": f"Found {len(wins)} open window(s).", "data": {"windows": wins}})
            return

        if parsed.path == "/system/telemetry":
            tel = get_hardware_telemetry()
            self._send_json(200, {"ok": True, "message": "Hardware telemetry collected.", "data": tel})
            return

        if parsed.path == "/clipboard":
            ok, msg, data = get_clipboard()
            self._send_json(200, {"ok": ok, "message": msg, "data": data})
            return

        if parsed.path == "/blender/check":
            info = check_blender()
            self._send_json(200, {
                "ok": True,
                "message": f"Blender {info['version']} detected." if info["installed"] else "Blender is not installed in standard PATH.",
                "data": info,
            })
            return

        self._send_json(404, {"ok": False, "message": "Unknown endpoint."})

    def do_POST(self) -> None:
        if not self._authorized():
            self._send_json(401, {"ok": False, "message": "Invalid or missing X-Companion-Token."})
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        raw_body = self.rfile.read(min(length, 1024 * 1024))
        try:
            params = json.loads(raw_body.decode("utf-8") or "{}")
        except Exception:
            self._send_json(400, {"ok": False, "message": "Invalid JSON body."})
            return

        path = urlparse(self.path).path

        if path == "/launch":
            ok, msg, data = launch_installed_app(str(params.get("target") or params.get("appName") or ""))
            self._send_json(200, {"ok": ok, "message": msg, "data": data})
            return

        if path == "/window-control":
            ok, msg = control_window(str(params.get("subAction") or "focus"), str(params.get("target") or ""))
            self._send_json(200, {"ok": ok, "message": msg, "data": {"windows": list_open_windows()}})
            return

        if path == "/mouse":
            ok, msg = handle_mouse(params)
            self._send_json(200, {"ok": ok, "message": msg, "data": {}})
            return

        if path == "/keyboard":
            ok, msg = handle_keyboard(params)
            self._send_json(200, {"ok": ok, "message": msg, "data": {}})
            return

        if path == "/screenshot-ocr":
            ok, msg, data = capture_screen_with_ocr()
            self._send_json(200, {"ok": ok, "message": msg, "data": data})
            return

        if path == "/files/organize":
            ok, msg, data = organize_downloads()
            self._send_json(200, {"ok": ok, "message": msg, "data": data})
            return

        if path == "/files/duplicates":
            ok, msg, data = find_duplicate_files(str(params.get("target") or "downloads"))
            self._send_json(200, {"ok": ok, "message": msg, "data": data})
            return

        if path == "/system/volume":
            ok, msg = set_system_volume(int(params.get("value") or 50))
            self._send_json(200, {"ok": ok, "message": msg, "data": {}})
            return

        if path == "/system/brightness":
            ok, msg = set_screen_brightness(int(params.get("value") or 75))
            self._send_json(200, {"ok": ok, "message": msg, "data": {}})
            return

        if path == "/system/lock":
            if IS_WINDOWS:
                ctypes.windll.user32.LockWorkStation()
                self._send_json(200, {"ok": True, "message": "Windows workstation locked.", "data": {}})
            else:
                self._send_json(200, {"ok": False, "message": "Workstation lock is supported on Windows.", "data": {}})
            return

        if path == "/clipboard":
            ok, msg, data = set_clipboard(str(params.get("text") or params.get("value") or ""))
            self._send_json(200, {"ok": ok, "message": msg, "data": data})
            return

        if path == "/system/dial":
            ok, msg, data = dial_phone_number(str(params.get("phone") or ""))
            self._send_json(200, {"ok": ok, "message": msg, "data": data})
            return

        self._send_json(404, {"ok": False, "message": "Unknown endpoint."})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), AgentHandler)
    print(f"[August Python Agent] Listening on http://{HOST}:{PORT} ({platform.system()})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
