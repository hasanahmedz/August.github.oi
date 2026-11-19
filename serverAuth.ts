import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response, NextFunction } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let cachedProjectId: string | undefined;

function resolveFirebaseProjectId(): string | undefined {
  if (cachedProjectId) return cachedProjectId;
  try {
    const cfgPath = path.join(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { projectId?: string };
      if (parsed.projectId) {
        cachedProjectId = parsed.projectId;
        return cachedProjectId;
      }
    }
  } catch {
    // ignore
  }
  return process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
}

function getFirebaseAdminAuth() {
  const projectId = resolveFirebaseProjectId();
  const app = getApps().length > 0 ? getApp() : initializeApp(projectId ? { projectId } : {});
  return getAuth(app);
}

export function createAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Open Settings > Secrets to set your Gemini API key.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: 'v1beta',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface AuthenticatedRequest extends Request {
  verifiedUid?: string;
  verifiedEmail?: string;
}

/**
 * Verifies a Firebase ID token when Authorization: Bearer <token> is supplied.
 * Never passes checkRevoked=true (compatible with Starter Tier IAM permissions).
 */
export async function verifyOptionalFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Empty Bearer authorization token.' });
    return;
  }
  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    req.verifiedUid = decoded.uid;
    req.verifiedEmail = decoded.email;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
  }
}

/**
 * Wraps untrusted retrieved text (web snippets, OCR text, uploaded RAG chunks) in explicit
 * data-only delimiters to reduce indirect prompt injection exposure.
 */
export function wrapUntrustedContext(label: string, content: string, maxChars = 4000): string {
  const clean = String(content || '')
    .replace(/<<<UNTRUSTED_DATA[^>]*>>>/g, '')
    .replace(/<<<END_UNTRUSTED_DATA>>>/g, '')
    .slice(0, maxChars);
  return `<<<UNTRUSTED_DATA label="${label}">>>\n${clean}\n<<<END_UNTRUSTED_DATA>>>`;
}

/**
 * Validates user-supplied integration URLs against SSRF targets like cloud metadata endpoints.
 */
export function validateIntegrationUrl(rawUrl: string): { ok: true; url: string } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    return { ok: false, error: 'Invalid URL format. Include http:// or https://' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// URLs are permitted.' };
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === '169.254.169.254' ||
    host === 'metadata.google.internal' ||
    host.endsWith('.internal')
  ) {
    return { ok: false, error: 'Access to cloud metadata endpoints is blocked.' };
  }
  return { ok: true, url: parsed.toString().replace(/\/+$/, '') };
}
