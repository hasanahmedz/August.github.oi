import type { StudioHubId } from '../types/assistant';

export type ParsedLocalCommand =
  | { type: 'stop_speaking' }
  | {
      type: 'create_schedule';
      kind: 'alarm' | 'reminder' | 'timer';
      title: string;
      triggerAtIso: string;
      durationSeconds?: number;
      recurrence: 'once' | 'daily';
      spokenConfirmation: string;
    }
  | { type: 'list_schedules'; kind?: 'alarm' | 'reminder' | 'timer' }
  | { type: 'cancel_schedule'; query?: string; kind?: 'alarm' | 'reminder' | 'timer' }
  | { type: 'snooze_schedule'; minutes: number; query?: string }
  | { type: 'list_tasks'; filter?: 'pending' | 'completed' | 'all' }
  | { type: 'add_task'; title: string; priority?: 'low' | 'medium' | 'high' }
  | { type: 'complete_task'; query: string }
  | {
      type: 'open_web';
      name: string;
      url: string;
      searchQuery?: string;
    }
  | {
      type: 'computer_action';
      action:
        | 'companion_launch_app'
        | 'companion_close_app'
        | 'companion_media_control'
        | 'companion_system_setting'
        | 'companion_write_file'
        | 'companion_read_file'
        | 'companion_list_apps'
        | 'companion_list_windows'
        | 'companion_window_control'
        | 'companion_mouse_action'
        | 'companion_keyboard_action'
        | 'companion_screen_ocr'
        | 'companion_file_organize'
        | 'companion_file_duplicates'
        | 'companion_lock_system'
        | 'create_local_folder'
        | 'open_local_file'
        | 'capture_screenshot'
        | 'system_info';
      target: string;
      value?: string;
      subAction?: string;
      x?: number;
      y?: number;
      keys?: string[];
      label: string;
      requiresConfirmation: boolean;
    }
  | {
      type: 'environment';
      patch: {
        focusMode?: boolean;
        lightBrightness?: number;
        thermostatCelsius?: number;
      };
      spokenConfirmation: string;
    }
  | {
      type: 'browser_automation';
      action:
        | 'search'
        | 'navigate'
        | 'open_result'
        | 'scroll'
        | 'back'
        | 'forward'
        | 'new_tab'
        | 'close_tab'
        | 'switch_tab'
        | 'click_text'
        | 'read_page'
        | 'stop_automation';
      engine?: 'google' | 'youtube' | 'bing' | 'duckduckgo';
      query?: string;
      url?: string;
      resultIndex?: number;
      direction?: 'down' | 'up' | 'top' | 'bottom';
      targetText?: string;
      label: string;
    }
  | {
      type: 'monitor_command';
      action:
        | 'add'
        | 'list'
        | 'stop'
        | 'pause_all'
        | 'resume_all'
        | 'updates_today'
        | 'official_only';
      topic?: string;
      officialOnly?: boolean;
    }
  | {
      type: 'call_command';
      action:
        | 'busy_on'
        | 'busy_off'
        | 'answer_call'
        | 'decline_call'
        | 'who_calling'
        | 'silence_notifications'
        | 'dnd_on'
        | 'dnd_off';
    }
  | {
      type: 'mode_command';
      mode: 'sleep' | 'wake' | 'care' | 'gaming' | 'focus';
    }
  | { type: 'time_query' }
  | { type: 'weather_briefing'; location?: string }
  | { type: 'news_briefing'; topic?: string }
  | {
      type: 'maps_query';
      mode: 'places' | 'directions';
      query: string;
      origin?: string;
      destination?: string;
      travelMode?: 'DRIVE' | 'WALK' | 'TRANSIT' | 'TWO_WHEELER';
    }
  | { type: 'knowledge_query'; query: string }
  | {
      type: 'home_assistant';
      action:
        | 'turn_on'
        | 'turn_off'
        | 'set_brightness'
        | 'set_temperature'
        | 'status'
        | 'list';
      entityHint?: string;
      value?: number;
    }
  | {
      type: 'studio_switch';
      studio: StudioHubId;
      subTab?: '3d' | '2d' | '1d' | 'dev' | 'bugfix' | 'skills' | 'agents' | 'workflows' | 'workspace' | 'calls';
    }
  | {
      type: 'outgoing_call';
      contactQuery: string;
    }
  | {
      type: 'clipboard_command';
      action: 'read' | 'write';
      text?: string;
    }
  | {
      type: 'skill_command';
      action: 'list' | 'run';
      query?: string;
    };

export function stripWakePrefix(rawText: string): string {
  let out = rawText.trim();
  for (let i = 0; i < 2; i += 1) {
    out = out
      .replace(
        /^(?:(?:hey|ok(?:ay)?|hi|hello|yo)\s+)?(?:august|augst|ogast|agast|jarvis|j\.a\.r\.v\.i\.s\.?)[\s,.:!?-]*/i,
        ''
      )
      .trim();
  }
  return out;
}

export function isStopSpeakingCommand(rawText: string): boolean {
  const cleaned = rawText
    .trim()
    .toLowerCase()
    .replace(/[.!?,]+$/g, '');
  if (!cleaned) return false;
  return (
    /^(?:august|jarvis)\s+(?:stop|quiet|silence|mute|thamo|chup)$/i.test(cleaned) ||
    /^(?:stop\s+(?:speaking|talking|voice|audio)|be\s+quiet|shut\s+up|chup\s+koro|thamo|quiet\s+please)$/i.test(
      cleaned
    ) ||
    /\b(?:august\s+stop|jarvis\s+stop|stop\s+speaking)\b/i.test(cleaned)
  );
}

