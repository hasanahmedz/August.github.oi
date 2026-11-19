export interface LocalFileEntry {
  name: string;
  kind: 'file' | 'directory';
  size?: number;
}

export interface CompanionResponse {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

interface BatteryManagerLike {
  level: number;
  charging: boolean;
}

export interface DirectLaunchResult {
  launched: boolean;
  blocked: boolean;
  method: 'window_open' | 'blocked';
}

export interface ResolvedLaunchIntent {
  kind: 'web' | 'desktop_app';
  name: string;
  url?: string;
  searchQuery?: string;
  appName?: string;
}

import {
  parseLocalCommand,
  resolveWebTarget,
} from './commandParsers';

export function resolveClientWebTarget(
  rawTarget: string,
  searchQuery?: string
): { name: string; url: string; searchQuery?: string } {
  return resolveWebTarget(rawTarget, searchQuery);
}

export function resolveClientLaunchIntent(rawText: string): ResolvedLaunchIntent | null {
  const parsed = parseLocalCommand(rawText);
  if (!parsed) return null;
  if (parsed.type === 'open_web') {
    return {
      kind: 'web',
      name: parsed.name,
      url: parsed.url,
      searchQuery: parsed.searchQuery,
    };
  }
  if (parsed.type === 'computer_action' && parsed.action === 'companion_launch_app') {
    return {
      kind: 'desktop_app',
      appName: parsed.target,
      name: parsed.label,
    };
  }
  return null;
}

export function attemptDirectLaunch(url: string): DirectLaunchResult {
  try {
    const popup = window.open(url, '_blank', 'noopener,noreferrer');
    if (popup) {
      return { launched: true, blocked: false, method: 'window_open' };
    }
    return { launched: false, blocked: true, method: 'blocked' };
  } catch {
    return { launched: false, blocked: true, method: 'blocked' };
  }
}

export async function readBrowserTelemetry(): Promise<{
  batteryLevel?: number;
  batteryCharging?: boolean;
  storageUsedMb?: number;
  storageQuotaMb?: number;
  hardwareThreads?: number;
  micPermission: 'granted' | 'prompt' | 'denied' | 'unknown';
}> {
  let batteryLevel: number | undefined;
  let batteryCharging: boolean | undefined;
  let storageUsedMb: number | undefined;
  let storageQuotaMb: number | undefined;
  let micPermission: 'granted' | 'prompt' | 'denied' | 'unknown' = 'unknown';

  const nav = navigator as unknown as {
    getBattery?: () => Promise<BatteryManagerLike>;
    storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> };
    permissions?: { query?: (desc: { name: PermissionName }) => Promise<{ state: PermissionState }> };
    hardwareConcurrency?: number;
  };

  if (typeof nav.getBattery === 'function') {
    try {
      const bat = await nav.getBattery();
      batteryLevel = Math.round(bat.level * 100);
      batteryCharging = Boolean(bat.charging);
    } catch {
      // ignore unsupported browser privacy restriction
    }
  }

  if (nav.storage && typeof nav.storage.estimate === 'function') {
    try {
      const est = await nav.storage.estimate();
      if (typeof est.usage === 'number') {
        storageUsedMb = Math.round((est.usage / (1024 * 1024)) * 10) / 10;
      }
      if (typeof est.quota === 'number') {
        storageQuotaMb = Math.round(est.quota / (1024 * 1024));
      }
    } catch {
      // ignore
    }
  }

  if (nav.permissions && typeof nav.permissions.query === 'function') {
    try {
      const res = await nav.permissions.query({
        name: 'microphone' as PermissionName,
      });
      micPermission = res.state;
    } catch {
      micPermission = 'unknown';
    }
  }

  return {
    batteryLevel,
    batteryCharging,
    storageUsedMb,
    storageQuotaMb,
    hardwareThreads:
      typeof nav.hardwareConcurrency === 'number'
        ? nav.hardwareConcurrency
        : undefined,
    micPermission,
  };
}

export async function captureSingleScreenshot(): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error(
      'Screen capture is not supported in this browser or context.'
    );
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 1 },
    audio: false,
  });

  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) {
        resolve();
      } else {
        video.onloadeddata = () => resolve();
      }
    });

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to render captured screen frame.');
    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    return { dataUrl, width, height };
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

export async function pickAndReadLocalFile(): Promise<{
  name: string;
  size: number;
  contentPreview: string;
}> {
  const win = window as unknown as {
    showOpenFilePicker?: (opts?: unknown) => Promise<FileSystemFileHandle[]>;
  };
  if (typeof win.showOpenFilePicker !== 'function') {
    throw new Error(
      'File System Access API is unavailable in this browser. Connect the Local Desktop Companion for native file access.'
    );
  }
  const [handle] = await win.showOpenFilePicker({
    multiple: false,
    types: [
      {
        description: 'Supported text and code documents',
        accept: {
          'text/*': ['.txt', '.md', '.json', '.csv', '.ts', '.tsx', '.js', '.py'],
        },
      },
    ],
  });
  const file = await handle.getFile();
  const text = await file.text();
  return {
    name: file.name,
    size: file.size,
    contentPreview: text.slice(0, 6000),
  };
}

export async function pickDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
  const win = window as unknown as {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  };
  if (typeof win.showDirectoryPicker !== 'function') {
    throw new Error(
      'Folder access API (showDirectoryPicker) is unavailable in this browser.'
    );
  }
  return win.showDirectoryPicker({ mode: 'readwrite' });
}

