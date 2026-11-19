import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type {
  AiMode,
  AutomationWorkflow,
  BugFixReport,
  CallLogEntry,
  ConnectedIntegrationItem,
  ContactEntry,
  CreativeAssetEntry,
  EnvironmentState,
  ExecutionLogEntry,
  GeminiVoiceName,
  KnowledgeChunkItem,
  KnowledgeDocItem,
  MemoryCategory,
  MemoryFact,
  MonitorTopic,
  MultiAgentRun,
  ProjectEntry,
  SearchHistoryItem,
  SkillDefinition,
  SkillVersionEntry,
  TaskItem,
  TaskPriority,
  VoiceLanguageCode,
  VoiceMood,
} from '../types/assistant';

const app = initializeApp(firebaseConfig);
const optionalDatabaseId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const db = optionalDatabaseId ? getFirestore(app, optionalDatabaseId) : getFirestore(app);
export const auth = getAuth(app);

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/contacts.readonly',
] as const;

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const workspaceProvider = new GoogleAuthProvider();
workspaceProvider.setCustomParameters({ prompt: 'consent' });
for (const scope of WORKSPACE_SCOPES) {
  workspaceProvider.addScope(scope);
}

// Strict in-memory OAuth token cache (never stored in localStorage/sessionStorage)
let cachedWorkspaceAccessToken: string | null = null;
const workspaceTokenListeners = new Set<(connected: boolean) => void>();

function notifyWorkspaceTokenChange() {
  const connected = Boolean(cachedWorkspaceAccessToken);
  for (const cb of workspaceTokenListeners) {
    cb(connected);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<{
  reachable: boolean;
  error?: string;
}> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { reachable: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return { reachable: false, error: 'Firestore client appears offline.' };
    }
    // Permission denied on default-deny test doc confirms server reachability
    return { reachable: true };
  }
}

void testFirestoreConnection();

export function subscribeToAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedWorkspaceAccessToken = null;
      notifyWorkspaceTokenChange();
    }
    callback(user);
  });
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    cachedWorkspaceAccessToken = credential.accessToken;
    notifyWorkspaceTokenChange();
  }
  return result.user;
}

export async function connectGoogleWorkspaceAccount(): Promise<{
  user: User;
  accessToken: string;
}> {
  const result = await signInWithPopup(auth, workspaceProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Google Workspace authorization succeeded without returning an access token.');
  }
  cachedWorkspaceAccessToken = credential.accessToken;
  notifyWorkspaceTokenChange();
  return { user: result.user, accessToken: credential.accessToken };
}

export function getWorkspaceAccessToken(): string | null {
  return cachedWorkspaceAccessToken;
}

export function clearWorkspaceAccessToken(): void {
  cachedWorkspaceAccessToken = null;
  notifyWorkspaceTokenChange();
}

export function subscribeWorkspaceTokenStatus(cb: (connected: boolean) => void): () => void {
  workspaceTokenListeners.add(cb);
  cb(Boolean(cachedWorkspaceAccessToken));
  return () => {
    workspaceTokenListeners.delete(cb);
  };
}

export async function signOutUser(): Promise<void> {
  cachedWorkspaceAccessToken = null;
  notifyWorkspaceTokenChange();
  await signOut(auth);
}

function sanitizeId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `id_${Date.now()}`;
}

function timestampToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string' && val) return val;
  return new Date().toISOString();
}

export interface CloudUserProfileData {
  displayName?: string;
  personaId?: string;
  aiMode: AiMode;
  voiceName: GeminiVoiceName;
  continuousMode: boolean;
  memoryEnabled: boolean;
  agentVoiceProfileId?: string;
  agentVoiceStyle?: string;
  voiceVolume?: number;
  voiceSpeed?: number;
  voicePitchSemitones?: number;
  proactiveVoiceAlerts?: boolean;
  spokenToolUpdates?: boolean;
  soundFeedbackEnabled?: boolean;
  desktopAwarenessEnabled?: boolean;
  preferredLanguage?: VoiceLanguageCode;
  voiceMoodDefault?: VoiceMood;
  environment?: EnvironmentState;
}

