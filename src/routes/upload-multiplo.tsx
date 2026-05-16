import { useCallback, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { UploadCloud, FileText, CheckCircle2, XCircle, Loader2, Sparkles, Trash2, RotateCw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { handleDbError } from "@/lib/handle-error";

export const Route = createFileRoute("/upload-multiplo")({
  head: () => ({ meta: [{ title: "Upload multiplo CV — CV Analyzer" }] }),
  component: UploadMultiploPage,
});

type UploadStatus = "in_attesa" | "caricamento" | "caricato" | "errore";
type AIStatus = "in_attesa" | "in_elaborazione" | "completato" | "errore";

type Item = {
  id: string;
  file: File;
  uploadStatus: UploadStatus;
  aiStatus: AIStatus;
  errorMsg?: string;
  candidatoId?: string;
};

const MAX_SIZE = 10 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function inferNameFromFilename(filename: string): { nome: string; cognome: string } {
  // Try to extract "Nome Cognome" from filename (strip extension, common separators)
  const base = filename.replace(/\.pdf$/i, "").replace(/[_\-.]+/g, " ").trim();
  const parts = base.split(/\s+/).filter((p) => p && !/^cv$/i.test(p) && !/^curriculum$/i.test(p));
  if (parts.length === 0) return { nome: "Candidato", cognome: "Sconosciuto" };
  if (parts.length === 1) return { nome: parts[0], cognome: "—" };
  return { nome: parts[0], cognome: parts.slice(1).join(" ") };
}

function UploadStatusBadge({ s }: { s: UploadStatus }) {
  if (s === "in_attesa") return <Badge variant="outline">In attesa</Badge>;
  if (s === "caricamento")
    return (
      <Badge className="bg-sky-500/15 text-sky-700 border border-sky-500/30 dark:text-sky-400">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Caricamento…
      </Badge>
    );
  if (s === "caricato")
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-400">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Caricato
      </Badge>
    );
  return (
    <Badge className="bg-destructive/15 text-destructive border border-destructive/30">
      <XCircle className="mr-1 h-3 w-3" /> Errore
    </Badge>
  );
}

function AIStatusBadge({ s }: { s: AIStatus }) {
  if (s === "in_attesa") return <Badge variant="outline">In attesa</Badge>;
  if (s === "in_elaborazione")
    return (
      <Badge className="bg-violet-500/15 text-violet-700 border border-violet-500/30 dark:text-violet-400">
        <Sparkles className="mr-1 h-3 w-3 animate-pulse" /> In elaborazione
      </Badge>
    );
  if (s === "completato")
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-400">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Completato
      </Badge>
    );
  return (
    <Badge className="bg-destructive/15 text-destructive border border-destructive/30">
      <XCircle className="mr-1 h-3 w-3" /> Errore
    </Badge>
  );
}

function UploadMultiploPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const accepted: Item[] = [];
    const rejected: string[] = [];
    Array.from(files).forEach((f) => {
      if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
        rejected.push(`${f.name}: non è un PDF`);
        return;
      }
      if (f.size > MAX_SIZE) {
        rejected.push(`${f.name}: supera 10 MB`);
        return;
      }
      accepted.push({
        id: crypto.randomUUID(),
        file: f,
        uploadStatus: "in_attesa",
        aiStatus: "in_attesa",
      });
    });
    if (rejected.length > 0) {
      toast.error(`${rejected.length} file ignorati`, { description: rejected.slice(0, 3).join("\n") });
    }
    if (accepted.length > 0) {
      setItems((prev) => [...prev, ...accepted]);
    }
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const processOne = useCallback(
    async (item: Item) => {
      updateItem(item.id, { uploadStatus: "caricamento", errorMsg: undefined });
      try {
        const { nome, cognome } = inferNameFromFilename(item.file.name);
        const safeName = `${nome}-${cognome}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const path = `${crypto.randomUUID()}-${safeName}.pdf`;
        const { error: upErr } = await supabase.storage.from("cvs").upload(path, item.file, {
          contentType: "application/pdf",
          upsert: false,
        });
        if (upErr) throw new Error("Errore upload storage");

        const { data: inserted, error: insErr } = await supabase
          .from("candidati")
          .insert({
            nome,
            cognome,
            cv_path: path,
            cv_filename: item.file.name,
          })
          .select("id")
          .single();
        if (insErr || !inserted) {
          await supabase.storage.from("cvs").remove([path]);
          throw new Error("Errore creazione candidato");
        }

        updateItem(item.id, {
          uploadStatus: "caricato",
          candidatoId: inserted.id,
          aiStatus: "in_elaborazione",
        });

        // Trigger AI extraction (extract_only mode)
        const { error: fnErr } = await supabase.functions.invoke("analizza-cv", {
          body: { candidato_id: inserted.id, extract_only: true },
        });
        if (fnErr) {
          updateItem(item.id, {
            aiStatus: "errore",
            errorMsg: "Estrazione AI fallita",
          });
        } else {
          updateItem(item.id, { aiStatus: "completato" });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Errore sconosciuto";
        handleDbError(e, "upload-multiplo");
        updateItem(item.id, {
          uploadStatus: "errore",
          aiStatus: "errore",
          errorMsg: msg,
        });
      }
    },
    [updateItem],
  );

  const startProcessing = useCallback(async () => {
    const pending = items.filter((i) => i.uploadStatus === "in_attesa" || i.uploadStatus === "errore");
    if (pending.length === 0) {
      toast.info("Nessun file da elaborare");
      return;
    }
    setIsProcessing(true);
    for (const it of pending) {
      // Read latest version from state — but it's fine to use snapshot since we just push status updates
      await processOne(it);
    }
    setIsProcessing(false);
    toast.success("Elaborazione completata");
  }, [items, processOne]);

  const summary = items.reduce(
    (acc, it) => {
      if (it.uploadStatus === "caricato") acc.uploaded++;
      if (it.aiStatus === "completato") acc.processed++;
      if (it.uploadStatus === "errore" || it.aiStatus === "errore") acc.errors++;
      return acc;
    },
    { uploaded: 0, processed: 0, errors: 0 },
  );

  const allDone =
    items.length > 0 &&
    !isProcessing &&
    items.every((i) => i.uploadStatus !== "in_attesa" && i.uploadStatus !== "caricamento");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Upload multiplo CV</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Carica più CV in formato PDF contemporaneamente. Per ogni file viene creato un candidato e avviata
          automaticamente l'estrazione delle informazioni principali.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`mb-6 rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
          dragActive ? "border-primary bg-primary/5" : "border-border bg-card"
        }`}
      >
        <UploadCloud className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">
          Trascina qui i PDF oppure seleziona i file
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Solo PDF, massimo 10 MB per file</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="mt-4"
          onClick={() => inputRef.current?.click()}
        >
          Seleziona file
        </Button>
      </div>

      {items.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {items.length} file in coda · {summary.uploaded} caricati · {summary.processed} elaborati ·{" "}
            <span className={summary.errors > 0 ? "text-destructive" : ""}>{summary.errors} errori</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setItems([])}
              disabled={isProcessing}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Svuota lista
            </Button>
            <Button onClick={startProcessing} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Elaborazione…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Avvia caricamento
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {items.map((it) => (
            <div key={it.id} className="flex flex-wrap items-center gap-3 p-3">
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{it.file.name}</p>
                <p className="text-xs text-muted-foreground">{formatSize(it.file.size)}</p>
                {it.errorMsg && (
                  <p className="mt-0.5 text-xs text-destructive">{it.errorMsg}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Upload:</span>
                  <UploadStatusBadge s={it.uploadStatus} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">AI:</span>
                  <AIStatusBadge s={it.aiStatus} />
                </div>
                {(it.uploadStatus === "errore" || it.aiStatus === "errore") && !isProcessing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => processOne(it)}
                    title="Riprova"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </Button>
                )}
                {!isProcessing && it.uploadStatus !== "caricato" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeItem(it.id)}
                    title="Rimuovi"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {allDone && (
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <h2 className="text-base font-semibold text-foreground">Riepilogo elaborazione</h2>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md bg-muted/40 p-3">
              <div className="text-2xl font-semibold">{summary.uploaded}</div>
              <div className="text-xs text-muted-foreground">CV caricati</div>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                {summary.processed}
              </div>
              <div className="text-xs text-muted-foreground">Elaborati correttamente</div>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <div className="text-2xl font-semibold text-destructive">{summary.errors}</div>
              <div className="text-xs text-muted-foreground">Con errore</div>
            </div>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            I candidati sono stati creati. Visualizzali nella sezione{" "}
            <Link to="/candidati" className="font-medium text-primary hover:underline">
              Candidati
            </Link>{" "}
            per assegnare una posizione o avviare l'analisi AI completa.
          </div>
        </div>
      )}
    </div>
  );
}