export async function listAndSearchDirectory(
  dirHandle: FileSystemDirectoryHandle,
  searchQuery?: string
): Promise<LocalFileEntry[]> {
  const entries: LocalFileEntry[] = [];
  const q = searchQuery?.trim().toLowerCase();

  const iterable = dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>;
  for await (const [name, handle] of iterable) {
    if (q && !name.toLowerCase().includes(q)) continue;
    let size: number | undefined;
    if (handle.kind === 'file') {
      try {
        const f = await (handle as FileSystemFileHandle).getFile();
        size = f.size;
      } catch {
        // ignore
      }
    }
    entries.push({ name, kind: handle.kind, size });
    if (entries.length >= 60) break;
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createSubfolderInDirectory(
  dirHandle: FileSystemDirectoryHandle,
  folderName: string
): Promise<string> {
  const safeName = folderName.replace(/[\\/:*?"<>|]/g, '_').trim();
  if (!safeName) throw new Error('Folder name cannot be empty.');
  await dirHandle.getDirectoryHandle(safeName, { create: true });
  return safeName;
}

export class DesktopCompanionBridge {
  private ws: WebSocket | null = null;
  private url: string;
  private pairingToken = '';
  private pendingRequests = new Map<
    string,
    { resolve: (res: CompanionResponse) => void; timeout: number }
  >();
  private onStatusChange: (connected: boolean) => void;
  private onEvent?: (eventName: string, payload: Record<string, unknown>) => void;

  constructor(
    url: string,
    onStatusChange: (connected: boolean) => void,
    onEvent?: (eventName: string, payload: Record<string, unknown>) => void
  ) {
    this.url = url;
    this.onStatusChange = onStatusChange;
    this.onEvent = onEvent;
  }

  public get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public setPairingToken(token?: string): void {
    this.pairingToken = (token || '').trim();
    if (this.ws?.readyState === WebSocket.OPEN && this.pairingToken) {
      void this.sendCommand('auth', { token: this.pairingToken });
    }
  }

  public connect(nextUrl?: string, pairingToken?: string): Promise<boolean> {
    if (nextUrl) this.url = nextUrl;
    if (pairingToken !== undefined) this.pairingToken = pairingToken.trim();
    this.disconnect();

    return new Promise((resolve) => {
      try {
        const socket = new WebSocket(this.url);
        this.ws = socket;

        const timer = window.setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            socket.close();
            this.onStatusChange(false);
            resolve(false);
          }
        }, 2500);

        socket.onopen = () => {
          window.clearTimeout(timer);
          if (this.pairingToken) {
            void this.sendCommand('auth', { token: this.pairingToken });
          }
          this.onStatusChange(true);
          resolve(true);
        };

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(String(event.data)) as {
              requestId?: string;
              event?: string;
              ok?: boolean;
              message?: string;
              data?: Record<string, unknown>;
              [key: string]: unknown;
            };
            if (payload.event && this.onEvent) {
              this.onEvent(payload.event, payload);
              return;
            }
            if (payload.requestId && this.pendingRequests.has(payload.requestId)) {
              const pending = this.pendingRequests.get(payload.requestId)!;
              window.clearTimeout(pending.timeout);
              this.pendingRequests.delete(payload.requestId);
              pending.resolve({
                ok: Boolean(payload.ok),
                message: payload.message || 'Action completed.',
                data: payload.data,
              });
            }
          } catch {
            // ignore malformed companion packets
          }
        };

        socket.onerror = () => {
          window.clearTimeout(timer);
          this.onStatusChange(false);
          resolve(false);
        };

        socket.onclose = () => {
          this.onStatusChange(false);
          this.pendingRequests.forEach((p) => {
            window.clearTimeout(p.timeout);
            p.resolve({
              ok: false,
              message: 'Desktop Companion disconnected before completing the action.',
            });
          });
          this.pendingRequests.clear();
        };
      } catch {
        this.onStatusChange(false);
        resolve(false);
      }
    });
  }

  public disconnect(): void {
    if (this.ws) {
      const s = this.ws;
      this.ws = null;
      try {
        s.close();
      } catch {
        // ignore
      }
    }
    this.onStatusChange(false);
  }

  public async sendCommand(
    action: string,
    params: Record<string, unknown>
  ): Promise<CompanionResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return {
        ok: false,
        message: `Desktop Companion is offline (${this.url}). Download and run the Companion bundle locally to enable native PC actions.`,
      };
    }

    const timeoutMs =
      action === 'companion_project_test' || action === 'companion_install_deps'
        ? 35000
        : 8500;
    const requestId = `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({
          ok: false,
          message: 'Desktop Companion timed out waiting for native OS confirmation.',
        });
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, timeout });
      this.ws!.send(
        JSON.stringify({
          requestId,
          action,
          params: this.pairingToken && action !== 'auth' ? { ...params, token: this.pairingToken } : params,
        })
      );
    });
  }

  public listInstalledApps(): Promise<CompanionResponse> {
    return this.sendCommand('companion_list_apps', {});
  }

  public listWindows(): Promise<CompanionResponse> {
    return this.sendCommand('companion_list_windows', {});
  }

  public controlWindow(subAction: string, target: string): Promise<CompanionResponse> {
    return this.sendCommand('companion_window_control', { subAction, target });
  }

  public captureScreenOcr(): Promise<CompanionResponse> {
    return this.sendCommand('companion_screen_ocr', {});
  }

  public getHardwareTelemetry(): Promise<CompanionResponse> {
    return this.sendCommand('system_info', {});
  }

  public organizeFiles(target = 'downloads'): Promise<CompanionResponse> {
    return this.sendCommand('companion_file_organize', { target });
  }

  public findDuplicates(target = 'downloads'): Promise<CompanionResponse> {
    return this.sendCommand('companion_file_duplicates', { target });
  }

  public runMouseAction(subAction: string, x?: number, y?: number): Promise<CompanionResponse> {
    return this.sendCommand('companion_mouse_action', { subAction, x, y });
  }

  public runKeyboardAction(
    subAction: 'type' | 'hotkey',
    payload: { value?: string; keys?: string[] }
  ): Promise<CompanionResponse> {
    return this.sendCommand('companion_keyboard_action', { subAction, ...payload });
  }

  public lockSystem(): Promise<CompanionResponse> {
    return this.sendCommand('companion_lock_system', {});
  }

  public readClipboard(): Promise<CompanionResponse> {
    return this.sendCommand('companion_clipboard_read', {});
  }

  public writeClipboard(text: string): Promise<CompanionResponse> {
    return this.sendCommand('companion_clipboard_write', { text });
  }

  public checkBlender(): Promise<CompanionResponse> {
    return this.sendCommand('companion_check_blender', {});
  }

  public placeCall(phone: string, contactName?: string): Promise<CompanionResponse> {
    return this.sendCommand('companion_place_call', { phone, contactName });
  }

  public listAuthorizedProjects(): Promise<CompanionResponse> {
    return this.sendCommand('companion_list_authorized_projects', {});
  }

  public authorizeProjectRoot(rootPath: string): Promise<CompanionResponse> {
    return this.sendCommand('companion_authorize_project_root', { rootPath });
  }

  public inspectProject(projectRoot?: string): Promise<CompanionResponse> {
    return this.sendCommand('companion_project_inspect', { projectRoot });
  }

  public readProjectFile(projectRoot: string, relativePath: string): Promise<CompanionResponse> {
    return this.sendCommand('companion_project_read', { projectRoot, relativePath });
  }

  public writeProjectFileWithBackup(
    projectRoot: string,
    relativePath: string,
    content: string,
    reason = 'Autonomous patch'
  ): Promise<CompanionResponse> {
    return this.sendCommand('companion_project_write_with_backup', {
      projectRoot,
      relativePath,
      content,
      reason,
    });
  }

  public deleteProjectFileWithBackup(
    projectRoot: string,
    relativePath: string,
    reason = 'Requested deletion'
  ): Promise<CompanionResponse> {
    return this.sendCommand('companion_project_delete_with_backup', {
      projectRoot,
      relativePath,
      reason,
    });
  }

  public listProjectBackups(projectRoot?: string): Promise<CompanionResponse> {
    return this.sendCommand('companion_project_list_backups', { projectRoot });
  }

  public rollbackProjectBackup(projectRoot: string, snapshotId: string): Promise<CompanionResponse> {
    return this.sendCommand('companion_project_rollback', { projectRoot, snapshotId });
  }

  public runProjectTest(
    projectRoot: string,
    commandPreset:
      | 'npm_test'
      | 'npm_build'
      | 'npm_lint'
      | 'tsc_check'
      | 'pytest'
      | 'python_unittest'
      | 'mvn_test'
      | 'cargo_test'
  ): Promise<CompanionResponse> {
    return this.sendCommand('companion_project_test', { projectRoot, commandPreset });
  }

  public installProjectDependencies(
    projectRoot: string,
    manager: 'npm' | 'pip',
    packages: string[]
  ): Promise<CompanionResponse> {
    return this.sendCommand('companion_install_deps', { projectRoot, manager, packages });
  }
}

export const DESKTOP_COMPANION_SCRIPT = `// jarvis-companion.mjs — Autonomous Local PC Bridge, Python Windows Agent Router & Alarm Daemon
// Usage: npm install ws && node jarvis-companion.mjs
// Connects locally on ws://127.0.0.1:4849 (never exposed publicly)

