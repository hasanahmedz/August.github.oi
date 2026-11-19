import { getWorkspaceAccessToken } from './firebase';
import type {
  ContactEntry,
  WorkspaceCalendarEvent,
  WorkspaceEmailSummary,
} from '../types/assistant';

export class WorkspaceAuthRequiredError extends Error {
  constructor(message = 'Google Workspace OAuth token is missing or expired. Connect Gmail, Calendar & Contacts first.') {
    super(message);
    this.name = 'WorkspaceAuthRequiredError';
  }
}

function requireToken(): string {
  const token = getWorkspaceAccessToken();
  if (!token) {
    throw new WorkspaceAuthRequiredError();
  }
  return token;
}

async function workspaceFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const token = requireToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new WorkspaceAuthRequiredError('Google Workspace session expired or missing permissions. Re-connect Google Workspace.');
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google Workspace API error (${res.status}): ${errText.slice(0, 200)}`);
  }
  if (res.status === 204) {
    return {} as T;
  }
  return (await res.json()) as T;
}

function encodeBase64UrlUtf8(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function listGmailInbox(maxResults = 8, query = ''): Promise<WorkspaceEmailSummary[]> {
  const qParam = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : '';
  const listData = await workspaceFetchJson<{ messages?: Array<{ id: string; threadId: string }> }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.min(20, Math.max(1, maxResults))}${qParam}`
  );
  const refs = listData.messages || [];
  const items = await Promise.all(
    refs.slice(0, maxResults).map(async (m) => {
      try {
        const msg = await workspaceFetchJson<{
          id: string;
          threadId: string;
          snippet?: string;
          labelIds?: string[];
          payload?: { headers?: Array<{ name: string; value: string }> };
        }>(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        );
        const headers = msg.payload?.headers || [];
        const getHeader = (n: string) =>
          headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || '';
        return {
          id: msg.id,
          threadId: msg.threadId,
          from: getHeader('From') || 'Unknown sender',
          subject: getHeader('Subject') || '(No subject)',
          snippet: msg.snippet || '',
          date: getHeader('Date') || '',
          unread: Array.isArray(msg.labelIds) ? msg.labelIds.includes('UNREAD') : false,
        } satisfies WorkspaceEmailSummary;
      } catch {
        return null;
      }
    })
  );
  return items.filter((item): item is WorkspaceEmailSummary => item !== null);
}

/**
 * Sends an email via Gmail API. MUST only be called after explicit user confirmation!
 */
export async function sendGmailMessage(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ id: string; threadId?: string }> {
  const cleanTo = params.to.trim();
  const cleanSubject = params.subject.trim() || '(No subject)';
  const cleanBody = params.body.trim();
  const mime = [
    `To: ${cleanTo}`,
    `Subject: ${cleanSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    cleanBody,
  ].join('\r\n');

  return workspaceFetchJson<{ id: string; threadId?: string }>(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      body: JSON.stringify({ raw: encodeBase64UrlUtf8(mime) }),
    }
  );
}

export async function listUpcomingCalendarEvents(maxResults = 10): Promise<WorkspaceCalendarEvent[]> {
  const timeMin = new Date().toISOString();
  const data = await workspaceFetchJson<{
    items?: Array<{
      id: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      location?: string;
      description?: string;
      htmlLink?: string;
    }>;
  }>(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
      timeMin
    )}&singleEvents=true&orderBy=startTime&maxResults=${Math.min(25, Math.max(1, maxResults))}`
  );
  return (data.items || []).map((ev) => ({
    id: ev.id,
    summary: ev.summary || '(Untitled event)',
    start: ev.start?.dateTime || ev.start?.date || '',
    end: ev.end?.dateTime || ev.end?.date || '',
    location: ev.location,
    description: ev.description,
    htmlLink: ev.htmlLink,
  }));
}

/**
 * Creates a Google Calendar event. MUST only be called after explicit user confirmation!
 */
export async function createCalendarEvent(params: {
  summary: string;
  startIso: string;
  endIso: string;
  location?: string;
  description?: string;
}): Promise<WorkspaceCalendarEvent> {
  const created = await workspaceFetchJson<{
    id: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    location?: string;
    description?: string;
    htmlLink?: string;
  }>('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify({
      summary: params.summary.trim(),
      location: params.location?.trim() || undefined,
      description: params.description?.trim() || undefined,
      start: { dateTime: params.startIso },
      end: { dateTime: params.endIso },
    }),
  });
  return {
    id: created.id,
    summary: created.summary || params.summary,
    start: created.start?.dateTime || params.startIso,
    end: created.end?.dateTime || params.endIso,
    location: created.location,
    description: created.description,
    htmlLink: created.htmlLink,
  };
}

/**
 * Deletes a Google Calendar event. MUST only be called after explicit user confirmation!
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  await workspaceFetchJson(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' }
  );
}

export async function listGoogleContacts(pageSize = 60): Promise<ContactEntry[]> {
  const data = await workspaceFetchJson<{
    connections?: Array<{
      resourceName?: string;
      names?: Array<{ displayName?: string }>;
      phoneNumbers?: Array<{ value?: string; canonicalForm?: string }>;
      emailAddresses?: Array<{ value?: string }>;
    }>;
  }>(
    `https://people.googleapis.com/v1/people/me/connections?personFields=names,phoneNumbers,emailAddresses&pageSize=${Math.min(
      100,
      Math.max(10, pageSize)
    )}`
  );

  const nowIso = new Date().toISOString();
  const out: ContactEntry[] = [];
  for (const conn of data.connections || []) {
    const name = conn.names?.[0]?.displayName?.trim();
    const phone = (conn.phoneNumbers?.[0]?.canonicalForm || conn.phoneNumbers?.[0]?.value || '').trim();
    const email = conn.emailAddresses?.[0]?.value?.trim();
    if (!name || !phone) continue;
    const rawId = (conn.resourceName || name).replace(/[^a-zA-Z0-9_-]/g, '_');
    out.push({
      id: `gcontact_${rawId}`.slice(0, 120),
      name,
      phone,
      email,
      consentToCall: true,
      vip: false,
      source: 'google_contacts',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }
  return out;
}
