import React, { useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import type { KnowledgeChunkItem, KnowledgeDocItem } from '../types/assistant';

export const KnowledgeVaultDrawer: React.FC<{
  docs: KnowledgeDocItem[];
  chunks: KnowledgeChunkItem[];
  uploading: boolean;
  error?: string | null;
  onUploadFile: (file: File) => Promise<void>;
  onToggleDoc: (docId: string, enabled: boolean) => Promise<void>;
  onDeleteDoc: (docId: string) => Promise<void>;
}> = ({
  docs,
  chunks,
  uploading,
  error,
  onUploadFile,
  onToggleDoc,
  onDeleteDoc,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    await onUploadFile(file);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3.5 text-slate-200 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            World Knowledge Vault (RAG)
          </span>
        </div>
        <span className="font-mono tabular-nums text-[11px] text-slate-400">
          {docs.length} docs · {chunks.length} chunks
        </span>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-slate-800/80 bg-slate-900/50 px-2.5 py-2 text-[11px] text-slate-400">
        <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
        <span>
          Uploaded documents stay scoped to your personal vault and are cited inline as{' '}
          <code className="text-sky-300">[Doc · Section]</code> when answering questions.
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`rounded-lg border border-dashed p-3 text-center transition cursor-pointer ${
          dragActive
            ? 'border-sky-400 bg-sky-500/10'
            : 'border-slate-700 bg-slate-900/40 hover:border-slate-600'
        }`}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md,.json,.csv"
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className="flex flex-col items-center gap-1.5 text-xs">
          {uploading ? (
            <>
              <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
              <span className="text-sky-200">Extracting sections & indexing embeddings...</span>
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 text-sky-400" />
              <span className="text-slate-200 font-medium">
                Drop PDF, Markdown, TXT, or JSON here (or click to browse)
              </span>
              <span className="text-[11px] text-slate-500">
                Indexed locally & synced to your Firestore Knowledge Vault
              </span>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-[11px] text-rose-400">{error}</p>}

      {docs.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-2">
          No documents indexed yet. Upload notes, manuals, or PDFs to query them with citations.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {docs.map((d) => {
            const docChunks = chunks.filter((c) => c.docId === d.id);
            const isExpanded = expandedDocId === d.id;
            return (
              <div key={d.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedDocId(isExpanded ? null : d.id)}
                    className="flex items-center gap-1.5 min-w-0 text-left flex-1"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span className="font-medium text-slate-100 truncate">{d.fileName}</span>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono tabular-nums text-[10px] text-slate-400">
                      {d.chunkCount || docChunks.length}ch
                    </span>
                    <button
                      type="button"
                      onClick={() => void onToggleDoc(d.id, !d.enabled)}
                      className={`px-1.5 py-0.5 rounded text-[10px] border ${
                        d.enabled
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-slate-700 bg-slate-800 text-slate-400'
                      }`}
                    >
                      {d.enabled ? 'Active' : 'Muted'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteDoc(d.id)}
                      title="Delete document and chunks"
                      className="p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-slate-800 space-y-1.5 max-h-36 overflow-y-auto">
                    {docChunks.length === 0 ? (
                      <div className="text-[11px] text-slate-500">No chunks loaded.</div>
                    ) : (
                      docChunks.slice(0, 6).map((c) => (
                        <div key={c.id} className="rounded bg-slate-950/80 p-1.5 text-[11px]">
                          <div className="text-sky-300 font-medium truncate">
                            {c.sectionLabel}
                          </div>
                          <p className="text-slate-400 line-clamp-2 mt-0.5">{c.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