export async function ensureCloudUserProfile(
  user: User,
  defaults: CloudUserProfileData
): Promise<void> {
  const uid = sanitizeId(user.uid);
  const path = `users/${uid}`;
  try {
    const ref = doc(db, 'users', uid);
    const snap = await getDocFromServer(ref).catch(() => null);
    if (!snap || !snap.exists()) {
      await setDoc(ref, {
        userId: uid,
        displayName: (user.displayName || defaults.displayName || 'User').slice(0, 120),
        personaId: (defaults.personaId || 'butler').slice(0, 64),
        aiMode: defaults.aiMode,
        voiceName: defaults.voiceName || 'Charon',
        continuousMode: Boolean(defaults.continuousMode),
        memoryEnabled: Boolean(defaults.memoryEnabled),
        agentVoiceProfileId: (defaults.agentVoiceProfileId || 'august_soft_sir').slice(0, 64),
        agentVoiceStyle: (
          defaults.agentVoiceStyle ||
          'Soft, calm, emotionally expressive mature young-adult male British-English butler voice addressing Hasan respectfully as Sir, switching naturally to Bangla/Banglish when spoken to in Bangla.'
        ).slice(0, 300),
        voiceVolume: Math.min(1, Math.max(0, Number(defaults.voiceVolume ?? 0.92))),
        voiceSpeed: Math.min(1.4, Math.max(0.75, Number(defaults.voiceSpeed ?? 0.95))),
        voicePitchSemitones: Math.min(
          6,
          Math.max(-6, Number(defaults.voicePitchSemitones ?? -0.5))
        ),
        proactiveVoiceAlerts:
          defaults.proactiveVoiceAlerts === undefined
            ? true
            : Boolean(defaults.proactiveVoiceAlerts),
        spokenToolUpdates:
          defaults.spokenToolUpdates === undefined
            ? true
            : Boolean(defaults.spokenToolUpdates),
        soundFeedbackEnabled:
          defaults.soundFeedbackEnabled === undefined
            ? true
            : Boolean(defaults.soundFeedbackEnabled),
        desktopAwarenessEnabled: Boolean(defaults.desktopAwarenessEnabled ?? false),
        preferredLanguage: defaults.preferredLanguage || 'en-US',
        voiceMoodDefault: defaults.voiceMoodDefault || 'normal',
        lightBrightness: Math.min(
          100,
          Math.max(0, Math.round(defaults.environment?.lightBrightness ?? 75))
        ),
        lightTemperature: defaults.environment?.lightTemperature ?? 'daylight',
        thermostatCelsius: Math.min(
          28,
          Math.max(16, Number(defaults.environment?.thermostatCelsius ?? 21))
        ),
        focusMode: Boolean(defaults.environment?.focusMode ?? false),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateCloudUserProfile(
  uid: string,
  patch: Partial<CloudUserProfileData>
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const path = `users/${safeUid}`;
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.displayName !== undefined) {
    payload.displayName = patch.displayName.slice(0, 120);
  }
  if (patch.personaId !== undefined) {
    payload.personaId = patch.personaId.slice(0, 64);
  }
  if (patch.aiMode !== undefined) {
    payload.aiMode = patch.aiMode;
  }
  if (patch.voiceName !== undefined) {
    payload.voiceName = patch.voiceName;
  }
  if (patch.continuousMode !== undefined) {
    payload.continuousMode = Boolean(patch.continuousMode);
  }
  if (patch.memoryEnabled !== undefined) {
    payload.memoryEnabled = Boolean(patch.memoryEnabled);
  }
  if (patch.agentVoiceProfileId !== undefined) {
    payload.agentVoiceProfileId = patch.agentVoiceProfileId.slice(0, 64);
  }
  if (patch.agentVoiceStyle !== undefined) {
    payload.agentVoiceStyle = patch.agentVoiceStyle.slice(0, 300);
  }
  if (patch.voiceVolume !== undefined) {
    payload.voiceVolume = Math.min(1, Math.max(0, Number(patch.voiceVolume)));
  }
  if (patch.voiceSpeed !== undefined) {
    payload.voiceSpeed = Math.min(1.4, Math.max(0.75, Number(patch.voiceSpeed)));
  }
  if (patch.voicePitchSemitones !== undefined) {
    payload.voicePitchSemitones = Math.min(
      6,
      Math.max(-6, Number(patch.voicePitchSemitones))
    );
  }
  if (patch.proactiveVoiceAlerts !== undefined) {
    payload.proactiveVoiceAlerts = Boolean(patch.proactiveVoiceAlerts);
  }
  if (patch.spokenToolUpdates !== undefined) {
    payload.spokenToolUpdates = Boolean(patch.spokenToolUpdates);
  }
  if (patch.soundFeedbackEnabled !== undefined) {
    payload.soundFeedbackEnabled = Boolean(patch.soundFeedbackEnabled);
  }
  if (patch.desktopAwarenessEnabled !== undefined) {
    payload.desktopAwarenessEnabled = Boolean(patch.desktopAwarenessEnabled);
  }
  if (patch.preferredLanguage !== undefined) {
    payload.preferredLanguage = patch.preferredLanguage;
  }
  if (patch.voiceMoodDefault !== undefined) {
    payload.voiceMoodDefault = patch.voiceMoodDefault;
  }
  if (patch.environment) {
    payload.lightBrightness = Math.min(
      100,
      Math.max(0, Math.round(patch.environment.lightBrightness))
    );
    payload.lightTemperature = patch.environment.lightTemperature;
    payload.thermostatCelsius = Math.min(
      28,
      Math.max(16, Number(patch.environment.thermostatCelsius))
    );
    payload.focusMode = Boolean(patch.environment.focusMode);
  }

  try {
    await updateDoc(doc(db, 'users', safeUid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveCloudMemory(
  uid: string,
  fact: Omit<MemoryFact, 'updatedAt'> & { isNew?: boolean }
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(fact.id);
  const path = `users/${safeUid}/memories/${safeId}`;
  const clampedKey = fact.key.trim().slice(0, 120) || 'note';
  const clampedValue = fact.value.trim().slice(0, 2000) || '-';

  try {
    const ref = doc(db, 'users', safeUid, 'memories', safeId);
    if (fact.isNew === false) {
      await updateDoc(ref, {
        key: clampedKey,
        value: clampedValue,
        category: fact.category,
        approved: Boolean(fact.approved),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: safeUid,
        key: clampedKey,
        value: clampedValue,
        category: fact.category,
        approved: Boolean(fact.approved),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudMemory(uid: string, memoryId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(memoryId);
  const path = `users/${safeUid}/memories/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'memories', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function clearAllCloudMemories(
  uid: string,
  memoryIds: string[]
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const path = `users/${safeUid}/memories`;
  try {
    const batch = writeBatch(db);
    for (const id of memoryIds) {
      batch.delete(doc(db, 'users', safeUid, 'memories', sanitizeId(id)));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCloudTask(
  uid: string,
  task: Omit<TaskItem, 'createdAt' | 'updatedAt'> & { isNew?: boolean }
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(task.id);
  const path = `users/${safeUid}/tasks/${safeId}`;
  const title = task.title.trim().slice(0, 240) || 'Untitled task';
  const dueLabel = task.dueLabel ? task.dueLabel.trim().slice(0, 80) : undefined;

  try {
    const ref = doc(db, 'users', safeUid, 'tasks', safeId);
    if (task.isNew === false) {
      const updatePayload: Record<string, unknown> = {
        title,
        priority: task.priority,
        completed: Boolean(task.completed),
        updatedAt: serverTimestamp(),
      };
      if (dueLabel) {
        updatePayload.dueLabel = dueLabel;
      }
      await updateDoc(ref, updatePayload);
    } else {
      const createPayload: Record<string, unknown> = {
        userId: safeUid,
        title,
        priority: task.priority,
        completed: Boolean(task.completed),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (dueLabel) {
        createPayload.dueLabel = dueLabel;
      }
      await setDoc(ref, createPayload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudTask(uid: string, taskId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(taskId);
  const path = `users/${safeUid}/tasks/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'tasks', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCloudHistoryItem(
  uid: string,
  entry: {
    id: string;
    query: string;
    responsePreview?: string;
    aiMode: AiMode;
    memoriesUsed?: string[];
    runCount: number;
    isNew: boolean;
  }
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(entry.id);
  const path = `users/${safeUid}/history/${safeId}`;
  const clampedQuery = entry.query.trim().slice(0, 1000) || 'Voice command';
  const clampedPreview = entry.responsePreview
    ? entry.responsePreview.trim().slice(0, 1500)
    : undefined;
  const clampedMemories = Array.isArray(entry.memoriesUsed)
    ? entry.memoriesUsed.map((m) => String(m).slice(0, 120)).slice(0, 15)
    : undefined;

  try {
    const ref = doc(db, 'users', safeUid, 'history', safeId);
    if (entry.isNew) {
      const payload: Record<string, unknown> = {
        userId: safeUid,
        query: clampedQuery,
        aiMode: entry.aiMode,
        runCount: Math.max(1, Math.min(100000, Math.round(entry.runCount))),
        createdAt: serverTimestamp(),
        lastRunAt: serverTimestamp(),
      };
      if (clampedPreview) payload.responsePreview = clampedPreview;
      if (clampedMemories) payload.memoriesUsed = clampedMemories;
      await setDoc(ref, payload);
    } else {
      const payload: Record<string, unknown> = {
        query: clampedQuery,
        aiMode: entry.aiMode,
        runCount: Math.max(1, Math.min(100000, Math.round(entry.runCount))),
        lastRunAt: serverTimestamp(),
      };
      if (clampedPreview) payload.responsePreview = clampedPreview;
      if (clampedMemories) payload.memoriesUsed = clampedMemories;
      await updateDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudHistoryItem(
  uid: string,
  historyId: string
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(historyId);
  const path = `users/${safeUid}/history/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'history', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserCloudCollections(
  uid: string,
  callbacks: {
    onProfile: (profile: CloudUserProfileData) => void;
    onMemories: (memories: MemoryFact[]) => void;
    onTasks: (tasks: TaskItem[]) => void;
    onHistory: (history: SearchHistoryItem[]) => void;
    onError: (err: Error) => void;
  }
): () => void {
  const safeUid = sanitizeId(uid);

  const profileUnsub = onSnapshot(
    doc(db, 'users', safeUid),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      callbacks.onProfile({
        displayName: typeof d.displayName === 'string' ? d.displayName : undefined,
        personaId: typeof d.personaId === 'string' ? d.personaId : undefined,
        aiMode: (d.aiMode as AiMode) || 'STANDARD',
        voiceName: (d.voiceName as GeminiVoiceName) || 'Charon',
        continuousMode: Boolean(d.continuousMode),
        memoryEnabled: d.memoryEnabled === undefined ? true : Boolean(d.memoryEnabled),
        agentVoiceProfileId:
          typeof d.agentVoiceProfileId === 'string'
            ? d.agentVoiceProfileId
            : undefined,
        agentVoiceStyle:
          typeof d.agentVoiceStyle === 'string' ? d.agentVoiceStyle : undefined,
        voiceVolume: typeof d.voiceVolume === 'number' ? d.voiceVolume : undefined,
        voiceSpeed: typeof d.voiceSpeed === 'number' ? d.voiceSpeed : undefined,
        voicePitchSemitones:
          typeof d.voicePitchSemitones === 'number'
            ? d.voicePitchSemitones
            : undefined,
        proactiveVoiceAlerts:
          typeof d.proactiveVoiceAlerts === 'boolean'
            ? d.proactiveVoiceAlerts
            : undefined,
        spokenToolUpdates:
          typeof d.spokenToolUpdates === 'boolean'
            ? d.spokenToolUpdates
            : undefined,
        soundFeedbackEnabled:
          typeof d.soundFeedbackEnabled === 'boolean'
            ? d.soundFeedbackEnabled
            : undefined,
        desktopAwarenessEnabled:
          typeof d.desktopAwarenessEnabled === 'boolean'
            ? d.desktopAwarenessEnabled
            : undefined,
        preferredLanguage:
          d.preferredLanguage === 'en-IN' || d.preferredLanguage === 'bn-BD'
            ? (d.preferredLanguage as VoiceLanguageCode)
            : 'en-US',
        voiceMoodDefault:
          typeof d.voiceMoodDefault === 'string'
            ? (d.voiceMoodDefault as VoiceMood)
            : 'normal',
        environment: {
          lightBrightness:
            typeof d.lightBrightness === 'number' ? d.lightBrightness : 75,
          lightTemperature:
            d.lightTemperature === 'warm' || d.lightTemperature === 'cool'
              ? d.lightTemperature
              : 'daylight',
          thermostatCelsius:
            typeof d.thermostatCelsius === 'number' ? d.thermostatCelsius : 21,
          focusMode: Boolean(d.focusMode),
        },
      });
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, `users/${safeUid}`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const memoriesUnsub = onSnapshot(
    query(
      collection(db, 'users', safeUid, 'memories'),
      orderBy('updatedAt', 'desc')
    ),
    (snapshot) => {
      const items: MemoryFact[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          key: String(data.key || ''),
          value: String(data.value || ''),
          category: (data.category as MemoryCategory) || 'context',
          approved: Boolean(data.approved),
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
        };
      });
      callbacks.onMemories(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${safeUid}/memories`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const tasksUnsub = onSnapshot(
    query(
      collection(db, 'users', safeUid, 'tasks'),
      orderBy('updatedAt', 'desc')
    ),
    (snapshot) => {
      const items: TaskItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: String(data.title || ''),
          priority: (data.priority as TaskPriority) || 'medium',
          completed: Boolean(data.completed),
          dueLabel: typeof data.dueLabel === 'string' ? data.dueLabel : undefined,
          createdAt: timestampToIso(data.createdAt),
          updatedAt: timestampToIso(data.updatedAt),
        };
      });
      callbacks.onTasks(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${safeUid}/tasks`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const historyUnsub = onSnapshot(
    query(
      collection(db, 'users', safeUid, 'history'),
      orderBy('lastRunAt', 'desc')
    ),
    (snapshot) => {
      const items: SearchHistoryItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          query: String(data.query || ''),
          responsePreview:
            typeof data.responsePreview === 'string'
              ? data.responsePreview
              : undefined,
          aiMode: (data.aiMode as AiMode) || 'STANDARD',
          memoriesUsed: Array.isArray(data.memoriesUsed)
            ? data.memoriesUsed.map(String)
            : undefined,
          runCount: Number(data.runCount || 1),
          createdAt: timestampToIso(data.createdAt),
          lastRunAt: timestampToIso(data.lastRunAt),
        };
      });
      callbacks.onHistory(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${safeUid}/history`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  return () => {
    profileUnsub();
    memoriesUnsub();
    tasksUnsub();
    historyUnsub();
  };
}

export async function saveCloudMonitor(
  uid: string,
  topic: MonitorTopic,
  isNew: boolean
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(topic.id);
  const path = `users/${safeUid}/monitors/${safeId}`;
  try {
    const ref = doc(db, 'users', safeUid, 'monitors', safeId);
    if (!isNew) {
      await updateDoc(ref, {
        query: topic.query.trim().slice(0, 240),
        label: topic.label.trim().slice(0, 120),
        category: topic.category,
        officialOnly: Boolean(topic.officialOnly),
        intervalMinutes: Math.max(5, Math.min(1440, Math.round(topic.intervalMinutes || 60))),
        status: topic.status,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: safeUid,
        query: topic.query.trim().slice(0, 240),
        label: topic.label.trim().slice(0, 120),
        category: topic.category,
        officialOnly: Boolean(topic.officialOnly),
        intervalMinutes: Math.max(5, Math.min(1440, Math.round(topic.intervalMinutes || 60))),
        status: topic.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudMonitor(
  uid: string,
  monitorId: string
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(monitorId);
  const path = `users/${safeUid}/monitors/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'monitors', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCloudKnowledgeDoc(
  uid: string,
  item: KnowledgeDocItem
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(item.id);
  const path = `users/${safeUid}/knowledgeDocs/${safeId}`;
  try {
    await setDoc(doc(db, 'users', safeUid, 'knowledgeDocs', safeId), {
      userId: safeUid,
      fileName: item.fileName.trim().slice(0, 180) || 'Document',
      mimeType: item.mimeType.slice(0, 120) || 'text/plain',
      byteSize: Math.max(0, Math.min(20_000_000, Math.round(item.byteSize))),
      chunkCount: Math.max(0, Math.min(500, Math.round(item.chunkCount))),
      status: item.status,
      checksum: item.checksum ? item.checksum.slice(0, 128) : undefined,
      enabled: Boolean(item.enabled),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function toggleCloudKnowledgeDoc(
  uid: string,
  docId: string,
  enabled: boolean
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(docId);
  const path = `users/${safeUid}/knowledgeDocs/${safeId}`;
  try {
    await updateDoc(doc(db, 'users', safeUid, 'knowledgeDocs', safeId), {
      enabled: Boolean(enabled),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveCloudKnowledgeChunksBatch(
  uid: string,
  chunks: KnowledgeChunkItem[]
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const path = `users/${safeUid}/knowledgeChunks`;
  try {
    for (let i = 0; i < chunks.length; i += 350) {
      const slice = chunks.slice(i, i + 350);
      const batch = writeBatch(db);
      for (const ch of slice) {
        const safeId = sanitizeId(ch.id);
        const safeDocId = sanitizeId(ch.docId);
        batch.set(doc(db, 'users', safeUid, 'knowledgeChunks', safeId), {
          userId: safeUid,
          docId: safeDocId,
          docName: ch.docName.slice(0, 180),
          sectionLabel: ch.sectionLabel.slice(0, 120) || `Chunk ${ch.chunkIndex + 1}`,
          chunkIndex: Math.max(0, Math.round(ch.chunkIndex)),
          text: ch.text.slice(0, 3500),
          embedding: ch.embedding.slice(0, 4096),
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudKnowledgeDocWithChunks(
  uid: string,
  docId: string,
  chunkIds: string[]
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeDocId = sanitizeId(docId);
  const path = `users/${safeUid}/knowledgeDocs/${safeDocId}`;
  try {
    for (let i = 0; i < chunkIds.length; i += 400) {
      const batch = writeBatch(db);
      for (const cid of chunkIds.slice(i, i + 400)) {
        batch.delete(doc(db, 'users', safeUid, 'knowledgeChunks', sanitizeId(cid)));
      }
      await batch.commit();
    }
    await deleteDoc(doc(db, 'users', safeUid, 'knowledgeDocs', safeDocId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCloudIntegrationStatus(
  uid: string,
  item: ConnectedIntegrationItem
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(item.id);
  const path = `users/${safeUid}/integrations/${safeId}`;
  try {
    await setDoc(doc(db, 'users', safeUid, 'integrations', safeId), {
      userId: safeUid,
      provider: item.provider,
      label: item.label.slice(0, 120),
      baseUrl: item.baseUrl ? item.baseUrl.slice(0, 300) : '',
      status: item.status,
      entityCount: Math.max(0, Math.round(item.entityCount || 0)),
      lastVerifiedAt: item.lastVerifiedAt || new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudIntegrationStatus(
  uid: string,
  integrationId: string
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(integrationId);
  const path = `users/${safeUid}/integrations/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'integrations', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCloudAuditLog(
  uid: string,
  entry: ExecutionLogEntry
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(entry.id);
  const path = `users/${safeUid}/auditLogs/${safeId}`;
  try {
    await setDoc(doc(db, 'users', safeUid, 'auditLogs', safeId), {
      userId: safeUid,
      command: (entry.command || 'command').slice(0, 300),
      intent: (entry.intent || 'action').slice(0, 120),
      source: entry.source,
      status: entry.status,
      detail: (entry.detail || 'Executed').slice(0, 1000),
      verified: Boolean(entry.verified),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeUserKnowledgeAndIntegrations(
  uid: string,
  callbacks: {
    onDocs: (docs: KnowledgeDocItem[]) => void;
    onChunks: (chunks: KnowledgeChunkItem[]) => void;
    onIntegrations: (items: ConnectedIntegrationItem[]) => void;
    onAuditLogs: (logs: ExecutionLogEntry[]) => void;
    onError: (err: Error) => void;
  }
): () => void {
  const safeUid = sanitizeId(uid);

  const docsUnsub = onSnapshot(
    query(collection(db, 'users', safeUid, 'knowledgeDocs'), orderBy('updatedAt', 'desc')),
    (snapshot) => {
      callbacks.onDocs(
        snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: safeUid,
            fileName: String(data.fileName || ''),
            mimeType: String(data.mimeType || 'text/plain'),
            byteSize: Number(data.byteSize || 0),
            chunkCount: Number(data.chunkCount || 0),
            status: (data.status as KnowledgeDocItem['status']) || 'ready',
            checksum: typeof data.checksum === 'string' ? data.checksum : undefined,
            enabled: data.enabled === undefined ? true : Boolean(data.enabled),
            createdAt: timestampToIso(data.createdAt),
            updatedAt: timestampToIso(data.updatedAt),
          };
        })
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${safeUid}/knowledgeDocs`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const chunksUnsub = onSnapshot(
    collection(db, 'users', safeUid, 'knowledgeChunks'),
    (snapshot) => {
      callbacks.onChunks(
        snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: safeUid,
            docId: String(data.docId || ''),
            docName: String(data.docName || ''),
            sectionLabel: String(data.sectionLabel || 'Section'),
            chunkIndex: Number(data.chunkIndex || 0),
            text: String(data.text || ''),
            embedding: Array.isArray(data.embedding)
              ? data.embedding.map((n: unknown) => Number(n) || 0)
              : [],
            createdAt: timestampToIso(data.createdAt),
          };
        })
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${safeUid}/knowledgeChunks`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const integrationsUnsub = onSnapshot(
    collection(db, 'users', safeUid, 'integrations'),
    (snapshot) => {
      callbacks.onIntegrations(
        snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: safeUid,
            provider:
              data.provider === 'home_assistant' ? 'home_assistant' : 'windows_companion',
            label: String(data.label || ''),
            baseUrl: typeof data.baseUrl === 'string' ? data.baseUrl : undefined,
            status: (data.status as ConnectedIntegrationItem['status']) || 'disconnected',
            entityCount: Number(data.entityCount || 0),
            lastVerifiedAt:
              typeof data.lastVerifiedAt === 'string' ? data.lastVerifiedAt : undefined,
            createdAt: timestampToIso(data.createdAt),
            updatedAt: timestampToIso(data.updatedAt),
          };
        })
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${safeUid}/integrations`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const auditUnsub = onSnapshot(
    query(collection(db, 'users', safeUid, 'auditLogs'), orderBy('createdAt', 'desc')),
    (snapshot) => {
      callbacks.onAuditLogs(
        snapshot.docs.slice(0, 60).map((d) => {
          const data = d.data();
          return {
            id: d.id,
            command: String(data.command || ''),
            intent: String(data.intent || 'action'),
            source: (data.source as ExecutionLogEntry['source']) || 'local',
            status: (data.status as ExecutionLogEntry['status']) || 'COMPLETED',
            detail: String(data.detail || ''),
            verified: Boolean(data.verified),
            createdAt: timestampToIso(data.createdAt),
          };
        })
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${safeUid}/auditLogs`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  return () => {
    docsUnsub();
    chunksUnsub();
    integrationsUnsub();
    auditUnsub();
  };
}

export async function saveCloudSkill(
  uid: string,
  skill: SkillDefinition,
  isUpdate = false
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(skill.id);
  const path = `users/${safeUid}/skills/${safeId}`;
  try {
    const ref = doc(db, 'users', safeUid, 'skills', safeId);
    if (isUpdate) {
      await updateDoc(ref, {
        name: skill.name.slice(0, 120),
        description: skill.description.slice(0, 500),
        category: skill.category,
        triggerPattern: skill.triggerPattern.slice(0, 200),
        instructions: skill.instructions.slice(0, 4000),
        enabled: Boolean(skill.enabled),
        activeVersion: Math.max(1, Math.min(10000, Math.round(skill.activeVersion || 1))),
        testStatus: skill.testStatus,
        lastTestNote: (skill.lastTestNote || '').slice(0, 400),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: safeUid,
        name: skill.name.slice(0, 120),
        description: skill.description.slice(0, 500),
        category: skill.category,
        triggerPattern: skill.triggerPattern.slice(0, 200),
        instructions: skill.instructions.slice(0, 4000),
        enabled: Boolean(skill.enabled),
        activeVersion: Math.max(1, Math.min(10000, Math.round(skill.activeVersion || 1))),
        testStatus: skill.testStatus,
        lastTestNote: (skill.lastTestNote || '').slice(0, 400),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function saveCloudSkillVersion(
  uid: string,
  entry: SkillVersionEntry
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeSkillId = sanitizeId(entry.skillId);
  const safeVerId = sanitizeId(entry.id);
  const path = `users/${safeUid}/skills/${safeSkillId}/versions/${safeVerId}`;
  try {
    await setDoc(doc(db, 'users', safeUid, 'skills', safeSkillId, 'versions', safeVerId), {
      userId: safeUid,
      skillId: safeSkillId,
      version: Math.max(1, Math.min(10000, Math.round(entry.version))),
      instructions: entry.instructions.slice(0, 4000),
      triggerPattern: entry.triggerPattern.slice(0, 200),
      changelog: (entry.changelog || 'Updated skill revision').slice(0, 300),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteCloudSkill(uid: string, skillId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(skillId);
  const path = `users/${safeUid}/skills/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'skills', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeSkillVersions(
  uid: string,
  skillId: string,
  onVersions: (items: SkillVersionEntry[]) => void,
  onError: (err: Error) => void
): () => void {
  const safeUid = sanitizeId(uid);
  const safeSkillId = sanitizeId(skillId);
  const path = `users/${safeUid}/skills/${safeSkillId}/versions`;
  return onSnapshot(
    query(collection(db, 'users', safeUid, 'skills', safeSkillId, 'versions'), orderBy('version', 'desc')),
    (snap) => {
      onVersions(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: safeUid,
            skillId: safeSkillId,
            version: Number(data.version || 1),
            instructions: String(data.instructions || ''),
            triggerPattern: String(data.triggerPattern || ''),
            changelog: String(data.changelog || ''),
            createdAt: timestampToIso(data.createdAt),
          };
        })
      );
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}

export async function saveCloudProject(
  uid: string,
  project: ProjectEntry,
  isUpdate = false
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(project.id);
  const path = `users/${safeUid}/projects/${safeId}`;
  try {
    const ref = doc(db, 'users', safeUid, 'projects', safeId);
    if (isUpdate) {
      await updateDoc(ref, {
        name: project.name.slice(0, 120),
        rootPath: project.rootPath.slice(0, 300),
        language: project.language,
        framework: (project.framework || 'custom').slice(0, 80),
        status: project.status,
        lastTestStatus: project.lastTestStatus,
        lastTestSummary: (project.lastTestSummary || '').slice(0, 500),
        snapshotCount: Math.max(0, Math.round(project.snapshotCount || 0)),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: safeUid,
        name: project.name.slice(0, 120),
        rootPath: project.rootPath.slice(0, 300),
        language: project.language,
        framework: (project.framework || 'custom').slice(0, 80),
        status: project.status,
        lastTestStatus: project.lastTestStatus,
        lastTestSummary: (project.lastTestSummary || '').slice(0, 500),
        snapshotCount: Math.max(0, Math.round(project.snapshotCount || 0)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCloudProject(uid: string, projectId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(projectId);
  const path = `users/${safeUid}/projects/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'projects', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCloudBugReport(
  uid: string,
  report: BugFixReport,
  isUpdate = false
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(report.id);
  const safeProjectId = sanitizeId(report.projectId);
  const path = `users/${safeUid}/bugReports/${safeId}`;
  try {
    const ref = doc(db, 'users', safeUid, 'bugReports', safeId);
    if (isUpdate) {
      await updateDoc(ref, {
        rootCause: report.rootCause.slice(0, 2000),
        status: report.status,
        verificationSummary: report.verificationSummary.slice(0, 1000),
        regressionRisk: report.regressionRisk,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: safeUid,
        projectId: safeProjectId,
        title: report.title.slice(0, 180),
        errorInput: report.errorInput.slice(0, 3000),
        rootCause: report.rootCause.slice(0, 2000),
        status: report.status,
        verificationSummary: report.verificationSummary.slice(0, 1000),
        regressionRisk: report.regressionRisk,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function saveCloudCreativeAsset(
  uid: string,
  asset: CreativeAssetEntry,
  isUpdate = false
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(asset.id);
  const path = `users/${safeUid}/creativeAssets/${safeId}`;
  try {
    const ref = doc(db, 'users', safeUid, 'creativeAssets', safeId);
    if (isUpdate) {
      await updateDoc(ref, {
        title: asset.title.slice(0, 140),
        category: asset.category.slice(0, 80),
        exportFormat: asset.exportFormat,
        specJson: asset.specJson.slice(0, 16000),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: safeUid,
        dimension: asset.dimension,
        title: asset.title.slice(0, 140),
        category: asset.category.slice(0, 80),
        exportFormat: asset.exportFormat,
        specJson: asset.specJson.slice(0, 16000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCloudCreativeAsset(uid: string, assetId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(assetId);
  const path = `users/${safeUid}/creativeAssets/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'creativeAssets', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCloudContact(
  uid: string,
  contact: ContactEntry,
  isUpdate = false
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(contact.id);
  const path = `users/${safeUid}/contacts/${safeId}`;
  try {
    const ref = doc(db, 'users', safeUid, 'contacts', safeId);
    if (isUpdate) {
      await updateDoc(ref, {
        name: contact.name.slice(0, 120),
        phone: contact.phone.slice(0, 40),
        email: (contact.email || '').slice(0, 140),
        relation: (contact.relation || '').slice(0, 80),
        aliases: (contact.aliases || '').slice(0, 160),
        consentToCall: Boolean(contact.consentToCall),
        vip: Boolean(contact.vip),
        source: contact.source,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: safeUid,
        name: contact.name.slice(0, 120),
        phone: contact.phone.slice(0, 40),
        email: (contact.email || '').slice(0, 140),
        relation: (contact.relation || '').slice(0, 80),
        aliases: (contact.aliases || '').slice(0, 160),
        consentToCall: Boolean(contact.consentToCall),
        vip: Boolean(contact.vip),
        source: contact.source,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCloudContact(uid: string, contactId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(contactId);
  const path = `users/${safeUid}/contacts/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'contacts', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCloudCallLog(uid: string, entry: CallLogEntry): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(entry.id);
  const path = `users/${safeUid}/callLogs/${safeId}`;
  try {
    await setDoc(doc(db, 'users', safeUid, 'callLogs', safeId), {
      userId: safeUid,
      contactName: (entry.contactName || 'Unknown').slice(0, 120),
      phone: (entry.phone || 'Unknown').slice(0, 40),
      direction: entry.direction,
      method: entry.method,
      status: entry.status,
      note: (entry.note || '').slice(0, 300),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveCloudWorkflow(
  uid: string,
  workflow: AutomationWorkflow,
  isUpdate = false
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(workflow.id);
  const path = `users/${safeUid}/workflows/${safeId}`;
  try {
    const ref = doc(db, 'users', safeUid, 'workflows', safeId);
    if (isUpdate) {
      await updateDoc(ref, {
        name: workflow.name.slice(0, 140),
        triggerType: workflow.triggerType,
        triggerValue: workflow.triggerValue.slice(0, 240),
        actionType: workflow.actionType,
        actionPayload: workflow.actionPayload.slice(0, 600),
        enabled: Boolean(workflow.enabled),
        runCount: Math.max(0, Math.round(workflow.runCount || 0)),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: safeUid,
        name: workflow.name.slice(0, 140),
        triggerType: workflow.triggerType,
        triggerValue: workflow.triggerValue.slice(0, 240),
        actionType: workflow.actionType,
        actionPayload: workflow.actionPayload.slice(0, 600),
        enabled: Boolean(workflow.enabled),
        runCount: Math.max(0, Math.round(workflow.runCount || 0)),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCloudWorkflow(uid: string, workflowId: string): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(workflowId);
  const path = `users/${safeUid}/workflows/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', safeUid, 'workflows', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCloudAgentRun(
  uid: string,
  run: MultiAgentRun,
  isUpdate = false
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const safeId = sanitizeId(run.id);
  const path = `users/${safeUid}/agentRuns/${safeId}`;
  try {
    const ref = doc(db, 'users', safeUid, 'agentRuns', safeId);
    if (isUpdate) {
      await updateDoc(ref, {
        status: run.status,
        activeRole: run.activeRole,
        stepCount: Math.max(1, Math.min(50, Math.round(run.stepCount || 1))),
        summary: (run.summary || 'Processing').slice(0, 1500),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        userId: safeUid,
        goal: run.goal.slice(0, 400),
        status: run.status,
        activeRole: run.activeRole,
        stepCount: Math.max(1, Math.min(50, Math.round(run.stepCount || 1))),
        summary: (run.summary || 'Started multi-agent plan').slice(0, 1500),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export function subscribeUserStudioCollections(
  uid: string,
  callbacks: {
    onSkills: (items: SkillDefinition[]) => void;
    onProjects: (items: ProjectEntry[]) => void;
    onBugReports: (items: BugFixReport[]) => void;
    onCreativeAssets: (items: CreativeAssetEntry[]) => void;
    onContacts: (items: ContactEntry[]) => void;
    onCallLogs: (items: CallLogEntry[]) => void;
    onWorkflows: (items: AutomationWorkflow[]) => void;
    onAgentRuns: (items: MultiAgentRun[]) => void;
    onError: (err: Error) => void;
  }
): () => void {
  const safeUid = sanitizeId(uid);

  const sub = <T>(
    colName: string,
    orderField: string,
    mapDoc: (id: string, data: Record<string, unknown>) => T,
    emit: (items: T[]) => void
  ) =>
    onSnapshot(
      query(collection(db, 'users', safeUid, colName), orderBy(orderField, 'desc')),
      (snap) => emit(snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>))),
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, `users/${safeUid}/${colName}`);
        } catch (wrapped) {
          callbacks.onError(wrapped as Error);
        }
      }
    );

  const unsubs = [
    sub<SkillDefinition>(
      'skills',
      'updatedAt',
      (id, d) => ({
        id,
        userId: safeUid,
        name: String(d.name || ''),
        description: String(d.description || ''),
        category: (d.category as SkillDefinition['category']) || 'automation',
        triggerPattern: String(d.triggerPattern || ''),
        instructions: String(d.instructions || ''),
        enabled: Boolean(d.enabled),
        activeVersion: Number(d.activeVersion || 1),
        testStatus: (d.testStatus as SkillDefinition['testStatus']) || 'untested',
        lastTestNote: typeof d.lastTestNote === 'string' ? d.lastTestNote : undefined,
        createdAt: timestampToIso(d.createdAt),
        updatedAt: timestampToIso(d.updatedAt),
      }),
      callbacks.onSkills
    ),
    sub<ProjectEntry>(
      'projects',
      'updatedAt',
      (id, d) => ({
        id,
        userId: safeUid,
        name: String(d.name || ''),
        rootPath: String(d.rootPath || ''),
        language: (d.language as ProjectEntry['language']) || 'typescript',
        framework: String(d.framework || 'custom'),
        status: (d.status as ProjectEntry['status']) || 'active',
        lastTestStatus: (d.lastTestStatus as ProjectEntry['lastTestStatus']) || 'unknown',
        lastTestSummary: typeof d.lastTestSummary === 'string' ? d.lastTestSummary : undefined,
        snapshotCount: Number(d.snapshotCount || 0),
        createdAt: timestampToIso(d.createdAt),
        updatedAt: timestampToIso(d.updatedAt),
      }),
      callbacks.onProjects
    ),
    sub<BugFixReport>(
      'bugReports',
      'updatedAt',
      (id, d) => ({
        id,
        userId: safeUid,
        projectId: String(d.projectId || ''),
        title: String(d.title || ''),
        errorInput: String(d.errorInput || ''),
        rootCause: String(d.rootCause || ''),
        status: (d.status as BugFixReport['status']) || 'diagnosed',
        verificationSummary: String(d.verificationSummary || ''),
        regressionRisk: (d.regressionRisk as BugFixReport['regressionRisk']) || 'low',
        createdAt: timestampToIso(d.createdAt),
        updatedAt: timestampToIso(d.updatedAt),
      }),
      callbacks.onBugReports
    ),
    sub<CreativeAssetEntry>(
      'creativeAssets',
      'updatedAt',
      (id, d) => ({
        id,
        userId: safeUid,
        dimension: (d.dimension as CreativeAssetEntry['dimension']) || '3d',
        title: String(d.title || ''),
        category: String(d.category || 'custom'),
        exportFormat: (d.exportFormat as CreativeAssetEntry['exportFormat']) || 'glb',
        specJson: String(d.specJson || '{}'),
        createdAt: timestampToIso(d.createdAt),
        updatedAt: timestampToIso(d.updatedAt),
      }),
      callbacks.onCreativeAssets
    ),
    sub<ContactEntry>(
      'contacts',
      'updatedAt',
      (id, d) => ({
        id,
        userId: safeUid,
        name: String(d.name || ''),
        phone: String(d.phone || ''),
        email: typeof d.email === 'string' ? d.email : undefined,
        relation: typeof d.relation === 'string' ? d.relation : undefined,
        aliases: typeof d.aliases === 'string' ? d.aliases : undefined,
        consentToCall: Boolean(d.consentToCall),
        vip: Boolean(d.vip),
        source: (d.source as ContactEntry['source']) || 'local',
        createdAt: timestampToIso(d.createdAt),
        updatedAt: timestampToIso(d.updatedAt),
      }),
      callbacks.onContacts
    ),
    sub<CallLogEntry>(
      'callLogs',
      'createdAt',
      (id, d) => ({
        id,
        userId: safeUid,
        contactName: String(d.contactName || ''),
        phone: String(d.phone || ''),
        direction: (d.direction as CallLogEntry['direction']) || 'outgoing',
        method: (d.method as CallLogEntry['method']) || 'tel_uri',
        status: (d.status as CallLogEntry['status']) || 'initiated',
        note: typeof d.note === 'string' ? d.note : undefined,
        createdAt: timestampToIso(d.createdAt),
      }),
      callbacks.onCallLogs
    ),
    sub<AutomationWorkflow>(
      'workflows',
      'updatedAt',
      (id, d) => ({
        id,
        userId: safeUid,
        name: String(d.name || ''),
        triggerType: (d.triggerType as AutomationWorkflow['triggerType']) || 'manual',
        triggerValue: String(d.triggerValue || ''),
        actionType: (d.actionType as AutomationWorkflow['actionType']) || 'speak_alert',
        actionPayload: String(d.actionPayload || ''),
        enabled: Boolean(d.enabled),
        runCount: Number(d.runCount || 0),
        createdAt: timestampToIso(d.createdAt),
        updatedAt: timestampToIso(d.updatedAt),
      }),
      callbacks.onWorkflows
    ),
    sub<MultiAgentRun>(
      'agentRuns',
      'updatedAt',
      (id, d) => ({
        id,
        userId: safeUid,
        goal: String(d.goal || ''),
        status: (d.status as MultiAgentRun['status']) || 'completed',
        activeRole: (d.activeRole as MultiAgentRun['activeRole']) || 'planner',
        stepCount: Number(d.stepCount || 1),
        summary: String(d.summary || ''),
        createdAt: timestampToIso(d.createdAt),
        updatedAt: timestampToIso(d.updatedAt),
      }),
      callbacks.onAgentRuns
    ),
  ];

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
