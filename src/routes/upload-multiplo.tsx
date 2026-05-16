import { useCallback, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Upload,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { handleDbError } from "@/lib/handle-error";
import { generateAutoTags, mergeTags, tagChipClass } from "@/lib/auto-tags";
import { findDuplicates, type CandidatoLite } from "@/lib/duplicate-check";

export const Route = createFileRoute("/upload-multiplo")({
  head: () => ({ meta: [{ title: "Upload multiplo CV — CV Analyzer" }] }),
  component: UploadMultiploPage,
});

type Posizione = Pick<Tables<"posizioni">, "id" | "titolo" | "stato">;

type FileStatus =
  | "in_attesa"
  | "caricamento"
  | "estrazione"
  | "analisi"
  | "completato"
  | "errore";

type FileRow = {
  id: string;
  file: File;
  status: FileStatus;
  errore?: string;
  candidato_id?: string;
  tags?: string[];
  duplicato?: CandidatoLite | null;
};

const STATUS_LABEL: Record<FileStatus, string> = {
  in_attesa: "In attesa",
  caricamento: "In caricamento...",
  estrazione: "Estrazione dati...",
  analisi: "Analisi AI...",
  completato: "Completato",
  errore: "Errore",
};

const MAX_FILE_MB = 10;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function UploadMultiploPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [posizioneId, setPosizioneId] = useState<string>("");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: posizioni } = useQuery({
    queryKey: ["posizioni", "aperte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posizioni")
        .select("id, titolo, stato")
        .eq("stato", "aperta")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Posizione[];
    },
  });

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const next: FileRow[] = [];
    const skipped: string[] = [];
    Array.from(incoming).forEach((f) => {
      if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
        skipped.push(`${f.name} (non è un PDF)`);
        return;
      }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        skipped.push(`${f.name} (supera ${MAX_FILE_MB} MB)`);
        return;
      }
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: "in_attesa",
      });
    });
    if (skipped.length) {
      toast.error(`File ignorati: ${skipped.join(", ")}`);
    }
    if (next.length) {
      setFiles((prev) => [...prev, ...next]);
    }
  }, []);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const updateRow = (id: string, patch: Partial<FileRow>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const completati = files.filter((f) => f.status === "completato").length;
  const errori = files.filter((f) => f.status === "errore");
  const processati = completati + errori.length;
  const total = files.length;
  const progressPct = total > 0 ? (processati / total) * 100 : 0;
  const allDone = isProcessing === false && step === 2 && processati === total && total > 0;

  const canStart = files.length > 0 && !!posizioneId && !isProcessing;

  const mergeWithExisting = async (row: FileRow) => {
    if (!row.candidato_id || !row.duplicato) return;
    const newId = row.candidato_id;
    const existingId = row.duplicato.id;
    try {
      // Clona le analisi appena create assegnandole al candidato esistente,
      // poi rimuove quelle del nuovo (la tabella analisi non consente UPDATE).
      const { data: nuoveAnalisi } = await supabase
        .from("analisi")
        .select("posizioni_ids, risultato, best_posizione_id, best_score, modello")
        .eq("candidato_id", newId);
      if (nuoveAnalisi && nuoveAnalisi.length > 0) {
        await supabase.from("analisi").insert(
          nuoveAnalisi.map((a) => ({ ...a, candidato_id: existingId })),
        );
        await supabase.from("analisi").delete().eq("candidato_id", newId);
      }
      // Recupera il record nuovo per pulire lo storage
      const { data: nuovo } = await supabase
        .from("candidati")
        .select("cv_path, tags, informazioni_estratte")
        .eq("id", newId)
        .single();
      // Aggiorna esistente con tag (merge) e CV se mancante
      const { data: esistente } = await supabase
        .from("candidati")
        .select("tags, cv_path")
        .eq("id", existingId)
        .single();
      const mergedTags = mergeTags(esistente?.tags ?? [], nuovo?.tags ?? []);
      const updatePayload: { tags: string[]; cv_path?: string } = { tags: mergedTags };
      if (!esistente?.cv_path && nuovo?.cv_path) {
        updatePayload.cv_path = nuovo.cv_path;
      }
      await supabase.from("candidati").update(updatePayload).eq("id", existingId);
      // Elimina record duplicato (e lo storage solo se non è stato spostato sull'esistente)
      await supabase.from("candidati").delete().eq("id", newId);
      if (nuovo?.cv_path && updatePayload.cv_path !== nuovo.cv_path) {
        await supabase.storage.from("cvs").remove([nuovo.cv_path]).catch(() => {});
      }
      updateRow(row.id, { duplicato: null, candidato_id: existingId });
      toast.success("Profilo unito con quello esistente");
    } catch (e) {
      handleDbError(e, "Errore unione duplicato");
    }
  };

  const processOne = async (row: FileRow) => {
    const f = row.file;
    let cv_path: string | null = null;
    let candidato_id: string | null = null;
    try {
      // 1. Upload
      updateRow(row.id, { status: "caricamento", errore: undefined });
      const baseName = f.name.replace(/\.pdf$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const path = `${crypto.randomUUID()}-${baseName || "cv"}.pdf`;
      const { error: upErr } = await supabase.storage.from("cvs").upload(path, f, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (upErr) throw upErr;
      cv_path = path;

      // 2. Create candidato record con placeholder chiari.
      // L'edge function "analizza-cv" sovrascrive nome/cognome con i dati
      // estratti dal CV al termine dell'analisi.
      const { data: cand, error: insErr } = await supabase
        .from("candidati")
        .insert({
          nome: "In elaborazione...",
          cognome: "",
          posizione_id: posizioneId,
          cv_path,
          cv_filename: f.name,
          stato_analisi: "in_attesa",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      candidato_id = cand.id;
      updateRow(row.id, { candidato_id: cand.id });

      // 3. Edge function: estrazione + analisi
      updateRow(row.id, { status: "estrazione" });
      // Lascia un attimo per il render dello stato intermedio
      await new Promise((r) => setTimeout(r, 150));
      updateRow(row.id, { status: "analisi" });

      const { data: fnData, error: fnErr } = await supabase.functions.invoke("analizza-cv", {
        body: {
          candidato_id: cand.id,
          posizioni_ids: [posizioneId],
          extract_only: false,
        },
      });
      if (fnErr) throw fnErr;
      if (fnData?.error) throw new Error(fnData.error);

      // 4. Genera tag automatici e rilevazione duplicati post-estrazione
      const estratte = fnData?.informazioni_estratte ?? null;
      const autoTags = generateAutoTags(estratte);
      if (autoTags.length > 0) {
        await supabase
          .from("candidati")
          .update({ tags: autoTags })
          .eq("id", cand.id);
      }

      let duplicato: CandidatoLite | null = null;
      const email = estratte?.email as string | undefined;
      const telefono = estratte?.telefono as string | undefined;
      if (email || telefono) {
        const dups = await findDuplicates({ email, telefono, excludeId: cand.id });
        if (dups.length > 0) duplicato = dups[0];
      }

      updateRow(row.id, { status: "completato", tags: autoTags, duplicato });
    } catch (e: any) {
      // Cleanup best-effort se siamo riusciti a caricare ma non a creare il candidato
      if (cv_path && !candidato_id) {
        await supabase.storage.from("cvs").remove([cv_path]).catch(() => {});
      }
      const msg =
        typeof e?.message === "string" ? e.message : "Errore sconosciuto";
      // eslint-disable-next-line no-console
      console.error("[upload-multiplo]", row.file.name, e);
      updateRow(row.id, { status: "errore", errore: msg });
    }
  };

  const start = async () => {
    if (!canStart) return;
    setStep(2);
    setIsProcessing(true);
    // Snapshot per garantire ordine sequenziale
    const queue = [...files];
    for (const row of queue) {
      await processOne(row);
    }
    setIsProcessing(false);
  };

  const reset = () => {
    setFiles([]);
    setPosizioneId("");
    setStep(1);
    setIsProcessing(false);
  };

  const downloadErrori = () => {
    if (!errori.length) return;
    const lines = [
      "Nome file,Errore",
      ...errori.map(
        (e) =>
          `"${e.file.name.replace(/"/g, '""')}","${(e.errore || "").replace(/"/g, '""')}"`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `errori-upload-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const posizioneSelezionata = useMemo(
    () => posizioni?.find((p) => p.id === posizioneId),
    [posizioni, posizioneId],
  );

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Upload multiplo CV</h1>
        <p className="text-sm text-muted-foreground">
          Carica più CV in una volta sola e analizzali contro una posizione aperta.
        </p>
      </div>

      {/* Stepper */}
      <ol className="mb-6 flex items-center gap-3 text-sm">
        <li className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
              step >= 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            1
          </span>
          <span className={step === 1 ? "font-medium" : "text-muted-foreground"}>
            Selezione e caricamento
          </span>
        </li>
        <span className="text-muted-foreground">—</span>
        <li className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
              step >= 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            2
          </span>
          <span className={step === 2 ? "font-medium" : "text-muted-foreground"}>
            Elaborazione e risultati
          </span>
        </li>
      </ol>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1 — Seleziona posizione e file</CardTitle>
            <CardDescription>
              Scegli la posizione contro cui valutare i candidati, poi aggiungi i PDF.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Posizione aperta *</label>
              <Select value={posizioneId} onValueChange={setPosizioneId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona una posizione…" />
                </SelectTrigger>
                <SelectContent>
                  {(posizioni ?? []).length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Nessuna posizione aperta disponibile
                    </div>
                  ) : (
                    posizioni!.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.titolo}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40"
              }`}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">
                Trascina qui i CV oppure clicca per selezionarli
              </p>
              <p className="text-xs text-muted-foreground">
                Solo PDF, max {MAX_FILE_MB} MB per file
              </p>
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
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {files.length} file selezionat{files.length === 1 ? "o" : "i"}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiles([])}
                    disabled={isProcessing}
                  >
                    Svuota
                  </Button>
                </div>
                <ul className="divide-y rounded-md border">
                  {files.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 px-3 py-2 text-sm"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{f.file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatSize(f.file.size)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(f.id);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={start} disabled={!canStart} size="lg">
                <Sparkles className="mr-2 h-4 w-4" />
                Avvia elaborazione
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2 — Elaborazione</CardTitle>
            <CardDescription>
              Posizione: <span className="font-medium">{posizioneSelezionata?.titolo ?? "—"}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {processati} di {total} completati
                </span>
                <span className="text-muted-foreground">
                  {completati} ✓ · {errori.length} ✗
                </span>
              </div>
              <Progress value={progressPct} />
            </div>

            <ul className="divide-y rounded-md border">
              {files.map((f) => (
                <li key={f.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate" title={f.file.name}>
                      {f.file.name}
                    </span>
                    <StatusBadge row={f} />
                  </div>
                  {f.tags && f.tags.length > 0 && (
                    <div className="mt-2 ml-7 flex flex-wrap gap-1">
                      {f.tags.slice(0, 6).map((t) => (
                        <Badge key={t} variant="outline" className={`text-xs ${tagChipClass(t)}`}>
                          {t}
                        </Badge>
                      ))}
                      {f.tags.length > 6 && (
                        <Badge variant="outline" className="text-xs">
                          +{f.tags.length - 6}
                        </Badge>
                      )}
                    </div>
                  )}
                  {f.duplicato && (
                    <div className="mt-2 ml-7 rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-amber-700 dark:text-amber-400">
                            ⚠ Possibile duplicato: {f.duplicato.nome} {f.duplicato.cognome}
                          </div>
                          <div className="text-muted-foreground">
                            Già presente dal{" "}
                            {new Date(f.duplicato.created_at).toLocaleDateString("it-IT")}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void mergeWithExisting(f)}
                        >
                          Usa profilo esistente
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {allDone && (
              <div className="rounded-md border bg-muted/30 p-4">
                <h3 className="mb-2 text-sm font-semibold">Riepilogo</h3>
                <ul className="mb-4 space-y-1 text-sm">
                  <li>
                    <span className="font-medium">{total}</span> CV caricati
                  </li>
                  <li className="text-emerald-600 dark:text-emerald-400">
                    <span className="font-medium">{completati}</span> analizzati con successo
                  </li>
                  <li className="text-destructive">
                    <span className="font-medium">{errori.length}</span> con errore
                  </li>
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link to="/ranking">
                      Vai ai risultati
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  {errori.length > 0 && (
                    <Button variant="outline" onClick={downloadErrori}>
                      <Download className="mr-2 h-4 w-4" />
                      Scarica lista errori
                    </Button>
                  )}
                  <Button variant="ghost" onClick={reset}>
                    Nuovo upload
                  </Button>
                </div>
              </div>
            )}

            {!allDone && (
              <div className="flex justify-end">
                <Button variant="ghost" disabled={isProcessing} onClick={reset}>
                  Annulla e ricomincia
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ row }: { row: FileRow }) {
  if (row.status === "completato") {
    return (
      <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-600">
        <CheckCircle2 className="h-3 w-3" />
        Completato
      </Badge>
    );
  }
  if (row.status === "errore") {
    return (
      <Badge variant="destructive" className="gap-1" title={row.errore}>
        <AlertCircle className="h-3 w-3" />
        Errore: {(row.errore || "").slice(0, 60)}
      </Badge>
    );
  }
  if (row.status === "in_attesa") {
    return <Badge variant="secondary">{STATUS_LABEL[row.status]}</Badge>;
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Loader2 className="h-3 w-3 animate-spin" />
      {STATUS_LABEL[row.status]}
    </Badge>
  );
}
