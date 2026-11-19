import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Mail,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type {
  CallLogEntry,
  ContactEntry,
  WorkspaceCalendarEvent,
  WorkspaceEmailSummary,
} from '../../types/assistant';
import {
  connectGoogleWorkspaceAccount,
  subscribeWorkspaceTokenStatus,
} from '../../services/firebase';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listGmailInbox,
  listGoogleContacts,
  listUpcomingCalendarEvents,
  sendGmailMessage,
} from '../../services/googleWorkspace';
import type { DesktopCompanionBridge } from '../../utils/computerControl';

export interface PersonalCallHubProps {
  initialTab?: 'workspace' | 'calls';
  contacts: ContactEntry[];
  callLogs: CallLogEntry[];
  companionBridge: DesktopCompanionBridge;
  companionConnected: boolean;
  onSaveContact: (contact: ContactEntry, isUpdate?: boolean) => Promise<void>;
  onDeleteContact: (id: string) => Promise<void>;
  onLogCall: (entry: CallLogEntry) => Promise<void>;
  onLogAction: (command: string, detail: string) => void;
}

export const PersonalCallHub: React.FC<PersonalCallHubProps> = ({
  initialTab = 'workspace',
  contacts,
  callLogs,
  companionBridge,
  companionConnected,
  onSaveContact,
  onDeleteContact,
  onLogCall,
  onLogAction,
}) => {
  const [subTab, setSubTab] = useState<'workspace' | 'calls'>(initialTab);
  const [workspaceConnected, setWorkspaceConnected] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Gmail & Calendar state
  const [emails, setEmails] = useState<WorkspaceEmailSummary[]>([]);
  const [events, setEvents] = useState<WorkspaceCalendarEvent[]>([]);
  const [mailTo, setMailTo] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');

  // Contacts & Calling state
  const [contactSearch, setContactSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRelation, setNewRelation] = useState('');
  const [newVip, setNewVip] = useState(false);
  const [disambiguationMatches, setDisambiguationMatches] = useState<ContactEntry[]>([]);

  // Mandatory Confirmation Gate Modal for Workspace mutations & Outgoing Calls
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    detail: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    setSubTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    return subscribeWorkspaceTokenStatus((connected) => setWorkspaceConnected(connected));
  }, []);

  const handleConnectWorkspace = async () => {
    setBusy(true);
    setStatusMsg('');
    try {
      await connectGoogleWorkspaceAccount();
      setStatusMsg('Connected Gmail, Google Calendar, and Google Contacts.');
      onLogAction('workspace:oauth', 'Authorized Google Workspace scopes');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Google Workspace OAuth failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSyncWorkspace = async () => {
    setBusy(true);
    setStatusMsg('');
    try {
      const [inbox, cal] = await Promise.all([
        listGmailInbox(8),
        listUpcomingCalendarEvents(8),
      ]);
      setEmails(inbox);
      setEvents(cal);
      setStatusMsg(`Synced ${inbox.length} emails and ${cal.length} upcoming calendar events.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Workspace sync failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSyncGoogleContacts = async () => {
    setBusy(true);
    setStatusMsg('');
    try {
      const gContacts = await listGoogleContacts(40);
      for (const c of gContacts.slice(0, 25)) {
        await onSaveContact(c, false);
      }
      setStatusMsg(`Imported ${Math.min(25, gContacts.length)} Google Contact(s) into Smart Calling directory.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Google Contacts sync failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddLocalContact = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    const nowIso = new Date().toISOString();
    await onSaveContact(
      {
        id: `contact_${Date.now()}`,
        name: newName.trim(),
        phone: newPhone.trim(),
        relation: newRelation.trim() || undefined,
        consentToCall: true,
        vip: newVip,
        source: 'local',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      false
    );
    setNewName('');
    setNewPhone('');
    setNewRelation('');
    setNewVip(false);
    setStatusMsg(`Added contact "${newName.trim()}" with outgoing call consent.`);
  };

  const executeConfirmedCall = async (contact: ContactEntry) => {
    let method: CallLogEntry['method'] = 'tel_uri';
    if (companionConnected) {
      const res = await companionBridge.placeCall(contact.phone, contact.name);
      method = 'phone_link';
      setStatusMsg(res.message);
    } else {
      // Programmatic tel: anchor click (never window.open)
      const anchor = document.createElement('a');
      anchor.href = `tel:${contact.phone.replace(/[\s()-]+/g, '')}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setStatusMsg(`Launched OS tel: dialer handoff for ${contact.name} (${contact.phone}).`);
    }
    await onLogCall({
      id: `call_${Date.now()}`,
      contactName: contact.name,
      phone: contact.phone,
      direction: 'outgoing',
      method,
      status: 'initiated',
      note: 'User confirmed outgoing call',
      createdAt: new Date().toISOString(),
    });
    onLogAction('calling:outgoing', `Placed call handoff to ${contact.name} (${method})`);
  };

  const initiateCallRequest = (contact: ContactEntry) => {
    if (!contact.consentToCall) {
      setStatusMsg(`Calling ${contact.name} is blocked until "Call Consent" is enabled.`);
      return;
    }
    setConfirmModal({
      title: `Confirm Outgoing Call to ${contact.name}?`,
      detail: `Number: ${contact.phone}${
        companionConnected
          ? ' — Hand off via Windows Phone Link / OS dialer.'
          : ' — Hand off via OS tel: URI.'
      }`,
      onConfirm: () => executeConfirmedCall(contact),
    });
  };

  const handleQuickDialQuery = () => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return;
    const matches = contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.aliases || '').toLowerCase().includes(q)
    );
    if (matches.length === 1) {
      setDisambiguationMatches([]);
      initiateCallRequest(matches[0]);
    } else if (matches.length > 1) {
      setDisambiguationMatches(matches);
      setStatusMsg(`Multiple contacts matched "${contactSearch}". Select who to call.`);
    } else if (/^[+0-9#*() -]{5,24}$/.test(contactSearch.trim())) {
      const nowIso = new Date().toISOString();
      initiateCallRequest({
        id: 'direct',
        name: contactSearch.trim(),
        phone: contactSearch.trim(),
        consentToCall: true,
        vip: false,
        source: 'local',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    } else {
      setStatusMsg(`No saved contact matched "${contactSearch}".`);
    }
  };

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.relation || '').toLowerCase().includes(q)
    );
  }, [contacts, contactSearch]);

  return (
    <div className="flex flex-col gap-4 w-full text-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('workspace')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border ${
              subTab === 'workspace'
                ? 'bg-sky-500/15 border-sky-400/60 text-sky-300'
                : 'bg-slate-900/70 border-slate-800 text-slate-400'
            }`}
          >
            <Mail className="w-3.5 h-3.5" /> Gmail & Calendar
          </button>
          <button
            type="button"
            onClick={() => setSubTab('calls')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border ${
              subTab === 'calls'
                ? 'bg-sky-500/15 border-sky-400/60 text-sky-300'
                : 'bg-slate-900/70 border-slate-800 text-slate-400'
            }`}
          >
            <Phone className="w-3.5 h-3.5" /> Smart Calling & Contacts ({contacts.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleConnectWorkspace()}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 border ${
              workspaceConnected
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-sky-500/20 border-sky-400/50 text-sky-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {workspaceConnected ? 'Workspace Connected (Refresh)' : 'Connect Google Workspace'}
          </button>
          {workspaceConnected && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSyncWorkspace()}
              className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Sync Inbox & Calendar
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div className="px-3 py-2 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-sky-300">
          {statusMsg}
        </div>
      )}

      {subTab === 'workspace' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Gmail Inbox + Compose */}
          <div className="lg:col-span-6 bg-slate-950/75 border border-slate-800 rounded-lg p-3 space-y-3">
            <div className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
              <Mail className="w-4 h-4" /> Gmail Inbox ({emails.length})
            </div>
            <div className="max-h-52 overflow-y-auto space-y-1.5">
              {emails.map((m) => (
                <div key={m.id} className="bg-slate-900/90 border border-slate-800 rounded p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-200 truncate">{m.subject}</span>
                    {m.unread && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                        UNREAD
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">{m.from}</div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{m.snippet}</p>
                </div>
              ))}
              {emails.length === 0 && (
                <p className="text-[11px] text-slate-500">
                  {workspaceConnected ? 'Click Sync Inbox & Calendar to load recent messages.' : 'Connect Google Workspace above to inspect Gmail.'}
                </p>
              )}
            </div>

            <div className="border-t border-slate-800 pt-2.5 space-y-2 text-xs">
              <div className="text-[11px] font-mono uppercase text-slate-400">Compose Email (Confirmation Gated)</div>
              <input
                type="email"
                value={mailTo}
                onChange={(e) => setMailTo(e.target.value)}
                placeholder="Recipient email"
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5"
              />
              <input
                type="text"
                value={mailSubject}
                onChange={(e) => setMailSubject(e.target.value)}
                placeholder="Subject"
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5"
              />
              <textarea
                rows={3}
                value={mailBody}
                onChange={(e) => setMailBody(e.target.value)}
                placeholder="Message body..."
                className="w-full bg-slate-900 border border-slate-800 rounded p-2"
              />
              <button
                type="button"
                disabled={!workspaceConnected || !mailTo.trim() || !mailBody.trim()}
                onClick={() =>
                  setConfirmModal({
                    title: 'Confirm Sending Email via Gmail?',
                    detail: `Send email to ${mailTo.trim()} with subject "${mailSubject.trim() || '(No subject)'}"?`,
                    onConfirm: async () => {
                      await sendGmailMessage({ to: mailTo, subject: mailSubject, body: mailBody });
                      setMailTo('');
                      setMailSubject('');
                      setMailBody('');
                      setStatusMsg('Email sent via Gmail.');
                      onLogAction('gmail:send', `Sent email to ${mailTo}`);
                    },
                  })
                }
                className="px-3 py-1.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 font-medium flex items-center gap-1.5 disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" /> Send Email
              </button>
            </div>
          </div>

          {/* Google Calendar */}
          <div className="lg:col-span-6 bg-slate-950/75 border border-slate-800 rounded-lg p-3 space-y-3">
            <div className="text-xs font-semibold text-sky-300 flex items-center gap-1.5">
              <Calendar className="w-4 h-4" /> Google Calendar Schedule ({events.length})
            </div>
            <div className="max-h-52 overflow-y-auto space-y-1.5">
              {events.map((ev) => (
                <div key={ev.id} className="bg-slate-900/90 border border-slate-800 rounded p-2 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-200 truncate">{ev.summary}</div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      {ev.start ? new Date(ev.start).toLocaleString() : 'TBD'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmModal({
                        title: 'Delete Calendar Event?',
                        detail: `Remove "${ev.summary}" from Google Calendar?`,
                        onConfirm: async () => {
                          await deleteCalendarEvent(ev.id);
                          setEvents((prev) => prev.filter((item) => item.id !== ev.id));
                          setStatusMsg(`Deleted event "${ev.summary}".`);
                          onLogAction('calendar:delete', `Deleted event "${ev.summary}"`);
                        },
                      })
                    }
                    className="text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {events.length === 0 && (
                <p className="text-[11px] text-slate-500">No upcoming events loaded yet.</p>
              )}
            </div>

            <div className="border-t border-slate-800 pt-2.5 space-y-2 text-xs">
              <div className="text-[11px] font-mono uppercase text-slate-400">Create Calendar Event (Confirmation Gated)</div>
              <input
                type="text"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="Event title"
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="datetime-local"
                  value={eventStart}
                  onChange={(e) => setEventStart(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 font-mono text-[11px]"
                />
                <input
                  type="datetime-local"
                  value={eventEnd}
                  onChange={(e) => setEventEnd(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1.5 font-mono text-[11px]"
                />
              </div>
              <button
                type="button"
                disabled={!workspaceConnected || !eventTitle.trim() || !eventStart}
                onClick={() => {
                  const startIso = new Date(eventStart).toISOString();
                  const endIso = eventEnd
                    ? new Date(eventEnd).toISOString()
                    : new Date(new Date(eventStart).getTime() + 3600000).toISOString();
                  setConfirmModal({
                    title: 'Create Google Calendar Event?',
                    detail: `Schedule "${eventTitle.trim()}" on ${new Date(startIso).toLocaleString()}?`,
                    onConfirm: async () => {
                      const created = await createCalendarEvent({ summary: eventTitle, startIso, endIso });
                      setEvents((prev) => [...prev, created]);
                      setEventTitle('');
                      setStatusMsg(`Created Calendar event "${created.summary}".`);
                      onLogAction('calendar:create', `Scheduled "${created.summary}"`);
                    },
                  });
                }}
                className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-medium flex items-center gap-1.5 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" /> Add Event
              </button>
            </div>
          </div>
        </div>
      )}

      {subTab === 'calls' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 space-y-3">
            {/* Search & Quick Dial */}
            <div className="flex flex-wrap gap-2 bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 text-xs">
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleQuickDialQuery();
                }}
                placeholder="Search contact name or enter phone number to call..."
                className="flex-1 min-w-[200px] bg-slate-900 border border-slate-800 rounded px-3 py-1.5"
              />
              <button
                type="button"
                onClick={handleQuickDialQuery}
                className="px-3 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-medium flex items-center gap-1.5"
              >
                <PhoneCall className="w-3.5 h-3.5" /> Call / Disambiguate
              </button>
              {workspaceConnected && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSyncGoogleContacts()}
                  className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-300 flex items-center gap-1"
                >
                  <Users className="w-3.5 h-3.5" /> Sync Google Contacts
                </button>
              )}
            </div>

            {disambiguationMatches.length > 1 && (
              <div className="bg-amber-950/30 border border-amber-500/40 rounded-lg p-2.5 space-y-1.5 text-xs">
                <div className="text-amber-300 font-medium">Multiple contacts matched — pick exact recipient:</div>
                <div className="flex flex-wrap gap-2">
                  {disambiguationMatches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setDisambiguationMatches([]);
                        initiateCallRequest(m);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 hover:border-amber-400"
                    >
                      {m.name} ({m.phone})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Contacts Directory */}
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {filteredContacts.map((c) => (
                <div key={c.id} className="bg-slate-950/75 border border-slate-800 rounded-lg p-2.5 text-xs flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-100">{c.name}</span>
                      {c.vip && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                          VIP
                        </span>
                      )}
                      {c.relation && <span className="text-[11px] text-slate-400">• {c.relation}</span>}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">{c.phone}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void onSaveContact({ ...c, consentToCall: !c.consentToCall, updatedAt: new Date().toISOString() }, true)
                      }
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                        c.consentToCall
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-900 border-slate-700 text-slate-500'
                      }`}
                    >
                      {c.consentToCall ? 'CONSENT OK' : 'LOCKED'}
                    </button>
                    <button
                      type="button"
                      onClick={() => initiateCallRequest(c)}
                      className="px-2.5 py-1 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 flex items-center gap-1"
                    >
                      <Phone className="w-3 h-3" /> Call
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteContact(c.id)}
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Add Contact + Call Logs */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-slate-950/75 border border-slate-800 rounded-lg p-3 space-y-2 text-xs">
              <div className="font-semibold text-sky-300 flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" /> Add Trusted Contact
              </div>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full Name"
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5"
              />
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Phone (+880...)"
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 font-mono"
              />
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={newRelation}
                  onChange={(e) => setNewRelation(e.target.value)}
                  placeholder="Relation (optional)"
                  className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5"
                />
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
                  <input type="checkbox" checked={newVip} onChange={(e) => setNewVip(e.target.checked)} />
                  VIP
                </label>
              </div>
              <button
                type="button"
                onClick={() => void handleAddLocalContact()}
                className="px-3 py-1.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 font-medium"
              >
                Save Contact
              </button>
            </div>

            <div className="bg-slate-950/75 border border-slate-800 rounded-lg p-3 space-y-2 text-xs">
              <div className="text-[11px] font-mono uppercase text-slate-400">
                Recent Call Handoff Logs ({callLogs.length})
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {callLogs.slice(0, 15).map((log) => (
                  <div key={log.id} className="bg-slate-900 border border-slate-800 rounded p-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-slate-200">{log.contactName}</div>
                      <div className="font-mono text-[10px] text-slate-400">
                        {log.phone} • {log.method} • {log.direction}
                      </div>
                    </div>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-700 rounded-xl max-w-md w-full p-4 space-y-3">
            <h3 className="text-sm font-semibold text-sky-300">{confirmModal.title}</h3>
            <p className="text-xs text-slate-300">{confirmModal.detail}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal(null);
                  await fn();
                }}
                className="px-3 py-1.5 rounded bg-sky-500/25 border border-sky-400 text-xs text-sky-200 font-medium"
              >
                Approve & Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