import { WebSocketServer } from 'ws';
import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PORT = 4849;
const PYTHON_AGENT_URL = process.env.AUGUST_PYTHON_AGENT_URL || 'http://127.0.0.1:4850';
const WORKSPACE_DIR = path.join(os.homedir(), 'Documents', 'AugustWorkspace');
const SCHEDULE_FILE = path.join(os.homedir(), '.august-companion-schedules.json');
const AUTHORIZED_PROJECTS_FILE = path.join(os.homedir(), '.august-authorized-projects.json');
const TOKEN_FILE = path.join(os.homedir(), '.august-companion-token');
fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

function loadAuthorizedRoots() {
  const roots = new Set([path.resolve(WORKSPACE_DIR)]);
  try {
    if (fs.existsSync(AUTHORIZED_PROJECTS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(AUTHORIZED_PROJECTS_FILE, 'utf8'));
      if (Array.isArray(parsed)) {
        for (const r of parsed) {
          if (typeof r === 'string' && fs.existsSync(r)) {
            roots.add(path.resolve(r));
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return Array.from(roots);
}

function saveAuthorizedRoots(roots) {
  try {
    fs.writeFileSync(AUTHORIZED_PROJECTS_FILE, JSON.stringify(roots, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

function resolveAuthorizedProjectRoot(rawRoot) {
  const target = path.resolve(String(rawRoot || WORKSPACE_DIR));
  const roots = loadAuthorizedRoots();
  if (!roots.includes(target)) {
    return null;
  }
  return target;
}

function resolveSafeProjectFile(projectRoot, relPath) {
  const cleaned = String(relPath || '').replace(/\\\\/g, '/').replace(/^\\/+/, '');
  if (!cleaned || cleaned.includes('..')) return null;
  if (/^(\\.git|node_modules|\\.jarvis-backups)\\//i.test(cleaned)) return null;
  const resolved = path.resolve(projectRoot, cleaned);
  if (!resolved.startsWith(projectRoot + path.sep) && resolved !== projectRoot) {
    return null;
  }
  return { absPath: resolved, relPath: cleaned };
}

function walkProjectTree(rootDir, baseDir = rootDir, depth = 0, out = []) {
  if (depth > 4 || out.length >= 250) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (out.length >= 250) break;
    if (['node_modules', '.git', 'dist', 'build', '__pycache__', '.jarvis-backups', '.next'].includes(ent.name)) {
      continue;
    }
    const full = path.join(rootDir, ent.name);
    const rel = path.relative(baseDir, full).replace(/\\\\/g, '/');
    if (ent.isDirectory()) {
      out.push({ path: rel, kind: 'directory' });
      walkProjectTree(full, baseDir, depth + 1, out);
    } else if (ent.isFile()) {
      let size = 0;
      try {
        size = fs.statSync(full).size;
      } catch {
        // ignore
      }
      out.push({ path: rel, kind: 'file', size });
    }
  }
  return out;
}

function createBackupSnapshot(projectRoot, relPaths, reason) {
  const snapshotId = \`snap_\${Date.now()}_\${crypto.randomBytes(3).toString('hex')}\`;
  const backupRoot = path.join(projectRoot, '.jarvis-backups', snapshotId);
  fs.mkdirSync(backupRoot, { recursive: true });
  const records = [];
  for (const rel of relPaths) {
    const abs = path.resolve(projectRoot, rel);
    const existed = fs.existsSync(abs) && fs.statSync(abs).isFile();
    if (existed) {
      const dest = path.join(backupRoot, 'files', rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(abs, dest);
    }
    records.push({ relPath: rel, existedBefore: existed });
  }
  const manifest = {
    snapshotId,
    projectRoot,
    reason: String(reason || 'File modification').slice(0, 200),
    files: relPaths,
    records,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(backupRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return manifest;
}

function loadOrCreateToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const existing = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
      if (existing.length >= 16) return existing;
    }
  } catch {
    // ignore
  }
  const fresh = crypto.randomBytes(24).toString('hex');
  try {
    fs.writeFileSync(TOKEN_FILE, fresh, 'utf8');
  } catch {
    // ignore
  }
  return fresh;
}

const PAIRING_TOKEN = process.env.AUGUST_COMPANION_TOKEN || loadOrCreateToken();

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return (
      u.hostname === '127.0.0.1' ||
      u.hostname === 'localhost' ||
      u.hostname.endsWith('.run.app') ||
      u.hostname.endsWith('aistudio.google.com') ||
      u.hostname.endsWith('.web.app') ||
      u.hostname.endsWith('.firebaseapp.com')
    );
  } catch {
    return false;
  }
}

const wss = new WebSocketServer({
  host: '127.0.0.1',
  port: PORT,
  verifyClient: (info, cb) => {
    const origin = info.origin || info.req?.headers?.origin || '';
    if (!isAllowedOrigin(origin)) {
      cb(false, 403, 'Disallowed WebSocket Origin');
      return;
    }
    cb(true);
  },
});

const ALLOWED_APPS = {
  chrome: process.platform === 'win32' ? 'chrome' : process.platform === 'darwin' ? 'Google Chrome' : 'google-chrome',
  edge: process.platform === 'win32' ? 'msedge' : process.platform === 'darwin' ? 'Microsoft Edge' : 'microsoft-edge',
  firefox: 'firefox',
  vscode: 'code',
  terminal: process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'Terminal' : 'x-terminal-emulator',
  spotify: 'spotify',
  notes: process.platform === 'darwin' ? 'Notes' : 'notepad',
  discord: process.platform === 'darwin' ? 'Discord' : 'discord',
  slack: process.platform === 'darwin' ? 'Slack' : 'slack',
  calculator: process.platform === 'win32' ? 'calc' : process.platform === 'darwin' ? 'Calculator' : 'gnome-calculator',
  explorer: process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'Finder' : 'xdg-open',
  vlc: 'vlc',
  steam: 'steam',
  obs: 'obs64',
  blender: 'blender',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  brave: 'brave',
  word: 'winword',
  excel: 'excel',
  taskmgr: 'taskmgr',
};

const PROCESS_NAMES = {
  chrome: process.platform === 'win32' ? 'chrome.exe' : process.platform === 'darwin' ? 'Google Chrome' : 'chrome',
  edge: process.platform === 'win32' ? 'msedge.exe' : 'msedge',
  firefox: process.platform === 'win32' ? 'firefox.exe' : 'firefox',
  vscode: process.platform === 'win32' ? 'Code.exe' : process.platform === 'darwin' ? 'Visual Studio Code' : 'code',
  spotify: process.platform === 'win32' ? 'Spotify.exe' : 'Spotify',
  notes: process.platform === 'win32' ? 'notepad.exe' : 'Notes',
  discord: process.platform === 'win32' ? 'Discord.exe' : 'Discord',
  slack: process.platform === 'win32' ? 'slack.exe' : 'Slack',
  calculator: process.platform === 'win32' ? 'CalculatorApp.exe' : 'Calculator',
  vlc: process.platform === 'win32' ? 'vlc.exe' : 'vlc',
  steam: process.platform === 'win32' ? 'steam.exe' : 'steam',
  obs: process.platform === 'win32' ? 'obs64.exe' : 'obs',
};

let storedSchedules = [];
let missedAlerts = [];
let awarenessEnabled = false;
let lastDesktopKey = '';
let pythonAgentReady = false;

async function callPythonAgent(method, endpoint, body) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(\`\${PYTHON_AGENT_URL}\${endpoint}\`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Companion-Token': PAIRING_TOKEN,
      },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    pythonAgentReady = true;
    return await res.json();
  } catch {
    pythonAgentReady = false;
    return null;
  }
}

async function refreshPythonHealth() {
  const res = await callPythonAgent('GET', '/health');
  pythonAgentReady = Boolean(res?.ok);
}

setInterval(refreshPythonHealth, 12000);
void refreshPythonHealth();

function loadSchedules() {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
      storedSchedules = Array.isArray(parsed.schedules) ? parsed.schedules : [];
      missedAlerts = Array.isArray(parsed.missedAlerts) ? parsed.missedAlerts : [];
    }
  } catch {
    storedSchedules = [];
  }
}

function saveSchedules() {
  try {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify({ schedules: storedSchedules, missedAlerts }, null, 2));
  } catch {
    // ignore disk errors
  }
}

function speakNativeAlert(text) {
  const safeText = String(text || 'Reminder due').replace(/["'\`$&;|]/g, ' ');
  if (process.platform === 'win32') {
    const ps = \`Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak("\${safeText}")\`;
    execFile('powershell', ['-NoProfile', '-Command', ps], () => {});
  } else if (process.platform === 'darwin') {
    execFile('say', [safeText], () => {});
    execFile('osascript', ['-e', \`display notification "\${safeText}" with title "August Assistant"\`], () => {});
  } else {
    execFile('notify-send', ['August Assistant', safeText], () => {});
    execFile('spd-say', [safeText], () => {});
  }
}

function broadcastEvent(eventName, payload) {
  const data = JSON.stringify({ event: eventName, ...payload });
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client.isAuthenticated) {
      client.send(data);
    }
  });
}

function classifyActivity(activeApp, windowTitle) {
  const combined = \`\${activeApp} \${windowTitle}\`.toLowerCase();
  if (/minecraft|gta|valorant|cs2|steam|roblox|cyberpunk|fortnite|epic games|league of legends|overwatch/.test(combined)) {
    return 'gaming';
  }
  if (/discord|zoom|teams|meet|phone link|yourphone|skype|whatsapp/.test(combined) && /call|voice|meeting/.test(combined)) {
    return 'call';
  }
  if (/youtube|netflix|twitch|vlc|crunchyroll|prime video|disney\\+|anime/.test(combined)) {
    return 'video';
  }
  if (/chrome|edge|firefox|brave|opera|safari/.test(combined)) {
    return 'browser';
  }
  if (/focus|do not disturb|dnd/.test(combined)) {
    return 'dnd';
  }
  return activeApp ? 'desktop' : 'idle';
}

function pollActiveWindow(cb) {
  if (process.platform === 'win32') {
    const ps = [
      'Add-Type @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'using System.Text;',
      'public class Win32FG {',
      '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
      '  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);',
      '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);',
      '}',
      '"@;',
      '$hwnd = [Win32FG]::GetForegroundWindow();',
      '$sb = New-Object System.Text.StringBuilder 512;',
      '[void][Win32FG]::GetWindowText($hwnd, $sb, $sb.Capacity);',
      '$pid = 0; [void][Win32FG]::GetWindowThreadProcessId($hwnd, [ref]$pid);',
      '$proc = (Get-Process -Id $pid -ErrorAction SilentlyContinue).ProcessName;',
      'Write-Output "$proc||$($sb.ToString())"',
    ].join(' ');
    execFile('powershell', ['-NoProfile', '-Command', ps], (err, stdout) => {
      if (err) return cb(null);
      const [activeApp = '', windowTitle = ''] = String(stdout || '').trim().split('||');
      cb({ activeApp: activeApp.trim(), windowTitle: windowTitle.trim() });
    });
  } else if (process.platform === 'darwin') {
    const script = 'tell application "System Events" to get {name of first application process whose frontmost is true, name of front window of (first application process whose frontmost is true)}';
    execFile('osascript', ['-e', script], (err, stdout) => {
      if (err) return cb(null);
      const parts = String(stdout || '').trim().split(',');
      cb({ activeApp: (parts[0] || '').trim(), windowTitle: parts.slice(1).join(',').trim() });
    });
  } else {
    execFile('xdotool', ['getactivewindow', 'getwindowname'], (err, stdout) => {
      if (err) return cb(null);
      const title = String(stdout || '').trim();
      cb({ activeApp: 'desktop', windowTitle: title });
    });
  }
}

loadSchedules();

setInterval(() => {
  const now = Date.now();
  let dirty = false;
  for (const item of storedSchedules) {
    if (item.status !== 'scheduled' && item.status !== 'snoozed') continue;
    const dueMs = new Date(item.snoozedUntil || item.triggerAt).getTime();
    if (!Number.isNaN(dueMs) && dueMs <= now) {
      item.status = 'triggered';
      item.triggeredAt = new Date().toISOString();
      dirty = true;
      const alertText = item.spokenMessage || \`Hasan, your \${item.kind} \${item.title} is due.\`;
      console.log('[Companion Alarm]', alertText);
      speakNativeAlert(alertText);
      const alertObj = { id: item.id, title: item.title, kind: item.kind, spokenText: alertText, triggeredAt: item.triggeredAt };
      let pushedToClient = false;
      wss.clients.forEach((client) => {
        if (client.readyState === 1 && client.isAuthenticated) {
          client.send(JSON.stringify({ event: 'schedule_due', alert: alertObj }));
          pushedToClient = true;
        }
      });
      if (!pushedToClient) {
        missedAlerts.push(alertObj);
      }
    }
  }
  if (dirty) saveSchedules();
}, 1000);

// Opt-in desktop foreground awareness ticker
setInterval(() => {
  if (!awarenessEnabled || wss.clients.size === 0) return;
  pollActiveWindow((info) => {
    if (!info) return;
    const activity = classifyActivity(info.activeApp, info.windowTitle);
    const key = \`\${info.activeApp}|\${info.windowTitle}|\${activity}\`;
    if (key !== lastDesktopKey) {
      lastDesktopKey = key;
      broadcastEvent('desktop_context', {
        activeApp: info.activeApp,
        windowTitle: info.windowTitle,
        activity,
        doNotDisturb: activity === 'dnd',
        pythonAgentReady,
        updatedAt: new Date().toISOString(),
      });
    }
  });
}, 4000);

function safeWorkspacePath(rawName) {
  const clean = path.basename(String(rawName || 'note.txt').replace(/[\\\\/:*?"<>|]/g, '_'));
  return path.join(WORKSPACE_DIR, clean || 'note.txt');
}

function openDesktopUrl(targetUrl, cb) {
  const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', targetUrl]] : process.platform === 'darwin' ? ['open', [targetUrl]] : ['xdg-open', [targetUrl]];
  execFile(opener[0], opener[1], cb);
}

function tokenMatches(candidate) {
  const clean = String(candidate || '').trim();
  if (!clean || clean.length !== PAIRING_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(clean), Buffer.from(PAIRING_TOKEN));
}

wss.on('connection', (ws, req) => {
  const remoteAddr = req?.socket?.remoteAddress || '';
  const isLoopback = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
  ws.isAuthenticated = false;

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const { requestId, action, params } = msg;
    const reply = (ok, message, data = {}) => {
      ws.send(JSON.stringify({ requestId, ok, message, data }));
    };

    if (action === 'auth') {
      if (tokenMatches(params?.token)) {
        ws.isAuthenticated = true;
        await refreshPythonHealth();
        reply(true, 'Desktop Companion authenticated cleanly.', { pythonAgentReady });
      } else {
        reply(false, 'Invalid Companion pairing token. Check the token printed in your Companion terminal.', { needsPairingToken: true });
      }
      return;
    }

    if (params?.token && tokenMatches(params.token)) {
      ws.isAuthenticated = true;
    }

    if (!ws.isAuthenticated && process.env.AUGUST_REQUIRE_TOKEN === '1') {
      reply(false, 'Companion pairing token required. Paste the token shown in the terminal into Settings.', { needsPairingToken: true });
      return;
    }

    if (!ws.isAuthenticated && !isLoopback) {
      reply(false, 'Remote WebSocket connections require a valid Companion pairing token.', { needsPairingToken: true });
      return;
    }

    // Auto-authenticate loopback read/basic handshakes when pairing token matches or loopback mode is active
    ws.isAuthenticated = true;

    if (action === 'system_info') {
      const pyTel = await callPythonAgent('GET', '/system/telemetry');
      reply(true, 'Local PC telemetry retrieved.', {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
        totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
        uptimeMin: Math.round(os.uptime() / 60),
        workspaceDir: WORKSPACE_DIR,
        awarenessEnabled,
        pythonAgentReady,
        telemetry: pyTel?.data || {},
      });
      return;
    }

    if (action === 'companion_list_apps') {
      const pyRes = await callPythonAgent('GET', '/apps');
      if (pyRes?.ok) {
        reply(true, pyRes.message, pyRes.data);
      } else {
        const apps = Object.keys(ALLOWED_APPS).map((k) => ({ name: k, execKey: k, source: 'allowlist' }));
        reply(true, \`Listed \${apps.length} built-in desktop app targets (start Python agent for full Start Menu discovery).\`, { apps });
      }
      return;
    }

    if (action === 'companion_list_windows') {
      const pyRes = await callPythonAgent('GET', '/windows');
      if (pyRes?.ok) {
        reply(true, pyRes.message, pyRes.data);
      } else {
        reply(false, 'Window enumeration requires the Python Windows Agent (http://127.0.0.1:4850).');
      }
      return;
    }

    if (action === 'companion_window_control') {
      const pyRes = await callPythonAgent('POST', '/window-control', params);
      if (pyRes) {
        reply(pyRes.ok, pyRes.message, pyRes.data || {});
      } else {
        reply(false, 'Window control requires the Python Windows Agent (http://127.0.0.1:4850).');
      }
      return;
    }

    if (action === 'companion_mouse_action') {
      const pyRes = await callPythonAgent('POST', '/mouse', params);
      if (pyRes) {
        reply(pyRes.ok, pyRes.message, pyRes.data || {});
      } else {
        reply(false, 'Mouse automation requires the Python Windows Agent (pyautogui).');
      }
      return;
    }

    if (action === 'companion_keyboard_action') {
      const pyRes = await callPythonAgent('POST', '/keyboard', params);
      if (pyRes) {
        reply(pyRes.ok, pyRes.message, pyRes.data || {});
      } else {
        reply(false, 'Keyboard automation requires the Python Windows Agent (pyautogui).');
      }
      return;
    }

    if (action === 'companion_screen_ocr') {
      const pyRes = await callPythonAgent('POST', '/screenshot-ocr', params);
      if (pyRes) {
        reply(pyRes.ok, pyRes.message, pyRes.data || {});
      } else {
        reply(false, 'Native desktop OCR requires the Python Windows Agent (mss + rapidocr-onnxruntime).');
      }
      return;
    }

    if (action === 'companion_file_organize') {
      const pyRes = await callPythonAgent('POST', '/files/organize', params);
      if (pyRes) {
        reply(pyRes.ok, pyRes.message, pyRes.data || {});
      } else {
        reply(false, 'Automated folder organization requires the Python Windows Agent.');
      }
      return;
    }

    if (action === 'companion_file_duplicates') {
      const pyRes = await callPythonAgent('POST', '/files/duplicates', params);
      if (pyRes) {
        reply(pyRes.ok, pyRes.message, pyRes.data || {});
      } else {
        reply(false, 'Duplicate file scanning requires the Python Windows Agent.');
      }
      return;
    }

    if (action === 'companion_lock_system') {
      const pyRes = await callPythonAgent('POST', '/system/lock', params);
      if (pyRes) {
        reply(pyRes.ok, pyRes.message, pyRes.data || {});
      } else if (process.platform === 'win32') {
        execFile('rundll32.exe', ['user32.dll,LockWorkStation'], (err) => {
          reply(!err, err ? err.message : 'Windows workstation locked.');
        });
      } else {
        reply(false, 'Workstation lock is supported on Windows hosts.');
      }
      return;
    }

    if (action === 'desktop_awareness_toggle') {
      awarenessEnabled = Boolean(params?.enabled);
      lastDesktopKey = '';
      if (awarenessEnabled) {
        pollActiveWindow((info) => {
          const activeApp = info?.activeApp || 'Desktop';
          const windowTitle = info?.windowTitle || 'Workspace';
          const activity = classifyActivity(activeApp, windowTitle);
          broadcastEvent('desktop_context', {
            activeApp,
            windowTitle,
            activity,
            doNotDisturb: activity === 'dnd',
            pythonAgentReady,
            updatedAt: new Date().toISOString(),
          });
          reply(true, 'Opt-in desktop window awareness enabled.', { activeApp, windowTitle, activity, pythonAgentReady });
        });
      } else {
        reply(true, 'Desktop window awareness paused (privacy kill switch).', { enabled: false });
      }
      return;
    }

    if (action === 'companion_listen_once') {
      if (process.platform !== 'win32') {
        reply(false, 'Local companion OS dictation is currently supported on Windows System.Speech.');
        return;
      }
      const ps = [
        'Add-Type -AssemblyName System.Speech;',
        '$rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine;',
        '$rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar));',
        '$rec.SetInputToDefaultAudioDevice();',
        '$res = $rec.Recognize([TimeSpan]::FromSeconds(6));',
        'if ($res) { Write-Output $res.Text }',
      ].join(' ');
      execFile('powershell', ['-NoProfile', '-Command', ps], (err, stdout) => {
        const transcript = String(stdout || '').trim();
        if (err || !transcript) {
          reply(false, 'No local Windows speech command recognized.');
        } else {
          reply(true, 'Captured command via Windows Speech.', { transcript });
        }
      });
      return;
    }

    if (action === 'companion_browser_action') {
      const subAction = String(params?.action || '').toLowerCase();
      const url = params?.url ? String(params.url) : '';
      if (url) {
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            reply(false, 'Only HTTP/HTTPS URLs are permitted.');
            return;
          }
          openDesktopUrl(parsed.toString(), (err) => {
            reply(!err, err ? err.message : \`Opened \${parsed.toString()} in your desktop browser.\`, {
              url: parsed.toString(),
              usedDesktopBrowser: true,
            });
          });
          return;
        } catch {
          reply(false, 'Invalid URL for desktop browser.');
          return;
        }
      }
      if (process.platform === 'win32' && ['scroll_down', 'scroll_up', 'back', 'forward', 'new_tab', 'close_tab'].includes(subAction)) {
        const sendKey = subAction === 'scroll_down' ? '{PGDN}' : subAction === 'scroll_up' ? '{PGUP}' : subAction === 'back' ? '%{LEFT}' : subAction === 'forward' ? '%{RIGHT}' : subAction === 'new_tab' ? '^t' : '^w';
        const ps = \`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("\${sendKey}")\`;
        execFile('powershell', ['-NoProfile', '-Command', ps], (err) => {
          reply(!err, err ? err.message : \`Sent desktop browser command: \${subAction}.\`);
        });
        return;
      }
      reply(false, \`Desktop companion does not handle browser action "\${subAction}" directly; falling back to headless browser engine.\`);
      return;
    }

    if (action === 'incoming_call_action') {
      const callAct = String(params?.callAction || 'notify');
      const replyText = String(params?.replyText || 'Hasan is currently busy and will call back soon.');
      if (callAct === 'busy_reply') {
        speakNativeAlert(replyText);
        reply(true, \`Spoke busy call notice: "\${replyText}"\`);
        return;
      }
      reply(true, \`Recorded call action "\${callAct}" on companion.\`);
      return;
    }

    if (action === 'companion_sync_schedules') {
      if (Array.isArray(params?.items)) {
        storedSchedules = params.items;
        saveSchedules();
      } else if (Array.isArray(params?.schedules)) {
        storedSchedules = params.schedules;
        saveSchedules();
      }
      const pendingMissed = [...missedAlerts];
      missedAlerts = [];
      saveSchedules();
      reply(true, \`Synced \${storedSchedules.length} schedule(s) to PC daemon.\`, { missedAlerts: pendingMissed });
      return;
    }

    if (action === 'companion_open_url') {
      let parsed;
      try {
        parsed = new URL(String(params?.url || ''));
      } catch {
        reply(false, 'Invalid URL provided.');
        return;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        reply(false, 'Only HTTP/HTTPS URLs are permitted.');
        return;
      }
      const targetUrl = parsed.toString();
      openDesktopUrl(targetUrl, (err) => {
        reply(!err, err ? err.message : \`Opened \${targetUrl} in default browser.\`);
      });
      return;
    }

    if (action === 'companion_launch_app') {
      const key = String(params?.appName || params?.target || '').toLowerCase().trim();
      const pyRes = await callPythonAgent('POST', '/launch', { target: key });
      if (pyRes?.ok) {
        reply(true, pyRes.message, pyRes.data || {});
        return;
      }
      const cmd = ALLOWED_APPS[key];
      if (!cmd) {
        reply(false, \`App "\${key}" was not matched. Ensure the Python Windows Agent is running for installed Start Menu discovery.\`);
        return;
      }
      if (process.platform === 'darwin') {
        execFile('open', ['-a', cmd], (err) => {
          reply(!err, err ? err.message : \`Launched \${cmd}.\`);
        });
      } else {
        execFile(cmd, [], (err) => {
          reply(!err, err ? err.message : \`Launched \${cmd}.\`);
        });
      }
      return;
    }

    if (action === 'companion_close_app') {
      const key = String(params?.target || params?.appName || '').toLowerCase().trim();
      const proc = PROCESS_NAMES[key];
      if (!proc) {
        const pyRes = await callPythonAgent('POST', '/window-control', { subAction: 'close', target: key });
        if (pyRes) {
          reply(pyRes.ok, pyRes.message, pyRes.data || {});
          return;
        }
        reply(false, \`Process "\${key}" is not in the close allowlist (\${Object.keys(PROCESS_NAMES).join(', ')}).\`);
        return;
      }
      if (process.platform === 'win32') {
        execFile('taskkill', ['/IM', proc, '/F'], (err) => {
          reply(!err, err ? err.message : \`Closed \${key}.\`);
        });
      } else {
        execFile('pkill', ['-f', proc], (err) => {
          reply(!err, err ? err.message : \`Closed \${key}.\`);
        });
      }
      return;
    }

    if (action === 'companion_media_control') {
      const cmd = String(params?.target || 'play_pause').toLowerCase();
      if (process.platform === 'darwin') {
        const keyCode = cmd === 'next' ? 16 : cmd === 'previous' ? 17 : 49;
        execFile('osascript', ['-e', \`tell application "System Events" to key code \${keyCode}\`], (err) => {
          reply(!err, err ? err.message : \`Sent media command: \${cmd}\`);
        });
      } else if (process.platform === 'linux') {
        const arg = cmd === 'next' ? 'next' : cmd === 'previous' ? 'previous' : cmd === 'pause' ? 'pause' : 'play-pause';
        execFile('playerctl', [arg], (err) => {
          reply(!err, err ? 'playerctl not installed on Linux host.' : \`Media \${cmd} executed.\`);
        });
      } else {
        const vk = cmd === 'next' ? '0xB0' : cmd === 'previous' ? '0xB1' : '0xB3';
        const ps = \`$sig='[DllImport("user32.dll")]public static extern void keybd_event(byte bVk,byte bScan,uint dwFlags,UIntPtr dwExtraInfo);';$t=Add-Type -MemberDefinition $sig -Name K -PassThru;$t::keybd_event(\${vk},0,0,[UIntPtr]::Zero);$t::keybd_event(\${vk},0,2,[UIntPtr]::Zero)\`;
        execFile('powershell', ['-NoProfile', '-Command', ps], (err) => {
          reply(!err, err ? err.message : \`Executed Windows media key: \${cmd}\`);
        });
      }
      return;
    }

    if (action === 'companion_system_setting') {
      const setting = String(params?.target || '').toLowerCase();
      const level = Math.max(0, Math.min(100, Number(params?.value || 50)));
      if (setting === 'volume') {
        const pyRes = await callPythonAgent('POST', '/system/volume', { value: level });
        if (pyRes?.ok) {
          reply(true, pyRes.message);
          return;
        }
        if (process.platform === 'darwin') {
          execFile('osascript', ['-e', \`set volume output volume \${level}\`], (err) => {
            reply(!err, err ? err.message : \`System volume set to \${level}%.\`);
          });
        } else if (process.platform === 'linux') {
          execFile('amixer', ['sset', 'Master', \`\${level}%\`], (err) => {
            reply(!err, err ? err.message : \`System volume set to \${level}%.\`);
          });
        } else {
          reply(false, 'Windows volume control requires the Python Windows Agent (pycaw).');
        }
        return;
      }
      if (setting === 'brightness') {
        const pyRes = await callPythonAgent('POST', '/system/brightness', { value: level });
        if (pyRes) {
          reply(pyRes.ok, pyRes.message);
        } else {
          reply(false, 'Brightness adjustment requires the Python Windows Agent.');
        }
        return;
      }
      reply(false, \`Unsupported setting "\${setting}".\`);
      return;
    }

    if (action === 'companion_write_file') {
      const filePath = safeWorkspacePath(params?.target || 'note.txt');
      const content = String(params?.value || '');
      try {
        fs.writeFileSync(filePath, content, 'utf8');
        reply(true, \`Created file \${path.basename(filePath)} in AugustWorkspace.\`, { path: filePath });
      } catch (err) {
        reply(false, err instanceof Error ? err.message : 'Unable to write file.');
      }
      return;
    }

    if (action === 'companion_read_file') {
      const filePath = safeWorkspacePath(params?.target || 'note.txt');
      try {
        if (!fs.existsSync(filePath)) {
          reply(false, \`File "\${path.basename(filePath)}" not found in AugustWorkspace.\`);
          return;
        }
        const text = fs.readFileSync(filePath, 'utf8').slice(0, 8000);
        reply(true, \`Read \${path.basename(filePath)}.\`, { content: text, path: filePath });
      } catch (err) {
        reply(false, err instanceof Error ? err.message : 'Unable to read file.');
      }
      return;
    }

    if (action === 'companion_run_command') {
      const cmdKey = String(params?.target || '').toLowerCase().trim();
      const SAFE_COMMANDS = {
        date: process.platform === 'win32' ? ['cmd', ['/c', 'date /t']] : ['date', []],
        whoami: ['whoami', []],
        uptime: process.platform === 'win32' ? ['net', ['stats', 'workstation']] : ['uptime', []],
      };
      const entry = SAFE_COMMANDS[cmdKey];
      if (!entry) {
        reply(false, \`Command "\${cmdKey}" is not in the safe allowlist (\${Object.keys(SAFE_COMMANDS).join(', ')}).\`);
        return;
      }
      execFile(entry[0], entry[1], (err, stdout) => {
        reply(!err, err ? err.message : (stdout || 'Executed.').trim(), { stdout });
      });
      return;
    }

    if (action === 'companion_clipboard_read') {
      const pyRes = await callPythonAgent('GET', '/clipboard');
      if (pyRes) {
        reply(pyRes.ok, pyRes.message, pyRes.data || {});
      } else {
        reply(false, 'Clipboard read requires the Python Windows Agent (http://127.0.0.1:4850).');
      }
      return;
    }

    if (action === 'companion_clipboard_write') {
      const pyRes = await callPythonAgent('POST', '/clipboard', { text: String(params?.text || '') });
      if (pyRes) {
        reply(pyRes.ok, pyRes.message, pyRes.data || {});
      } else {
        reply(false, 'Clipboard write requires the Python Windows Agent (http://127.0.0.1:4850).');
      }
      return;
    }

    if (action === 'companion_check_blender') {
      const pyRes = await callPythonAgent('GET', '/blender/check');
      if (pyRes) {
        reply(pyRes.ok, pyRes.message, pyRes.data || {});
      } else {
        const probeCmd = process.platform === 'win32' ? 'where' : 'which';
        execFile(probeCmd, ['blender'], (err, stdout) => {
          const p = String(stdout || '').trim().split(/\\r?\\n/)[0];
          const installed = !err && Boolean(p);
          reply(true, installed ? \`Blender detected at \${p}\` : 'Blender is not installed on PATH.', {
            installed,
            path: installed ? p : '',
            version: installed ? 'CLI available' : '',
          });
        });
      }
      return;
    }

    if (action === 'companion_place_call') {
      const rawPhone = String(params?.phone || '').trim();
      if (!/^[+0-9#*() -]{3,28}$/.test(rawPhone)) {
        reply(false, 'Invalid phone number format.');
        return;
      }
      const pyRes = await callPythonAgent('POST', '/system/dial', { phone: rawPhone });
      if (pyRes) {
        reply(pyRes.ok, pyRes.message, pyRes.data || {});
        return;
      }
      const compact = rawPhone.replace(/[\\s()-]+/g, '');
      const telUri = \`tel:\${compact}\`;
      openDesktopUrl(telUri, (err) => {
        reply(!err, err ? err.message : \`Handed off \${compact} to OS Phone Link / dialer.\`, { uri: telUri, phone: compact });
      });
      return;
    }

    if (action === 'companion_list_authorized_projects') {
      const roots = loadAuthorizedRoots();
      reply(true, \`Found \${roots.length} authorized project root(s).\`, {
        defaultWorkspace: WORKSPACE_DIR,
        roots,
      });
      return;
    }

    if (action === 'companion_authorize_project_root') {
      const candidate = path.resolve(String(params?.rootPath || ''));
      if (!candidate || !fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) {
        reply(false, \`Directory "\${candidate}" does not exist on this PC.\`);
        return;
      }
      const roots = loadAuthorizedRoots();
      if (!roots.includes(candidate)) {
        roots.push(candidate);
        saveAuthorizedRoots(roots);
      }
      reply(true, \`Authorized local project root: \${candidate}\`, { projectRoot: candidate, roots });
      return;
    }

    if (action === 'companion_project_inspect') {
      const root = resolveAuthorizedProjectRoot(params?.projectRoot);
      if (!root) {
        reply(false, 'Project root is not authorized yet. Authorize the folder first.');
        return;
      }
      const tree = walkProjectTree(root);
      let pkgSummary = null;
      const pkgPath = path.join(root, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          pkgSummary = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        } catch {
          pkgSummary = null;
        }
      }
      reply(true, \`Inspected \${tree.length} entry(s) in \${path.basename(root)}.\`, {
        projectRoot: root,
        tree,
        scripts: pkgSummary?.scripts || {},
      });
      return;
    }

    if (action === 'companion_project_read') {
      const root = resolveAuthorizedProjectRoot(params?.projectRoot);
      if (!root) {
        reply(false, 'Project root is not authorized.');
        return;
      }
      const safeTarget = resolveSafeProjectFile(root, params?.relativePath);
      if (!safeTarget || !fs.existsSync(safeTarget.absPath)) {
        reply(false, 'Requested file does not exist inside the authorized project.');
        return;
      }
      const content = fs.readFileSync(safeTarget.absPath, 'utf8').slice(0, 64000);
      reply(true, \`Read \${safeTarget.relPath}.\`, {
        projectRoot: root,
        relativePath: safeTarget.relPath,
        content,
      });
      return;
    }

    if (action === 'companion_project_write_with_backup') {
      const root = resolveAuthorizedProjectRoot(params?.projectRoot);
      if (!root) {
        reply(false, 'Project root is not authorized.');
        return;
      }
      const safeTarget = resolveSafeProjectFile(root, params?.relativePath);
      if (!safeTarget) {
        reply(false, 'Invalid or protected file path.');
        return;
      }
      const manifest = createBackupSnapshot(root, [safeTarget.relPath], params?.reason || 'Autonomous patch');
      fs.mkdirSync(path.dirname(safeTarget.absPath), { recursive: true });
      fs.writeFileSync(safeTarget.absPath, String(params?.content ?? ''), 'utf8');
      reply(true, \`Saved \${safeTarget.relPath} (backup snapshot \${manifest.snapshotId}).\`, {
        snapshot: manifest,
        relativePath: safeTarget.relPath,
      });
      return;
    }

    if (action === 'companion_project_delete_with_backup') {
      const root = resolveAuthorizedProjectRoot(params?.projectRoot);
      if (!root) {
        reply(false, 'Project root is not authorized.');
        return;
      }
      const safeTarget = resolveSafeProjectFile(root, params?.relativePath);
      if (!safeTarget || !fs.existsSync(safeTarget.absPath)) {
        reply(false, 'Target file not found.');
        return;
      }
      const manifest = createBackupSnapshot(root, [safeTarget.relPath], params?.reason || 'Delete with backup');
      fs.unlinkSync(safeTarget.absPath);
      reply(true, \`Deleted \${safeTarget.relPath} with recovery backup \${manifest.snapshotId}.\`, {
        snapshot: manifest,
      });
      return;
    }

    if (action === 'companion_project_list_backups') {
      const root = resolveAuthorizedProjectRoot(params?.projectRoot);
      if (!root) {
        reply(false, 'Project root is not authorized.');
        return;
      }
      const backupsDir = path.join(root, '.jarvis-backups');
      if (!fs.existsSync(backupsDir)) {
        reply(true, 'No backup snapshots created yet.', { snapshots: [] });
        return;
      }
      const snapshots = [];
      for (const dirName of fs.readdirSync(backupsDir)) {
        const manPath = path.join(backupsDir, dirName, 'manifest.json');
        if (fs.existsSync(manPath)) {
          try {
            snapshots.push(JSON.parse(fs.readFileSync(manPath, 'utf8')));
          } catch {
            // ignore
          }
        }
      }
      snapshots.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      reply(true, \`Found \${snapshots.length} backup snapshot(s).\`, { snapshots: snapshots.slice(0, 30) });
      return;
    }

    if (action === 'companion_project_rollback') {
      const root = resolveAuthorizedProjectRoot(params?.projectRoot);
      const snapId = path.basename(String(params?.snapshotId || ''));
      if (!root || !snapId) {
        reply(false, 'Missing authorized project root or snapshotId.');
        return;
      }
      const snapDir = path.join(root, '.jarvis-backups', snapId);
      const manPath = path.join(snapDir, 'manifest.json');
      if (!fs.existsSync(manPath)) {
        reply(false, \`Backup snapshot "\${snapId}" not found.\`);
        return;
      }
      const manifest = JSON.parse(fs.readFileSync(manPath, 'utf8'));
      for (const rec of manifest.records || []) {
        const safeTarget = resolveSafeProjectFile(root, rec.relPath);
        if (!safeTarget) continue;
        if (rec.existedBefore) {
          const backupFile = path.join(snapDir, 'files', safeTarget.relPath);
          if (fs.existsSync(backupFile)) {
            fs.mkdirSync(path.dirname(safeTarget.absPath), { recursive: true });
            fs.copyFileSync(backupFile, safeTarget.absPath);
          }
        } else if (fs.existsSync(safeTarget.absPath)) {
          fs.unlinkSync(safeTarget.absPath);
        }
      }
      reply(true, \`Rolled back project to pre-\${snapId} state.\`, { snapshot: manifest });
      return;
    }

    if (action === 'companion_project_test') {
      const root = resolveAuthorizedProjectRoot(params?.projectRoot);
      if (!root) {
        reply(false, 'Project root is not authorized.');
        return;
      }
      const preset = String(params?.commandPreset || 'npm_test');
      const isWin = process.platform === 'win32';
      const npmBin = isWin ? 'npm.cmd' : 'npm';
      const npxBin = isWin ? 'npx.cmd' : 'npx';
      const TEST_PRESETS = {
        npm_test: [npmBin, ['test']],
        npm_build: [npmBin, ['run', 'build']],
        npm_lint: [npmBin, ['run', 'lint']],
        tsc_check: [npxBin, ['tsc', '--noEmit']],
        pytest: ['pytest', []],
        python_unittest: ['python', ['-m', 'unittest']],
        mvn_test: [isWin ? 'mvn.cmd' : 'mvn', ['test']],
        cargo_test: ['cargo', ['test']],
      };
      const spec = TEST_PRESETS[preset];
      if (!spec) {
        reply(false, \`Unsupported test preset "\${preset}".\`);
        return;
      }
      const t0 = Date.now();
      execFile(spec[0], spec[1], { cwd: root, timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        const durationMs = Date.now() - t0;
        const exitCode = err && typeof err.code === 'number' ? err.code : err ? 1 : 0;
        reply(true, exitCode === 0 ? \`Test "\${preset}" passed in \${durationMs}ms.\` : \`Test "\${preset}" exited with code \${exitCode}.\`, {
          passed: exitCode === 0,
          exitCode,
          durationMs,
          commandPreset: preset,
          stdout: String(stdout || '').slice(0, 12000),
          stderr: String(stderr || '').slice(0, 12000),
        });
      });
      return;
    }

    if (action === 'companion_install_deps') {
      const root = resolveAuthorizedProjectRoot(params?.projectRoot);
      if (!root) {
        reply(false, 'Project root is not authorized.');
        return;
      }
      const manager = String(params?.manager || 'npm').toLowerCase();
      const pkgs = Array.isArray(params?.packages) ? params.packages.map((p) => String(p).trim()).filter(Boolean) : [];
      if (pkgs.length === 0 || pkgs.length > 12 || pkgs.some((p) => !/^[a-zA-Z0-9@/._-]{1,80}$/.test(p) || p.startsWith('-'))) {
        reply(false, 'Invalid or empty dependency package list.');
        return;
      }
      const isWin = process.platform === 'win32';
      const cmd = manager === 'pip' ? 'pip' : isWin ? 'npm.cmd' : 'npm';
      const args = ['install', ...pkgs];
      execFile(cmd, args, { cwd: root, timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        const exitCode = err && typeof err.code === 'number' ? err.code : err ? 1 : 0;
        reply(exitCode === 0, exitCode === 0 ? \`Installed \${pkgs.join(', ')} via \${manager}.\` : \`Package install exited with code \${exitCode}.\`, {
          exitCode,
          stdout: String(stdout || '').slice(0, 8000),
          stderr: String(stderr || '').slice(0, 8000),
        });
      });
      return;
    }

    reply(false, \`Action "\${action}" is not supported.\`);
  });
});

console.log(\`August / J.A.R.V.I.S. Desktop Companion listening on ws://127.0.0.1:\${PORT}\`);
console.log(\`Pairing Token (paste into Companion settings if prompted): \${PAIRING_TOKEN}\`);
console.log(\`Workspace sandbox: \${WORKSPACE_DIR}\`);
`;