export function resolveWebTarget(
  rawTarget: string,
  searchQuery?: string
): { name: string; url: string; searchQuery?: string } {
  const cleaned = rawTarget.trim();
  const lower = cleaned.toLowerCase();
  const q = searchQuery?.trim();

  const knownApps: Array<{
    keys: string[];
    name: string;
    baseUrl: string;
    searchTemplate?: (query: string) => string;
  }> = [
    {
      keys: ['youtube', 'yt', 'you tube'],
      name: 'YouTube',
      baseUrl: 'https://www.youtube.com',
      searchTemplate: (query) =>
        `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    },
    {
      keys: ['google search', 'google'],
      name: 'Google',
      baseUrl: 'https://www.google.com',
      searchTemplate: (query) =>
        `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    },
    {
      keys: ['github', 'git hub'],
      name: 'GitHub',
      baseUrl: 'https://github.com',
      searchTemplate: (query) =>
        `https://github.com/search?q=${encodeURIComponent(query)}`,
    },
    {
      keys: ['spotify'],
      name: 'Spotify',
      baseUrl: 'https://open.spotify.com',
      searchTemplate: (query) =>
        `https://open.spotify.com/search/${encodeURIComponent(query)}`,
    },
    {
      keys: ['gmail', 'google mail'],
      name: 'Gmail',
      baseUrl: 'https://mail.google.com',
      searchTemplate: (query) =>
        `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`,
    },
    {
      keys: ['google drive', 'drive'],
      name: 'Google Drive',
      baseUrl: 'https://drive.google.com',
      searchTemplate: (query) =>
        `https://drive.google.com/drive/search?q=${encodeURIComponent(query)}`,
    },
    {
      keys: ['google docs', 'docs'],
      name: 'Google Docs',
      baseUrl: 'https://docs.google.com',
    },
    {
      keys: ['google sheets', 'sheets'],
      name: 'Google Sheets',
      baseUrl: 'https://sheets.google.com',
    },
    {
      keys: ['google meet', 'meet'],
      name: 'Google Meet',
      baseUrl: 'https://meet.google.com',
    },
    {
      keys: ['google calendar', 'calendar'],
      name: 'Google Calendar',
      baseUrl: 'https://calendar.google.com',
    },
    {
      keys: ['google maps', 'maps'],
      name: 'Google Maps',
      baseUrl: 'https://maps.google.com',
      searchTemplate: (query) =>
        `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
    },
    {
      keys: ['wikipedia', 'wiki'],
      name: 'Wikipedia',
      baseUrl: 'https://en.wikipedia.org',
      searchTemplate: (query) =>
        `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
    },
    {
      keys: ['reddit'],
      name: 'Reddit',
      baseUrl: 'https://www.reddit.com',
      searchTemplate: (query) =>
        `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`,
    },
    {
      keys: ['netflix'],
      name: 'Netflix',
      baseUrl: 'https://www.netflix.com',
      searchTemplate: (query) =>
        `https://www.netflix.com/search?q=${encodeURIComponent(query)}`,
    },
    {
      keys: ['notion'],
      name: 'Notion',
      baseUrl: 'https://www.notion.so',
    },
    {
      keys: ['discord'],
      name: 'Discord',
      baseUrl: 'https://discord.com/app',
    },
    {
      keys: ['twitch'],
      name: 'Twitch',
      baseUrl: 'https://www.twitch.tv',
      searchTemplate: (query) =>
        `https://www.twitch.tv/search?term=${encodeURIComponent(query)}`,
    },
    {
      keys: ['twitter', 'x.com'],
      name: 'X',
      baseUrl: 'https://x.com',
      searchTemplate: (query) =>
        `https://x.com/search?q=${encodeURIComponent(query)}`,
    },
    {
      keys: ['linkedin'],
      name: 'LinkedIn',
      baseUrl: 'https://www.linkedin.com',
    },
    {
      keys: ['instagram', 'insta'],
      name: 'Instagram',
      baseUrl: 'https://www.instagram.com',
    },
    {
      keys: ['facebook', 'fb'],
      name: 'Facebook',
      baseUrl: 'https://www.facebook.com',
    },
    {
      keys: ['whatsapp', 'whats app'],
      name: 'WhatsApp Web',
      baseUrl: 'https://web.whatsapp.com',
    },
    {
      keys: ['amazon'],
      name: 'Amazon',
      baseUrl: 'https://www.amazon.com',
      searchTemplate: (query) =>
        `https://www.amazon.com/s?k=${encodeURIComponent(query)}`,
    },
    {
      keys: ['chatgpt'],
      name: 'ChatGPT',
      baseUrl: 'https://chatgpt.com',
    },
    {
      keys: ['claude'],
      name: 'Claude',
      baseUrl: 'https://claude.ai',
    },
    {
      keys: ['stack overflow', 'stackoverflow'],
      name: 'Stack Overflow',
      baseUrl: 'https://stackoverflow.com',
      searchTemplate: (query) =>
        `https://stackoverflow.com/search?q=${encodeURIComponent(query)}`,
    },
    {
      keys: ['zoom'],
      name: 'Zoom',
      baseUrl: 'https://zoom.us',
    },
    {
      keys: ['minecraft'],
      name: 'Minecraft',
      baseUrl: 'https://www.minecraft.net',
    },
  ];

  for (const appEntry of knownApps) {
    if (
      appEntry.keys.some(
        (k) =>
          lower === k ||
          new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower)
      )
    ) {
      return {
        name: appEntry.name,
        url: q && appEntry.searchTemplate ? appEntry.searchTemplate(q) : appEntry.baseUrl,
        searchQuery: q || undefined,
      };
    }
  }

  if (/^https?:\/\//i.test(cleaned)) {
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return { name: parsed.hostname, url: parsed.toString(), searchQuery: q || undefined };
      }
    } catch {
      // fall through
    }
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleaned)) {
    return {
      name: cleaned,
      url: `https://${cleaned}`,
      searchQuery: q || undefined,
    };
  }

  const fallbackQuery = q ? `${cleaned} ${q}` : cleaned;
  return {
    name: cleaned || 'Web Search',
    url: `https://www.google.com/search?q=${encodeURIComponent(fallbackQuery)}`,
    searchQuery: fallbackQuery,
  };
}

