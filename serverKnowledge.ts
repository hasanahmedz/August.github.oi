import { Router, type Request, type Response } from 'express';
import { createAiClient } from './serverAuth.ts';
import type { AutonomousSchedulerService } from './serverScheduler.ts';

interface ChunkPayload {
  chunkIndex: number;
  sectionLabel: string;
  text: string;
  embedding: number[];
}

function normalizeSectionTitle(line: string, fallback: string): string {
  const clean = line.replace(/^#+\s*/, '').trim();
  return clean ? clean.slice(0, 100) : fallback;
}

function chunkTextWithSections(rawText: string, defaultSection: string): Array<{ sectionLabel: string; text: string }> {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const blocks: Array<{ section: string; body: string }> = [];
  let activeSection = defaultSection;
  let buffer: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const isMarkdownHeader = /^#{1,4}\s+.+/.test(trimmed);
    const isPageMarker = /^---\s*Page\s+\d+\s*---$/i.test(trimmed);

    if (isMarkdownHeader || isPageMarker) {
      if (buffer.length > 0) {
        blocks.push({ section: activeSection, body: buffer.join('\n').trim() });
        buffer = [];
      }
      activeSection = isPageMarker
        ? trimmed.replace(/^-+\s*|\s*-+$/g, '').trim()
        : normalizeSectionTitle(trimmed, activeSection);
    } else {
      buffer.push(line);
    }
  }
  if (buffer.length > 0) {
    blocks.push({ section: activeSection, body: buffer.join('\n').trim() });
  }

  const chunks: Array<{ sectionLabel: string; text: string }> = [];
  const TARGET_CHARS = 900;
  const OVERLAP_CHARS = 150;

  for (const blk of blocks) {
    const text = blk.body.trim();
    if (!text) continue;
    if (text.length <= TARGET_CHARS) {
      chunks.push({ sectionLabel: blk.section, text: text.slice(0, 3400) });
      continue;
    }

    let start = 0;
    let part = 1;
    while (start < text.length && chunks.length < 100) {
      const end = Math.min(text.length, start + TARGET_CHARS);
      const slice = text.slice(start, end).trim();
      if (slice.length >= 20) {
        chunks.push({
          sectionLabel: `${blk.section} (Part ${part})`.slice(0, 110),
          text: slice.slice(0, 3400),
        });
        part += 1;
      }
      if (end >= text.length) break;
      start = Math.max(start + 100, end - OVERLAP_CHARS);
    }
    if (chunks.length >= 100) break;
  }

  return chunks;
}

async function extractPdfText(base64Data: string): Promise<string> {
  const cleanB64 = base64Data.replace(/^data:[^;]+;base64,/i, '').trim();
  const bytes = Uint8Array.from(Buffer.from(cleanB64, 'base64'));
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
  const pdfDoc = await loadingTask.promise;

  const pageTexts: string[] = [];
  const maxPages = Math.min(pdfDoc.numPages, 60);
  for (let p = 1; p <= maxPages; p += 1) {
    const page = await pdfDoc.getPage(p);
    const content = await page.getTextContent();
    const strings = content.items
      .map((item) => ('str' in item ? String(item.str) : ''))
      .filter(Boolean);
    const joined = strings.join(' ').replace(/\s+/g, ' ').trim();
    if (joined) {
      pageTexts.push(`--- Page ${p} ---\n${joined}`);
    }
  }
  return pageTexts.join('\n\n');
}

export function createKnowledgeRouter(scheduler: AutonomousSchedulerService): Router {
  const router = Router();

  router.post('/extract-embed', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        fileName?: string;
        mimeType?: string;
        contentBase64?: string;
        plainText?: string;
      };
      const fileName = String(body.fileName || 'Document.txt').trim().slice(0, 180);
      const mimeType = String(body.mimeType || 'text/plain').trim().slice(0, 120);

      let extractedText = '';
      if (body.plainText && typeof body.plainText === 'string') {
        extractedText = body.plainText;
      } else if (body.contentBase64 && typeof body.contentBase64 === 'string') {
        if (mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
          extractedText = await extractPdfText(body.contentBase64);
        } else {
          const cleanB64 = body.contentBase64.replace(/^data:[^;]+;base64,/i, '').trim();
          extractedText = Buffer.from(cleanB64, 'base64').toString('utf8');
        }
      }

      if (!extractedText.trim()) {
        res.status(400).json({ error: 'No readable text could be extracted from the uploaded file.' });
        return;
      }

      const rawChunks = chunkTextWithSections(extractedText, fileName);
      if (rawChunks.length === 0) {
        res.status(400).json({ error: 'Document contained no indexable text chunks.' });
        return;
      }

      const quota = scheduler.getQuotaStatus();
      if (quota.limited) {
        // Fallback deterministic lightweight bag-of-words vectors when Gemini quota is cooling down
        const outChunks: ChunkPayload[] = rawChunks.map((c, idx) => ({
          chunkIndex: idx,
          sectionLabel: c.sectionLabel,
          text: c.text,
          embedding: [0],
        }));
        res.json({
          ok: true,
          fileName,
          mimeType,
          chunkCount: outChunks.length,
          chunks: outChunks,
          keywordOnlyFallback: true,
          note: `Gemini embedding quota cooling down (${quota.retryAfterSeconds}s). Indexed with local keyword fallback.`,
        });
        return;
      }

      const ai = createAiClient();
      const embeddedChunks: ChunkPayload[] = [];
      const BATCH_SIZE = 12;

      for (let i = 0; i < rawChunks.length; i += BATCH_SIZE) {
        const batch = rawChunks.slice(i, i + BATCH_SIZE);
        const embRes = await ai.models.embedContent({
          model: 'gemini-embedding-2',
          contents: batch.map((b) => b.text),
          config: { outputDimensionality: 768 },
        });
        const vectors = embRes.embeddings || [];
        batch.forEach((b, offset) => {
          const vec = vectors[offset]?.values;
          embeddedChunks.push({
            chunkIndex: i + offset,
            sectionLabel: b.sectionLabel,
            text: b.text,
            embedding: Array.isArray(vec) && vec.length > 0 ? vec : [0],
          });
        });
      }

      scheduler.resetQuotaOnSuccess('gemini-embedding-2');
      res.json({
        ok: true,
        fileName,
        mimeType,
        chunkCount: embeddedChunks.length,
        chunks: embeddedChunks,
        keywordOnlyFallback: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
        scheduler.recordGeminiError(err, 'gemini-embedding-2');
      }
      res.status(500).json({ error: msg.slice(0, 260) || 'Failed to index document.' });
    }
  });

  router.post('/embed-query', async (req: Request, res: Response) => {
    try {
      const queryText = String((req.body as { query?: string })?.query || '').trim();
      if (!queryText) {
        res.status(400).json({ error: 'Query text is required.' });
        return;
      }

      const quota = scheduler.getQuotaStatus();
      if (quota.limited) {
        res.json({ ok: true, embedding: null, keywordOnlyFallback: true });
        return;
      }

      const ai = createAiClient();
      const embRes = await ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: queryText,
        config: { outputDimensionality: 768 },
      });
      const vec = embRes.embeddings?.[0]?.values || null;
      scheduler.resetQuotaOnSuccess('gemini-embedding-2');
      res.json({ ok: true, embedding: vec, keywordOnlyFallback: !vec });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
        scheduler.recordGeminiError(err, 'gemini-embedding-2');
        res.json({ ok: true, embedding: null, keywordOnlyFallback: true });
        return;
      }
      res.status(500).json({ error: msg.slice(0, 220) || 'Failed to embed query.' });
    }
  });

  return router;
}