export function formatScheduledTimeLabel(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `today at ${timeStr}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
  if (isTomorrow) return `tomorrow at ${timeStr}`;
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function parseClockTimeToDate(
  hourRaw: number,
  minuteRaw: number,
  meridiemRaw: string | undefined,
  forceTomorrow: boolean,
  now = new Date()
): Date {
  let hour = hourRaw;
  const minute = Math.max(0, Math.min(59, minuteRaw || 0));
  const mer = (meridiemRaw || '').toLowerCase().replace(/\./g, '');

  if (mer === 'pm' && hour < 12) hour += 12;
  if (mer === 'am' && hour === 12) hour = 0;

  // If 12-hour wasn't specified and hour <= 12 without "0" prefix, keep 24h semantics or next matching hour
  hour = Math.max(0, Math.min(23, hour));

  const target = new Date(now);
  target.setSeconds(0, 0);
  target.setHours(hour, minute, 0, 0);

  if (forceTomorrow) {
    target.setDate(target.getDate() + 1);
  } else if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

export function parseNaturalTimeExpression(
  text: string,
  now = new Date()
): {
  triggerAt: Date;
  durationSeconds?: number;
  recurrence: 'once' | 'daily';
  cleanedLabel: string;
} | null {
  const lower = text.toLowerCase();
  const isDaily = /\b(?:every\s+day|daily)\b/i.test(lower);
  const isTomorrow = /\b(?:tomorrow|kal|kalkey|agamikal)\b/i.test(lower);

  // 1. Relative durations: "after 2 minutes", "in 10 seconds", "for 5 min", "2-minute", "2 minute pore"
  const relRegex =
    /(?:(?:after|in|for|wait)\s+)?(\d+(?:\.\d+)?)[-\s]*(hours?|hrs?|hr|minutes?|mins?|min|seconds?|secs?|sec|ghonta|minit)(?:\s*(?:and|,)?\s*(\d+)[-\s]*(minutes?|mins?|min|seconds?|secs?|sec))?(?:\s*(?:por|pore|from\s+now|later))?/i;
  const hasRelativeCue =
    /\b(?:after|in|for|timer|remind|por|pore|from\s+now|later)\b/i.test(lower) ||
    /\b\d+[-\s]*(?:sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours)\b/i.test(lower);

  const relMatch = hasRelativeCue ? text.match(relRegex) : null;
  if (relMatch) {
    const firstVal = parseFloat(relMatch[1]);
    const firstUnit = relMatch[2].toLowerCase();
    let totalSeconds = 0;
    if (firstUnit.startsWith('h') || firstUnit.startsWith('g')) {
      totalSeconds += Math.round(firstVal * 3600);
    } else if (firstUnit.startsWith('m')) {
      totalSeconds += Math.round(firstVal * 60);
    } else {
      totalSeconds += Math.round(firstVal);
    }

    if (relMatch[3] && relMatch[4]) {
      const secVal = parseInt(relMatch[3], 10);
      const secUnit = relMatch[4].toLowerCase();
      if (secUnit.startsWith('m')) totalSeconds += secVal * 60;
      else totalSeconds += secVal;
    }

    if (totalSeconds >= 1) {
      const triggerAt = new Date(now.getTime() + totalSeconds * 1000);
      const remainder = text
        .replace(relMatch[0], ' ')
        .replace(/\b(?:please|to|about|that|my|a|an|the|set|create)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        triggerAt,
        durationSeconds: totalSeconds,
        recurrence: isDaily ? 'daily' : 'once',
        cleanedLabel: remainder,
      };
    }
  }

  // 2. Clock time: "7 AM", "7:30 pm", "at 19:00", "for 6:15am"
  const clockMatch = text.match(
    /(?:(?:for|at)\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?:\b)/i
  );
  if (clockMatch && (clockMatch[3] || clockMatch[2] || /\b(?:alarm|at|for)\b/i.test(lower))) {
    const h = parseInt(clockMatch[1], 10);
    const m = clockMatch[2] ? parseInt(clockMatch[2], 10) : 0;
    const mer = clockMatch[3];
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59 && (mer || clockMatch[2] || /\balarm\b/i.test(lower))) {
      const triggerAt = parseClockTimeToDate(h, m, mer, isTomorrow, now);
      const remainder = text
        .replace(clockMatch[0], ' ')
        .replace(/\b(?:tomorrow|today|every\s+day|daily|to|about|for|at)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        triggerAt,
        recurrence: isDaily ? 'daily' : 'once',
        cleanedLabel: remainder,
      };
    }
  }

  // 3. "Tomorrow to call someone" (no explicit clock hour -> 9:00 AM tomorrow)
  if (isTomorrow) {
    const triggerAt = parseClockTimeToDate(9, 0, 'am', true, now);
    const remainder = text
      .replace(/\b(?:tomorrow|kal|kalkey|agamikal|to|for|about)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      triggerAt,
      recurrence: isDaily ? 'daily' : 'once',
      cleanedLabel: remainder,
    };
  }

  return null;
}

const DESKTOP_APPS: Array<{ pattern: RegExp; appName: string; label: string }> = [
  { pattern: /\b(?:vs\s*code|visual\s+studio\s+code|vscode)\b/i, appName: 'vscode', label: 'VS Code' },
  { pattern: /\b(?:google\s+chrome|chrome\s+browser|chrome)\b/i, appName: 'chrome', label: 'Chrome' },
  { pattern: /\b(?:microsoft\s+edge|edge)\b/i, appName: 'edge', label: 'Edge' },
  { pattern: /\b(?:firefox)\b/i, appName: 'firefox', label: 'Firefox' },
  { pattern: /\b(?:terminal|command\s+prompt|cmd|powershell)\b/i, appName: 'terminal', label: 'Terminal' },
  { pattern: /\b(?:notepad|notes\s+app|notes)\b/i, appName: 'notes', label: 'Notes' },
  { pattern: /\b(?:calculator|calc)\b/i, appName: 'calculator', label: 'Calculator' },
  { pattern: /\b(?:file\s+explorer|explorer|finder)\b/i, appName: 'explorer', label: 'File Explorer' },
  { pattern: /\b(?:slack(?:\s+app)?)\b/i, appName: 'slack', label: 'Slack' },
  { pattern: /\b(?:discord(?:\s+app)?)\b/i, appName: 'discord', label: 'Discord' },
  { pattern: /\b(?:spotify(?:\s+app)?)\b/i, appName: 'spotify', label: 'Spotify' },
  { pattern: /\b(?:vlc)\b/i, appName: 'vlc', label: 'VLC' },
  { pattern: /\b(?:steam)\b/i, appName: 'steam', label: 'Steam' },
  { pattern: /\b(?:obs(?:\s+studio)?)\b/i, appName: 'obs', label: 'OBS Studio' },
  { pattern: /\b(?:blender)\b/i, appName: 'blender', label: 'Blender' },
  { pattern: /\b(?:telegram)\b/i, appName: 'telegram', label: 'Telegram' },
  { pattern: /\b(?:whatsapp(?:\s+desktop)?)\b/i, appName: 'whatsapp', label: 'WhatsApp' },
  { pattern: /\b(?:brave(?:\s+browser)?)\b/i, appName: 'brave', label: 'Brave' },
  { pattern: /\b(?:microsoft\s+word|ms\s+word)\b/i, appName: 'word', label: 'Microsoft Word' },
  { pattern: /\b(?:microsoft\s+excel|ms\s+excel)\b/i, appName: 'excel', label: 'Microsoft Excel' },
  { pattern: /\b(?:task\s+manager)\b/i, appName: 'taskmgr', label: 'Task Manager' },
  { pattern: /\b(?:windows\s+settings|pc\s+settings)\b/i, appName: 'settings', label: 'Windows Settings' },
];

export function parseLocalCommand(rawText: string, now = new Date()): ParsedLocalCommand | null {
  if (isStopSpeakingCommand(rawText)) {
    return { type: 'stop_speaking' };
  }

  const cleaned = stripWakePrefix(rawText);
  if (!cleaned) return null;

  // 1. Snooze / Cancel / List schedules
  const snoozeMatch = cleaned.match(
    /^(?:please\s+)?snooze(?:\s+(?:the\s+|my\s+)?(?:alarm|reminder|timer))?(?:\s+(?:for\s+)?(\d+)\s*(?:minutes?|mins?|min))?(?:\s+(?:for|called)\s+(.+))?[.!?]*$/i
  );
  if (snoozeMatch) {
    const mins = snoozeMatch[1] ? Math.max(1, Math.min(120, parseInt(snoozeMatch[1], 10))) : 5;
    return {
      type: 'snooze_schedule',
      minutes: mins,
      query: snoozeMatch[2]?.trim(),
    };
  }

  const listSchedMatch = cleaned.match(
    /^(?:please\s+)?(?:list|show|what\s+are|check|get)\s+(?:all\s+|my\s+|active\s+|pending\s+|upcoming\s+)?(alarms?|reminders?|timers?|schedules?)[.!?]*$/i
  );
  if (listSchedMatch) {
    const noun = listSchedMatch[1].toLowerCase();
    const kind = noun.startsWith('alarm')
      ? 'alarm'
      : noun.startsWith('reminder')
      ? 'reminder'
      : noun.startsWith('timer')
      ? 'timer'
      : undefined;
    return { type: 'list_schedules', kind };
  }

  const cancelSchedMatch = cleaned.match(
    /^(?:please\s+)?(?:cancel|delete|remove|stop|clear|turn\s+off)\s+(?:all\s+|my\s+|the\s+|next\s+)?(alarm|alarms|reminder|reminders|timer|timers)(?:\s+(?:for|called|named)?\s*(.+))?[.!?]*$/i
  );
  if (cancelSchedMatch) {
    const noun = cancelSchedMatch[1].toLowerCase();
    const kind = noun.startsWith('alarm')
      ? 'alarm'
      : noun.startsWith('reminder')
      ? 'reminder'
      : 'timer';
    return {
      type: 'cancel_schedule',
      kind,
      query: cancelSchedMatch[2]?.trim(),
    };
  }

  // 1b. Local Task Management (Gemini-independent)
  const listTaskMatch = cleaned.match(
    /^(?:please\s+)?(?:(?:what\s+are|list|show|get|check|view|amar|dekhao)\s+(?:all\s+|my\s+|active\s+|pending\s+|open\s+|completed\s+)?tasks?(?:\s+list)?|tasks?(?:\s+(?:ki|list|koyta))?|amar\s+task(?:\s+ki)?)[.!?]*$/i
  );
  if (listTaskMatch) {
    const filter = /\bcompleted\b/i.test(cleaned)
      ? 'completed'
      : /\ball\b/i.test(cleaned)
      ? 'all'
      : 'pending';
    return { type: 'list_tasks', filter };
  }

  const addTaskMatch = cleaned.match(
    /^(?:please\s+)?(?:add|create|new|make)\s+(?:a\s+)?(?:new\s+)?task(?:\s+(?:called|named|to|for))?\s+(.+?)[.!?]*$/i
  );
  if (addTaskMatch && addTaskMatch[1].trim().length >= 2) {
    return {
      type: 'add_task',
      title: addTaskMatch[1].trim(),
      priority: /\b(?:urgent|high|asap|important)\b/i.test(cleaned) ? 'high' : 'medium',
    };
  }

  const completeTaskMatch = cleaned.match(
    /^(?:please\s+)?(?:complete|finish|mark\s+done|done|check\s+off)\s+(?:the\s+|my\s+)?task\s+(.+?)[.!?]*$/i
  );
  if (completeTaskMatch && completeTaskMatch[1].trim().length >= 2) {
    return {
      type: 'complete_task',
      query: completeTaskMatch[1].trim(),
    };
  }

  // 2. Create Alarm / Reminder / Timer (English + Banglish)
  const isAlarmCmd =
    /^(?:please\s+)?(?:set|create|add|wake\s+me\s+up)\s+(?:an?\s+)?alarm\b/i.test(cleaned) ||
    /\b(?:set\s+(?:an?\s+)?alarm|alarm\s+(?:dao|set\s+koro|lagao))\b/i.test(cleaned);
  const isTimerCmd =
    /^(?:please\s+)?(?:set|start|create)\s+(?:a\s+)?timer\b/i.test(cleaned) ||
    /\b(?:set\s+(?:a\s+)?timer|timer\s+(?:dao|set\s+koro|chalu\s+koro))\b/i.test(cleaned) ||
    /\b\d+(?:\.\d+)?[-\s]*(?:min(?:ute)?s?|sec(?:ond)?s?|hours?|hr)\s+(?:er\s+)?timer\b/i.test(cleaned) ||
    /^(?:please\s+)?(?:set|start|create)\b.*\btimer\b/i.test(cleaned);
  const isReminderCmd =
    /^(?:please\s+)?(?:remind\s+me|set\s+(?:a\s+)?reminder|create\s+(?:a\s+)?reminder)\b/i.test(
      cleaned
    ) ||
    /\b(?:remind\s+(?:koro|me)|reminder\s+(?:dao|set\s+koro))\b/i.test(cleaned);

  if (isAlarmCmd || isTimerCmd || isReminderCmd) {
    const strippedIntent = cleaned
      .replace(
        /^(?:please\s+)?(?:set|create|add|start|wake\s+me\s+up)\s+(?:an?\s+|a\s+)?(?:alarm|timer|reminder)?(?:\s+(?:for|at|to))?\s*/i,
        ''
      )
      .replace(/^(?:please\s+)?remind\s+me\s*/i, '')
      .replace(/\b(?:alarm|timer|reminder)\s*(?:dao|set\s+koro|chalu\s+koro|lagao)?\b/gi, '')
      .replace(/\b(?:remind\s+koro|mone\s+korai\s+dio)\b/gi, '')
      .trim();

    const parsedTime = parseNaturalTimeExpression(strippedIntent || cleaned, now);
    if (parsedTime) {
      const kind: 'alarm' | 'reminder' | 'timer' = isAlarmCmd
        ? 'alarm'
        : isTimerCmd
        ? 'timer'
        : 'reminder';
      const defaultTitle =
        kind === 'alarm'
          ? 'Alarm'
          : kind === 'timer'
          ? 'Countdown Timer'
          : 'Personal Reminder';
      const title =
        parsedTime.cleanedLabel && parsedTime.cleanedLabel.length >= 2
          ? parsedTime.cleanedLabel.charAt(0).toUpperCase() + parsedTime.cleanedLabel.slice(1)
          : defaultTitle;
      const timeLabel = formatScheduledTimeLabel(parsedTime.triggerAt.toISOString());

      return {
        type: 'create_schedule',
        kind,
        title,
        triggerAtIso: parsedTime.triggerAt.toISOString(),
        durationSeconds: parsedTime.durationSeconds,
        recurrence: parsedTime.recurrence,
        spokenConfirmation:
          kind === 'timer' && parsedTime.durationSeconds
            ? `Started ${title} for ${
                parsedTime.durationSeconds >= 60
                  ? `${Math.round(parsedTime.durationSeconds / 60)} minute${
                      Math.round(parsedTime.durationSeconds / 60) === 1 ? '' : 's'
                    }`
                  : `${parsedTime.durationSeconds} seconds`
              }.`
            : `Scheduled ${kind} "${title}" for ${timeLabel}.`,
      };
    }
  }

  // 3. Sleep / Wake / Care Mode & Workspace Environment controls
  if (/^(?:go\s+to\s+sleep|sleep\s+mode(?:\s+on)?|ghuma[o]?|rest\s+now)[.!?]*$/i.test(cleaned)) {
    return { type: 'mode_command', mode: 'sleep' };
  }
  if (/^(?:wake\s+up|exit\s+sleep|active\s+mode)[.!?]*$/i.test(cleaned)) {
    return { type: 'mode_command', mode: 'wake' };
  }
  if (/^(?:turn\s+on\s+)?(?:care\s+mode|wellbeing\s+mode|take\s+a\s+break)$|\b(?:i\s+feel\s+(?:stressed|overwhelmed|anxious|exhausted|sad|lonely)|feeling\s+(?:stressed|down|overwhelmed))\b/i.test(cleaned)) {
    return { type: 'mode_command', mode: 'care' };
  }

  // 3b. Desktop Awareness & Smart Incoming Call commands
  if (/^(?:i'?m\s+busy|i\s+am\s+busy|ami\s+byasto|turn\s+on\s+busy\s+mode|enable\s+busy\s+mode|busy\s+mode\s+on)[.!?]*$/i.test(cleaned)) {
    return { type: 'call_command', action: 'busy_on' };
  }
  if (/^(?:i'?m\s+not\s+busy|turn\s+off\s+busy\s+mode|disable\s+busy\s+mode|busy\s+mode\s+off|available\s+now)[.!?]*$/i.test(cleaned)) {
    return { type: 'call_command', action: 'busy_off' };
  }
  if (/^(?:answer(?:\s+this)?\s+call|pick\s+up(?:\s+the\s+call)?|call\s+receive\s+koro|accept\s+call)[.!?]*$/i.test(cleaned)) {
    return { type: 'call_command', action: 'answer_call' };
  }
  if (/^(?:don'?t\s+answer|decline(?:\s+this)?\s+call|reject(?:\s+the)?\s+call|call\s+kato|cut\s+the\s+call)[.!?]*$/i.test(cleaned)) {
    return { type: 'call_command', action: 'decline_call' };
  }
  if (/^(?:tell\s+me\s+who'?s\s+calling|who\s+is\s+calling|ke\s+call\s+korche|caller\s+info)[.!?]*$/i.test(cleaned)) {
    return { type: 'call_command', action: 'who_calling' };
  }
  if (/^(?:silence\s+notifications?|mute\s+notifications?|notifications?\s+bondho\s+koro)[.!?]*$/i.test(cleaned)) {
    return { type: 'call_command', action: 'silence_notifications' };
  }
  if (/^(?:turn\s+on|enable)\s+(?:do\s+not\s+disturb|dnd)[.!?]*$/i.test(cleaned)) {
    return { type: 'call_command', action: 'dnd_on' };
  }
  if (/^(?:turn\s+off|disable)\s+(?:do\s+not\s+disturb|dnd)[.!?]*$/i.test(cleaned)) {
    return { type: 'call_command', action: 'dnd_off' };
  }

  // 3b-bis. Studio Hub Switching, Outgoing Call, Clipboard & Skills Voice Commands
  const studioMatch = cleaned.match(
    /^(?:please\s+)?(?:open|show|switch\s+to|go\s+to|dekhao|kholo)\s+(?:the\s+)?(3d\s+studio|2d\s+studio|1d\s+studio|creation\s+studio|dev(?:elopment)?\s+studio|bug\s*fixer|skills?\s+(?:library|studio)|multi[- ]?agent(?:\s+activity)?|agent\s+activity|personal\s+hub|calling\s+hub|gmail|calendar|contacts|security\s+(?:&|and)?\s*audit|system\s+awareness)[.!?]*$/i
  );
  if (studioMatch) {
    const key = studioMatch[1].toLowerCase();
    if (/3d/.test(key)) return { type: 'studio_switch', studio: 'creative', subTab: '3d' };
    if (/2d/.test(key)) return { type: 'studio_switch', studio: 'creative', subTab: '2d' };
    if (/1d/.test(key)) return { type: 'studio_switch', studio: 'creative', subTab: '1d' };
    if (/creation/.test(key)) return { type: 'studio_switch', studio: 'creative' };
    if (/bug/.test(key)) return { type: 'studio_switch', studio: 'dev', subTab: 'bugfix' };
    if (/dev/.test(key)) return { type: 'studio_switch', studio: 'dev', subTab: 'dev' };
    if (/agent/.test(key)) return { type: 'studio_switch', studio: 'skills', subTab: 'agents' };
    if (/skill/.test(key)) return { type: 'studio_switch', studio: 'skills', subTab: 'skills' };
    if (/call/.test(key)) return { type: 'studio_switch', studio: 'personal', subTab: 'calls' };
    if (/personal|gmail|calendar|contact/.test(key)) {
      return { type: 'studio_switch', studio: 'personal', subTab: 'workspace' };
    }
    if (/security|audit|awareness/.test(key)) {
      return { type: 'studio_switch', studio: 'system' };
    }
  }

  const outgoingCallMatch = cleaned.match(
    /^(?:please\s+)?(?:call|phone|dial|ring)\s+(.+?)[.!?]*$|^(?:please\s+)?(.+?)\s+(?:ke|re)\s+(?:call|phone)\s+(?:koro|dao)[.!?]*$/i
  );
  if (outgoingCallMatch && !/\b(?:back|that|it|support|emergency)\b/i.test(cleaned)) {
    const target = (outgoingCallMatch[1] || outgoingCallMatch[2] || '').trim();
    if (target.length >= 2) {
      return { type: 'outgoing_call', contactQuery: target };
    }
  }

  if (/^(?:read\s+(?:my\s+)?clipboard|what(?:'s|\s+is)\s+in\s+(?:my\s+)?clipboard|clipboard\s+poro)[.!?]*$/i.test(cleaned)) {
    return { type: 'clipboard_command', action: 'read' };
  }
  const copyClipMatch = cleaned.match(/^(?:copy\s+to\s+clipboard|clipboard\s+e\s+copy\s+koro)[:\s]+(.+)$/i);
  if (copyClipMatch && copyClipMatch[1].trim()) {
    return { type: 'clipboard_command', action: 'write', text: copyClipMatch[1].trim() };
  }

  if (/^(?:list|show|amar)\s+(?:my\s+)?skills(?:\s+library|\s+dekhao)?[.!?]*$/i.test(cleaned)) {
    return { type: 'skill_command', action: 'list' };
  }
  const runSkillMatch = cleaned.match(/^(?:please\s+)?run\s+skill\s+(.+?)[.!?]*$/i);
  if (runSkillMatch && runSkillMatch[1].trim().length >= 2) {
    return { type: 'skill_command', action: 'run', query: runSkillMatch[1].trim() };
  }

  // 3c. Proactive Internet Monitoring commands
  if (/^(?:what\s+are\s+you\s+monitoring|list\s+(?:my\s+)?monitors?|show\s+monitoring|monitoring\s+status|ki\s+ki\s+monitor\s+korcho)[.!?]*$/i.test(cleaned)) {
    return { type: 'monitor_command', action: 'list' };
  }
  if (/^(?:tell\s+me\s+what\s+updates\s+you\s+found\s+today|what\s+updates\s+(?:were\s+found|did\s+you\s+find)(?:\s+today)?|today'?s\s+updates|ajker\s+update\s+ki)[.!?]*$/i.test(cleaned)) {
    return { type: 'monitor_command', action: 'updates_today' };
  }
  if (/^(?:pause|stop)\s+(?:all\s+)?(?:monitoring|monitors|updates?|alerts?)[.!?]*$/i.test(cleaned)) {
    return { type: 'monitor_command', action: 'pause_all' };
  }
  if (/^(?:resume|start)\s+(?:all\s+)?(?:monitoring|monitors|updates?|alerts?)(?:\s+again)?[.!?]*$/i.test(cleaned)) {
    return { type: 'monitor_command', action: 'resume_all' };
  }
  if (/^(?:only\s+notify\s+me\s+about\s+official\s+announcements|official\s+(?:updates|announcements)\s+only)[.!?]*$/i.test(cleaned)) {
    return { type: 'monitor_command', action: 'official_only', officialOnly: true };
  }
  const stopMonitorMatch = cleaned.match(
    /^(?:please\s+)?(?:stop|remove|delete|cancel)\s+monitoring\s+(.+?)[.!?]*$/i
  );
  if (stopMonitorMatch && stopMonitorMatch[1].trim().length >= 2) {
    return {
      type: 'monitor_command',
      action: 'stop',
      topic: stopMonitorMatch[1].trim(),
    };
  }
  const addMonitorMatch = cleaned.match(
    /^(?:please\s+)?(?:monitor|watch\s+for|watch|keep\s+track\s+of|track|follow)\s+(.+?)(?:\s+and\s+tell\s+me\s+if\s+anything\s+new\s+happens)?[.!?]*$/i
  );
  if (addMonitorMatch && addMonitorMatch[1].trim().length >= 2) {
    const rawTopic = addMonitorMatch[1]
      .replace(/^(?:new\s+)?(?:updates?|news)\s+(?:for|about|on)\s+/i, '')
      .trim();
    return {
      type: 'monitor_command',
      action: 'add',
      topic: rawTopic,
      officialOnly: /\bofficial\b/i.test(cleaned),
    };
  }
  const conditionalMonitorMatch = cleaned.match(
    /^(?:tell\s+me\s+when|notify\s+me\s+(?:when|if))\s+(.+?)[.!?]*$/i
  );
  if (conditionalMonitorMatch && conditionalMonitorMatch[1].trim().length >= 4) {
    return {
      type: 'monitor_command',
      action: 'add',
      topic: conditionalMonitorMatch[1].trim(),
      officialOnly: true,
    };
  }

  // 3c-bis. Universal Intelligence: Time, Weather, News, Maps, Knowledge Vault, Home Assistant
  if (
    /^(?:what(?:'s|\s+is)\s+the\s+(?:current\s+)?(?:time|date)(?:\s+today)?|what\s+time\s+is\s+it|tell\s+me\s+the\s+(?:time|date)|what\s+day\s+is\s+(?:it|today)|ekhon\s+koyta\s+baje|koyta\s+baje|ajke\s+ki\s+bar|tarikh\s+koto)[.!?]*$/i.test(
      cleaned
    )
  ) {
    return { type: 'time_query' };
  }

  const weatherMatch = cleaned.match(
    /^(?:(?:what(?:'s|\s+is)\s+the\s+|how(?:'s|\s+is)\s+the\s+|check\s+|tell\s+me\s+(?:the\s+)?|show\s+)?weather(?:\s+(?:forecast|today|report|update))?(?:\s+(?:in|at|for)\s+(.+?))?|(?:ajker\s+)?abohawa(?:\s+kemon)?(?:\s+(?:in|er)\s+(.+?))?)[.!?]*$/i
  );
  if (weatherMatch) {
    const loc = (weatherMatch[1] || weatherMatch[2] || '').trim();
    return { type: 'weather_briefing', location: loc || undefined };
  }

  const newsMatch = cleaned.match(
    /^(?:(?:what(?:'s|\s+is)\s+the\s+|give\s+me\s+|show\s+|tell\s+me\s+|check\s+)?(?:latest|today'?s|breaking|current)\s+(?:news|headlines)(?:\s+(?:about|on|for|in)\s+(.+?))?|(?:news|headlines)\s+(?:about|on|for)\s+(.+?)|ajker\s+(?:khobor|news)(?:\s+(?:ki|about)\s*(.+?))?)[.!?]*$/i
  );
  if (newsMatch) {
    const topic = (newsMatch[1] || newsMatch[2] || newsMatch[3] || '').trim();
    return { type: 'news_briefing', topic: topic || undefined };
  }

  const routeMatch = cleaned.match(
    /^(?:(?:give\s+me\s+|find\s+|show\s+|get\s+)?(?:directions|route|way|distance|navigate|travel\s+time)(?:\s+(?:to|from))?\s+(.+?)\s+(?:to|->)\s+(.+?)|(?:how\s+(?:far|long)\s+(?:is\s+it|to\s+get)\s+)?from\s+(.+?)\s+to\s+(.+?))[.!?]*$/i
  );
  if (routeMatch) {
    const origin = (routeMatch[1] || routeMatch[3] || '').replace(/^from\s+/i, '').trim();
    const destination = (routeMatch[2] || routeMatch[4] || '').trim();
    if (origin && destination) {
      const travelMode: 'DRIVE' | 'WALK' | 'TRANSIT' | 'TWO_WHEELER' = /\bwalk/i.test(cleaned)
        ? 'WALK'
        : /\b(?:bus|train|metro|transit)\b/i.test(cleaned)
        ? 'TRANSIT'
        : /\b(?:bike|motorcycle|two\s*wheeler)\b/i.test(cleaned)
        ? 'TWO_WHEELER'
        : 'DRIVE';
      return {
        type: 'maps_query',
        mode: 'directions',
        query: `${origin} to ${destination}`,
        origin,
        destination,
        travelMode,
      };
    }
  }

  const mapsPlacesMatch = cleaned.match(
    /^(?:(?:find|search|show|locate)\s+(?:the\s+)?(?:best\s+|nearest\s+|nearby\s+)?(.+?)\s+(?:near\s+(?:me|.+?)|on\s+(?:google\s+)?maps)|(?:nearest|nearby)\s+(.+?)|directions\s+to\s+(.+?))[.!?]*$/i
  );
  if (mapsPlacesMatch) {
    if (mapsPlacesMatch[3]) {
      return {
        type: 'maps_query',
        mode: 'directions',
        query: mapsPlacesMatch[3].trim(),
        origin: 'Dhaka',
        destination: mapsPlacesMatch[3].trim(),
        travelMode: 'DRIVE',
      };
    }
    const q = (mapsPlacesMatch[1] || mapsPlacesMatch[2] || cleaned).trim();
    if (q.length >= 2) {
      return { type: 'maps_query', mode: 'places', query: q };
    }
  }

  const ragMatch = cleaned.match(
    /^(?:search\s+(?:my\s+)?(?:documents?|docs?|knowledge\s+(?:vault|base)|uploaded\s+files?)\s+(?:for\s+)?(.+?)|(?:according\s+to|from|in)\s+(?:my\s+)?(?:documents?|docs?|notes?|knowledge\s+vault)[,:]?\s*(.+?))[.!?]*$/i
  );
  if (ragMatch) {
    const q = (ragMatch[1] || ragMatch[2] || '').trim();
    if (q.length >= 2) {
      return { type: 'knowledge_query', query: q };
    }
  }

  // Home Assistant explicit device commands (exclude focus mode & workspace generic lights percentage already handled if needed)
  if (/^(?:smart\s+home\s+status|list\s+(?:smart\s+home|home\s+assistant)\s+devices?|home\s+assistant\s+status)[.!?]*$/i.test(cleaned)) {
    return { type: 'home_assistant', action: 'list' };
  }
  const haPowerMatch = cleaned.match(
    /^(?:please\s+)?turn\s+(on|off)\s+(?:the\s+)?(.+?\s+(?:light|lights|lamp|fan|ac|air\s+conditioner|switch|plug|heater|tv|outlet|curtain|blinds))[.!?]*$/i
  );
  if (haPowerMatch) {
    return {
      type: 'home_assistant',
      action: haPowerMatch[1].toLowerCase() === 'on' ? 'turn_on' : 'turn_off',
      entityHint: haPowerMatch[2].trim(),
    };
  }
  const haTempMatch = cleaned.match(
    /^(?:please\s+)?set\s+(?:the\s+)?(.+?\s+(?:ac|air\s+conditioner|thermostat|climate))\s+to\s+(\d{1,2})\s*(?:degrees?|c)?[.!?]*$/i
  );
  if (haTempMatch) {
    return {
      type: 'home_assistant',
      action: 'set_temperature',
      entityHint: haTempMatch[1].trim(),
      value: Math.max(16, Math.min(30, parseInt(haTempMatch[2], 10))),
    };
  }

  // 3c-ter. Expanded Local PC / Windows Companion Controls (Mouse, Keyboard, Windows, Vision OCR, Files)
  if (/^(?:list|show|detect|find)\s+(?:all\s+)?installed\s+apps?(?:\s+on\s+(?:my\s+)?pc)?[.!?]*$/i.test(cleaned)) {
    return {
      type: 'computer_action',
      action: 'companion_list_apps',
      target: 'installed_apps',
      label: 'Discover Installed PC Apps',
      requiresConfirmation: false,
    };
  }
  if (/^(?:what\s+(?:apps?|windows?)\s+are\s+(?:open|running)|list\s+(?:open|running)\s+windows?|show\s+running\s+apps?)[.!?]*$/i.test(cleaned)) {
    return {
      type: 'computer_action',
      action: 'companion_list_windows',
      target: 'windows',
      label: 'Inspect Open Windows',
      requiresConfirmation: false,
    };
  }
  const winCtrlMatch = cleaned.match(
    /^(?:please\s+)?(minimize|maximize|restore|focus|switch\s+to)\s+(?:the\s+)?(?:window\s+)?(.+?)[.!?]*$/i
  );
  if (winCtrlMatch && !/\bfocus\s+mode\b/i.test(cleaned)) {
    const rawSub = winCtrlMatch[1].toLowerCase().startsWith('switch') ? 'focus' : winCtrlMatch[1].toLowerCase();
    return {
      type: 'computer_action',
      action: 'companion_window_control',
      subAction: rawSub,
      target: winCtrlMatch[2].trim(),
      label: `${rawSub.charAt(0).toUpperCase() + rawSub.slice(1)} "${winCtrlMatch[2].trim()}"`,
      requiresConfirmation: false,
    };
  }
  if (/^(?:what(?:'s|\s+is)\s+on\s+(?:my\s+)?screen|read\s+(?:my\s+)?screen|scan\s+screen|screen\s+vision|ocr\s+screen)[.!?]*$/i.test(cleaned)) {
    return {
      type: 'computer_action',
      action: 'companion_screen_ocr',
      target: 'screen',
      label: 'Capture & Analyze Screen Vision (OCR)',
      requiresConfirmation: true,
    };
  }
  const clickCoordMatch = cleaned.match(
    /^(?:please\s+)?(?:left\s+click|right\s+click|double\s+click|click)\s+(?:at\s+)?(\d{1,4})\s*[,x\s]\s*(\d{1,4})[.!?]*$/i
  );
  if (clickCoordMatch) {
    const btn = /^right/i.test(cleaned) ? 'right_click' : /^double/i.test(cleaned) ? 'double_click' : 'left_click';
    const x = parseInt(clickCoordMatch[1], 10);
    const y = parseInt(clickCoordMatch[2], 10);
    return {
      type: 'computer_action',
      action: 'companion_mouse_action',
      subAction: btn,
      target: `${x},${y}`,
      x,
      y,
      label: `${btn.replace('_', ' ')} at (${x}, ${y})`,
      requiresConfirmation: true,
    };
  }
  if (/^(?:left\s+click|right\s+click|double\s+click)[.!?]*$/i.test(cleaned)) {
    const btn = /^right/i.test(cleaned) ? 'right_click' : /^double/i.test(cleaned) ? 'double_click' : 'left_click';
    return {
      type: 'computer_action',
      action: 'companion_mouse_action',
      subAction: btn,
      target: 'cursor',
      label: btn.replace('_', ' '),
      requiresConfirmation: true,
    };
  }
  const typeTextMatch = cleaned.match(/^(?:please\s+)?type\s+["']?(.+?)["']?[.!?]*$/i);
  if (typeTextMatch && typeTextMatch[1].trim().length >= 1) {
    return {
      type: 'computer_action',
      action: 'companion_keyboard_action',
      subAction: 'type',
      target: 'keyboard',
      value: typeTextMatch[1].trim(),
      label: `Type "${typeTextMatch[1].trim().slice(0, 32)}"`,
      requiresConfirmation: true,
    };
  }
  const hotkeyMatch = cleaned.match(
    /^(?:please\s+)?(?:press|hit|send)\s+(?:shortcut\s+|hotkey\s+)?((?:ctrl|alt|shift|win)(?:\s*[+\s]\s*(?:ctrl|alt|shift|win|[a-z0-9]|tab|enter|escape|esc|backspace|space|f\d{1,2}))+|enter|escape|esc|tab|alt\s+tab)[.!?]*$/i
  );
  if (hotkeyMatch) {
    const keys = hotkeyMatch[1]
      .toLowerCase()
      .split(/[+\s]+/)
      .map((k) => (k === 'esc' ? 'escape' : k))
      .filter(Boolean);
    return {
      type: 'computer_action',
      action: 'companion_keyboard_action',
      subAction: 'hotkey',
      target: keys.join('+'),
      keys,
      label: `Press ${keys.join(' + ')}`,
      requiresConfirmation: true,
    };
  }
  if (/^(?:alt\s+tab|switch\s+window|next\s+window)[.!?]*$/i.test(cleaned)) {
    return {
      type: 'computer_action',
      action: 'companion_keyboard_action',
      subAction: 'hotkey',
      target: 'alt+tab',
      keys: ['alt', 'tab'],
      label: 'Switch Window (Alt + Tab)',
      requiresConfirmation: false,
    };
  }
  if (/^(?:copy\s+that|select\s+all|paste\s+(?:that|clipboard))$/i.test(cleaned)) {
    const keys = /^select/i.test(cleaned)
      ? ['ctrl', 'a']
      : /^copy/i.test(cleaned)
      ? ['ctrl', 'c']
      : ['ctrl', 'v'];
    return {
      type: 'computer_action',
      action: 'companion_keyboard_action',
      subAction: 'hotkey',
      target: keys.join('+'),
      keys,
      label: `Shortcut ${keys.join(' + ').toUpperCase()}`,
      requiresConfirmation: true,
    };
  }
  if (/^(?:organize|clean\s+up|sort)\s+(?:my\s+)?downloads(?:\s+folder)?[.!?]*$/i.test(cleaned)) {
    return {
      type: 'computer_action',
      action: 'companion_file_organize',
      target: 'downloads',
      label: 'Organize Downloads by Category',
      requiresConfirmation: true,
    };
  }
  if (/^(?:find|scan(?:\s+for)?)\s+duplicate\s+files(?:\s+in\s+(.+?))?[.!?]*$/i.test(cleaned)) {
    return {
      type: 'computer_action',
      action: 'companion_file_duplicates',
      target: 'downloads',
      label: 'Scan Duplicate Files',
      requiresConfirmation: false,
    };
  }
  const brightnessMatch = cleaned.match(
    /(?:set|adjust)\s+(?:screen\s+)?brightness\s+(?:to\s+)?(\d{1,3})\s*%?/i
  );
  if (brightnessMatch) {
    const level = Math.max(5, Math.min(100, parseInt(brightnessMatch[1], 10)));
    return {
      type: 'computer_action',
      action: 'companion_system_setting',
      target: 'brightness',
      value: String(level),
      label: `Set Brightness to ${level}%`,
      requiresConfirmation: true,
    };
  }
  if (/^(?:lock\s+(?:my\s+)?(?:pc|computer|screen|windows)|pc\s+lock\s+koro)[.!?]*$/i.test(cleaned)) {
    return {
      type: 'computer_action',
      action: 'companion_lock_system',
      target: 'lock',
      label: 'Lock Windows Workstation',
      requiresConfirmation: true,
    };
  }

  // 3d. Real Browser Automation (English + Bangla + Banglish)
  if (/^(?:stop\s+(?:browser\s+)?automation|cancel\s+automation|browser\s+stop)[.!?]*$/i.test(cleaned)) {
    return {
      type: 'browser_automation',
      action: 'stop_automation',
      label: 'Stop Browser Automation',
    };
  }
  if (/^(?:scroll\s+down|niche\s+jao|niche\s+scroll\s+koro|page\s+down)[.!?]*$/i.test(cleaned)) {
    return {
      type: 'browser_automation',
      action: 'scroll',
      direction: 'down',
      label: 'Scroll Down',
    };
  }
  if (/^(?:scroll\s+up|upore\s+jao|upore\s+scroll\s+koro|page\s+up)[.!?]*$/i.test(cleaned)) {
    return {
      type: 'browser_automation',
      action: 'scroll',
      direction: 'up',
      label: 'Scroll Up',
    };
  }
  if (/^(?:go\s+back|back\s+jao|pechone\s+jao|previous\s+page)[.!?]*$/i.test(cleaned)) {
    return {
      type: 'browser_automation',
      action: 'back',
      label: 'Navigate Back',
    };
  }
  if (/^(?:go\s+forward|forward\s+jao|next\s+page)[.!?]*$/i.test(cleaned)) {
    return {
      type: 'browser_automation',
      action: 'forward',
      label: 'Navigate Forward',
    };
  }
  if (/^(?:open\s+(?:a\s+)?new\s+tab|new\s+tab(?:\s+kholo|\s+open\s+koro)?|notun\s+tab\s+kholo)[.!?]*$/i.test(cleaned)) {
    return {
      type: 'browser_automation',
      action: 'new_tab',
      label: 'Open New Tab',
    };
  }
  if (/^(?:close\s+(?:this\s+)?(?:tab|page)|ei\s+(?:page|tab)\s+(?:close|bondho)\s+koro|tab\s+(?:close|bondho)\s+koro)[.!?]*$/i.test(cleaned)) {
    return {
      type: 'browser_automation',
      action: 'close_tab',
      label: 'Close Current Tab',
    };
  }
  if (/^(?:next\s+tab|switch\s+tab|porer\s+tab)[.!?]*$/i.test(cleaned)) {
    return {
      type: 'browser_automation',
      action: 'switch_tab',
      label: 'Switch Tab',
    };
  }
  if (/^(?:read\s+(?:this\s+|the\s+)?(?:page|results?)|what'?s\s+on\s+(?:this\s+)?page|page\s+poro)[.!?]*$/i.test(cleaned)) {
    return {
      type: 'browser_automation',
      action: 'read_page',
      label: 'Read Current Page',
    };
  }

  const openResultMatch = cleaned.match(
    /^(?:(?:please\s+)?(?:open|click|select)\s+(?:the\s+)?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\s+(?:result|link|video|one)|(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th)\s+(?:result|link|video|ta)\s+(?:open|click)\s*(?:koro|dao)?)[.!?]*$/i
  );
  if (openResultMatch) {
    const ord = (openResultMatch[1] || openResultMatch[2] || 'first').toLowerCase();
    const ordMap: Record<string, number> = {
      first: 1,
      '1st': 1,
      second: 2,
      '2nd': 2,
      third: 3,
      '3rd': 3,
      fourth: 4,
      '4th': 4,
      fifth: 5,
      '5th': 5,
    };
    const idx = ordMap[ord] || 1;
    return {
      type: 'browser_automation',
      action: 'open_result',
      resultIndex: idx,
      label: `Open Result #${idx}`,
    };
  }

  // Banglish/English compound search:
  // "Google-e Hasan search koro", "Google-e search koro best gaming laptop",
  // "YouTube-e Minecraft survival search koro", "YouTube kholo, Minecraft search dao",
  // "Search for movies on Google", "Search YouTube for Minecraft"
  const banglishSiteBeforeQuery = cleaned.match(
    /^(?:google|youtube)[-\s]*(?:e|te|ay)?\s+(?:(.+?)\s+search\s+(?:koro|dao|kor|kro)|search\s+(?:koro|dao|for)?\s+(.+?))[.!?]*$/i
  );
  if (banglishSiteBeforeQuery) {
    const engine: 'google' | 'youtube' = /^youtube/i.test(cleaned) ? 'youtube' : 'google';
    const q = (banglishSiteBeforeQuery[1] || banglishSiteBeforeQuery[2] || '').trim();
    if (q) {
      return {
        type: 'browser_automation',
        action: 'search',
        engine,
        query: q,
        label: `Search ${engine === 'youtube' ? 'YouTube' : 'Google'} for "${q}"`,
      };
    }
  }
  const openAndSearchCompound = cleaned.match(
    /^(youtube|google)\s+(?:kholo|khulen|open(?:\s+koro)?)[,\s]+(?:and\s+|tarpor\s+)?(.+?)\s+(?:search\s+(?:koro|dao)|khujo|find\s+koro)[.!?]*$/i
  );
  if (openAndSearchCompound) {
    const engine: 'google' | 'youtube' =
      openAndSearchCompound[1].toLowerCase() === 'youtube' ? 'youtube' : 'google';
    const q = openAndSearchCompound[2].trim();
    if (q) {
      return {
        type: 'browser_automation',
        action: 'search',
        engine,
        query: q,
        label: `Search ${engine === 'youtube' ? 'YouTube' : 'Google'} for "${q}"`,
      };
    }
  }
  const searchOnSiteMatch = cleaned.match(
    /^(?:please\s+)?search(?:\s+for)?\s+(.+?)\s+(?:on|in)\s+(google|youtube|bing|duckduckgo)[.!?]*$/i
  );
  if (searchOnSiteMatch) {
    const q = searchOnSiteMatch[1].trim();
    const rawEng = searchOnSiteMatch[2].toLowerCase() as 'google' | 'youtube' | 'bing' | 'duckduckgo';
    return {
      type: 'browser_automation',
      action: 'search',
      engine: rawEng,
      query: q,
      label: `Search ${rawEng} for "${q}"`,
    };
  }
  const siteSearchPrefix = cleaned.match(
    /^(?:please\s+)?search\s+(youtube|google|bing|duckduckgo)\s+(?:for\s+)?(.+?)[.!?]*$/i
  );
  if (siteSearchPrefix) {
    const rawEng = siteSearchPrefix[1].toLowerCase() as 'google' | 'youtube' | 'bing' | 'duckduckgo';
    const q = siteSearchPrefix[2].trim();
    return {
      type: 'browser_automation',
      action: 'search',
      engine: rawEng,
      query: q,
      label: `Search ${rawEng} for "${q}"`,
    };
  }
  const clickTextMatch = cleaned.match(
    /^(?:please\s+)?click(?:\s+on)?\s+["']?(.+?)["']?[.!?]*$/i
  );
  if (clickTextMatch && clickTextMatch[1].trim().length >= 2) {
    return {
      type: 'browser_automation',
      action: 'click_text',
      targetText: clickTextMatch[1].trim(),
      label: `Click "${clickTextMatch[1].trim()}"`,
    };
  }

  const focusOnMatch = cleaned.match(
    /^(?:turn\s+on|enable|activate|start)\s+(?:the\s+)?focus\s+mode\b|^(?:turn\s+)?(?:the\s+)?focus\s+mode\s+(?:on|enabled?)$/i
  );
  if (focusOnMatch) {
    return {
      type: 'environment',
      patch: { focusMode: true },
      spokenConfirmation: 'Focus mode is now enabled.',
    };
  }
  const focusOffMatch = cleaned.match(
    /^(?:turn\s+off|disable|deactivate|stop)\s+(?:the\s+)?focus\s+mode\b|^(?:turn\s+)?(?:the\s+)?focus\s+mode\s+(?:off|disabled?)$/i
  );
  if (focusOffMatch) {
    return {
      type: 'environment',
      patch: { focusMode: false },
      spokenConfirmation: 'Focus mode disabled.',
    };
  }
  const lightsMatch = cleaned.match(
    /(?:set|dim|turn)\s+(?:the\s+)?lights?\s+(?:to\s+)?(\d{1,3})\s*%?/i
  );
  if (lightsMatch) {
    const level = Math.max(0, Math.min(100, parseInt(lightsMatch[1], 10)));
    return {
      type: 'environment',
      patch: { lightBrightness: level },
      spokenConfirmation: `Workspace lighting set to ${level} percent.`,
    };
  }
  const thermoMatch = cleaned.match(
    /(?:set|adjust)\s+(?:the\s+)?(?:thermostat|temperature)\s+(?:to\s+)?(\d{1,2}(?:\.\d+)?)/i
  );
  if (thermoMatch) {
    const celsius = Math.max(16, Math.min(28, parseFloat(thermoMatch[1])));
    return {
      type: 'environment',
      patch: { thermostatCelsius: celsius },
      spokenConfirmation: `Thermostat set to ${celsius} degrees Celsius.`,
    };
  }

  // 4. Close desktop applications
  const closeAppMatch = cleaned.match(
    /^(?:please\s+)?(?:close|quit|kill|exit|terminate)\s+(.+?)[.!?]*$/i
  );
  if (closeAppMatch) {
    const targetText = closeAppMatch[1].trim();
    for (const d of DESKTOP_APPS) {
      if (d.pattern.test(targetText)) {
        return {
          type: 'computer_action',
          action: 'companion_close_app',
          target: d.appName,
          label: `Close ${d.label}`,
          requiresConfirmation: true,
        };
      }
    }
  }

  // 5. Media playback & system volume
  if (/^(?:pause|play|resume)\s+(?:music|media|song|track|video|playback)$/i.test(cleaned)) {
    return {
      type: 'computer_action',
      action: 'companion_media_control',
      target: /^pause/i.test(cleaned) ? 'pause' : 'play',
      label: 'Media Playback Control',
      requiresConfirmation: false,
    };
  }
  if (/^(?:next|skip)\s+(?:song|track|music)$/i.test(cleaned)) {
    return {
      type: 'computer_action',
      action: 'companion_media_control',
      target: 'next',
      label: 'Next Track',
      requiresConfirmation: false,
    };
  }
  if (/^(?:previous|prev|back)\s+(?:song|track|music)$/i.test(cleaned)) {
    return {
      type: 'computer_action',
      action: 'companion_media_control',
      target: 'previous',
      label: 'Previous Track',
      requiresConfirmation: false,
    };
  }
  const volMatch = cleaned.match(/(?:set\s+)?(?:system\s+)?volume\s+(?:to\s+)?(\d{1,3})\s*%?/i);
  if (volMatch) {
    const level = Math.max(0, Math.min(100, parseInt(volMatch[1], 10)));
    return {
      type: 'computer_action',
      action: 'companion_system_setting',
      target: 'volume',
      value: String(level),
      label: `Set Volume to ${level}%`,
      requiresConfirmation: true,
    };
  }

  // 6. Files, notes, folders, screenshot, system info
  const writeNoteMatch = cleaned.match(
    /^(?:create|write|make|save)\s+(?:a\s+)?(?:note|file)(?:\s+(?:called|named))?\s+([^\s:]+)(?:\s+(?:with|saying|content)\s+(.+))?$/i
  );
  if (writeNoteMatch) {
    return {
      type: 'computer_action',
      action: 'companion_write_file',
      target: writeNoteMatch[1].trim(),
      value: writeNoteMatch[2]?.trim() || `Note created by August on ${new Date().toLocaleString()}`,
      label: `Create File ${writeNoteMatch[1].trim()}`,
      requiresConfirmation: true,
    };
  }
  const folderMatch = cleaned.match(
    /^(?:create|make)\s+(?:a\s+)?(?:local\s+)?folder(?:\s+(?:called|named))?\s+(.+)$/i
  );
  if (folderMatch) {
    return {
      type: 'computer_action',
      action: 'create_local_folder',
      target: folderMatch[1].trim(),
      label: `Create Folder ${folderMatch[1].trim()}`,
      requiresConfirmation: true,
    };
  }
  if (/\b(?:capture|take)\s+(?:a\s+)?screenshot\b/i.test(cleaned)) {
    return {
      type: 'computer_action',
      action: 'capture_screenshot',
      target: 'screen',
      label: 'Capture Screen',
      requiresConfirmation: true,
    };
  }
  if (/\b(?:system\s+status|pc\s+status|check\s+battery|device\s+info|hardware\s+(?:stats|status|telemetry)|cpu\s+usage|ram\s+usage)\b/i.test(cleaned)) {
    return {
      type: 'computer_action',
      action: 'system_info',
      target: 'system',
      label: 'System Telemetry',
      requiresConfirmation: false,
    };
  }

  // 7. Generic web search ("search for ...") -> Real Browser Automation
  const genericSearchMatch = cleaned.match(
    /^(?:please\s+)?search(?:\s+the\s+web)?(?:\s+for)?\s+(.+?)[.!?]*$/i
  );
  if (genericSearchMatch && genericSearchMatch[1].trim().length >= 2) {
    const q = genericSearchMatch[1].trim();
    return {
      type: 'browser_automation',
      action: 'search',
      engine: 'google',
      query: q,
      label: `Search Google for "${q}"`,
    };
  }

  // 8. Open websites or Desktop apps (supports English, Banglish, and stuttered transcripts like "YouTube open YouTube")
  if (
    !/\b(?:local\s+file|local\s+folder|settings|memory\s+vault|tasks\s+panel|system\s+status|screenshot)\b/i.test(
      cleaned
    )
  ) {
    const prefixLaunchMatch = cleaned.match(
      /^(?:please\s+)?(?:can\s+you\s+|could\s+you\s+)?(?:open|launch|start|visit|go\s+to|load|kholo|khulen|chalu\s+koro)\s+(.+?)(?:\s+(?:please|for\s+me|now|right\s+now|koro|kholo))?[.!?]*$/i
    );
    const postfixLaunchMatch = !prefixLaunchMatch
      ? cleaned.match(
          /^(?:please\s+)?(.+?)\s+(?:open\s+koro|open\s+kro|chalu\s+koro|on\s+koro|kholo|khulen|dekhao|open|launch)(?:\s+(.+?))?[.!?]*$/i
        )
      : null;

    let rawLaunchRest: string | null = null;
    if (prefixLaunchMatch) {
      rawLaunchRest = prefixLaunchMatch[1].trim();
    } else if (postfixLaunchMatch) {
      const left = postfixLaunchMatch[1].trim();
      const right = postfixLaunchMatch[2]?.trim() || '';
      if (right && left.toLowerCase() === right.toLowerCase()) {
        rawLaunchRest = right;
      } else if (right && right.toLowerCase().includes(left.toLowerCase())) {
        rawLaunchRest = right;
      } else {
        rawLaunchRest = right ? `${left} ${right}`.trim() : left;
      }
    }

    if (rawLaunchRest) {
      const words = rawLaunchRest.split(/\s+/);
      if (words.length >= 2 && words[0].toLowerCase() === words[words.length - 1].toLowerCase()) {
        const half = Math.floor(words.length / 2);
        const firstHalf = words.slice(0, half).join(' ').toLowerCase();
        const secondHalf = words.slice(half).join(' ').toLowerCase();
        if (firstHalf === secondHalf) {
          rawLaunchRest = words.slice(0, half).join(' ');
        }
      }

      for (const d of DESKTOP_APPS) {
        if (d.pattern.test(rawLaunchRest)) {
          return {
            type: 'computer_action',
            action: 'companion_launch_app',
            target: d.appName,
            label: d.label,
            requiresConfirmation: true,
          };
        }
      }
      const searchSplit = rawLaunchRest.match(
        /^(.+?)\s+(?:and\s+)?(?:search(?:\s+for)?|look\s+up|find|play)\s+(.+)$/i
      );
      if (searchSplit) {
        const resolved = resolveWebTarget(searchSplit[1].trim(), searchSplit[2].trim());
        return { type: 'open_web', ...resolved };
      }
      const websitePrefix = rawLaunchRest
        .replace(/^(?:the\s+)?(?:website|site|app)\s+/i, '')
        .replace(/\s+(?:website|site)$/i, '')
        .trim();
      const resolved = resolveWebTarget(websitePrefix);
      return { type: 'open_web', ...resolved };
    }
  }

  return null;
}
