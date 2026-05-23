import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  CalendarIcon, Sparkles, Trophy, AlertTriangle, CheckCircle2, SkipForward, Clock, Zap, FileSearch,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/analisi-periodo")({
  head: () => ({ meta: [{ title: "Analisi su periodo — CV Analyzer" }] }),
  component: AnalisiPeriodoPage,
});

type Posizione = Tables<"posizioni">;
type Candidato = Tables<"candidati">;

type ProgressRow = {
  candidato_id: string;
  nome: string;
  status: "pending" | "running" | "ok" | "skip" | "error";
  message?: string;
};

const SHORTCUTS = [
  { label: "Ultimi 30 giorni", days: 30 },
  { label: "Ultimi 3 mesi", days: 90 },
  { label: "Ultimi 6 mesi", days: 180 },
  { label: "Tutto lo storico", days: null as number | null },
];

function AnalisiPeriodoPage() {
  const [posizioneId, setPosizioneId] = useState<string>("");
  const [from, setFrom] = useState<Date | undefined>(undefined);
  const [to, setTo] = useState<Date | undefined>(undefined);
  const [analysisMode, setAnalysisMode] = useState<"veloce" | "completa">("veloce");
  const [onlyWithInfo, setOnlyWithInfo] = useState(true);
  const [onlyNotAnalyzed, setOnlyNotAnalyzed] = useState(true);
  const [lingueFilter, setLingueFilter] = useState<string>("");
  const [minEsperienza, setMinEsperienza] = useState<string>("");

  const effectiveOnlyWithInfo = analysisMode === "completa" ? false : onlyWithInfo;

  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [running, setRunning] = useState(false);
  const [doneSummary, setDoneSummary] = useState<{ ok: number; skip: number; err: number } | null>(null);

  const { data: posizioni } = useQuery({
    queryKey: ["posizioni", "aperte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posizioni")
        .select("id, titolo, reparto, stato, macrocategoria")
        .eq("stato", "aperta")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pick<Posizione, "id" | "titolo" | "reparto" | "stato" | "macrocategoria">[];
    },
  });

  const { data: candidatiAll } = useQuery({
    queryKey: ["candidati", "periodo-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidati")
        .select("id, nome, cognome, created_at, stato_analisi, informazioni_estratte")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pick<Candidato, "id" | "nome" | "cognome" | "created_at" | "stato_analisi" | "informazioni_estratte">[];
    },
  });

  const { data: analisiEsistenti } = useQuery({
    queryKey: ["analisi", "per-posizione", posizioneId],
    enabled: !!posizioneId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analisi")
        .select("candidato_id, posizioni_ids");
      if (error) throw error;
      const set = new Set<string>();
      for (const r of data ?? []) {
        if (Array.isArray(r.posizioni_ids) && r.posizioni_ids.includes(posizioneId)) {
          set.add(r.candidato_id);
        }
      }
      return set;
    },
  });

  const applyShortcut = (days: number | null) => {
    if (days === null) {
      setFrom(undefined);
      setTo(undefined);
      return;
    }
    const now = new Date();
    const f = new Date();
    f.setDate(now.getDate() - days);
    setFrom(f);
    setTo(now);
  };

  const filteredCandidati = useMemo(() => {
    if (!candidatiAll) return [];
    const minEsp = parseInt(minEsperienza, 10);
    const lingueTokens = lingueFilter
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

    return candidatiAll.filter((c) => {
      const created = new Date(c.created_at);
      if (from && created < startOfDay(from)) return false;
      if (to && created > endOfDay(to)) return false;

      const info = c.informazioni_estratte as Record<string, unknown> | null;
      const hasInfo = !!info && typeof info === "object" && Object.keys(info).length > 0;

      if (effectiveOnlyWithInfo && (!hasInfo || c.stato_analisi === "errore_estrazione")) return false;
      if (onlyNotAnalyzed && analisiEsistenti?.has(c.id)) return false;

      if (lingueTokens.length > 0) {
        const lingueArr = Array.isArray((info as any)?.lingue) ? (info as any).lingue : [];
        const lingueStr = lingueArr
          .map((l: any) => (typeof l === "string" ? l : l?.lingua ?? ""))
          .join(" ").toLowerCase();
        const ok = lingueTokens.every((t) => lingueStr.includes(t));
        if (!ok) return false;
      }

      if (!isNaN(minEsp) && minEsp > 0) {
        const anni = Number((info as any)?.anni_esperienza_totale ?? (info as any)?.anni_esperienza ?? 0);
        if (!anni || anni < minEsp) return false;
      }

      return true;
    });
  }, [candidatiAll, from, to, effectiveOnlyWithInfo, onlyNotAnalyzed, lingueFilter, minEsperienza, analisiEsistenti]);

  const canStart = !!posizioneId && filteredCandidati.length > 0 && !running;

  const startAnalysis = async () => {
    if (!posizioneId) return;
    setRunning(true);
    setDoneSummary(null);
    const initial: ProgressRow[] = filteredCandidati.map((c) => ({
      candidato_id: c.id,
      nome: `${c.nome} ${c.cognome}`.trim() || "—",
      status: "pending",
    }));
    setProgress(initial);

    let ok = 0, skip = 0, err = 0;

    for (let i = 0; i < initial.length; i++) {
      const row = initial[i];
      setProgress((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "running" } : r));

      // skip se già analizzato per la posizione
      if (analisiEsistenti?.has(row.candidato_id)) {
        skip++;
        setProgress((prev) => prev.map((r, idx) => idx === i
          ? { ...r, status: "skip", message: "Già analizzato per questa posizione" }
          : r));
        continue;
      }

      const cand = candidatiAll?.find((c) => c.id === row.candidato_id);
      const info = cand?.informazioni_estratte as Record<string, unknown> | null;
      if (analysisMode === "veloce" && (!info || typeof info !== "object" || Object.keys(info).length === 0)) {
        skip++;
        setProgress((prev) => prev.map((r, idx) => idx === i
          ? { ...r, status: "skip", message: "Dati non disponibili (informazioni_estratte vuoto)" }
          : r));
        continue;
      }

      try {
        const body = analysisMode === "completa"
          ? {
              candidato_id: row.candidato_id,
              posizioni_ids: [posizioneId],
              reanalysis_mode: false,
              force_reextract: true,
            }
          : {
              candidato_id: row.candidato_id,
              posizioni_ids: [posizioneId],
              reanalysis_mode: true,
            };
        const { data, error } = await supabase.functions.invoke("analizza-cv", { body });
        if (error) throw new Error(extractInvokeError(error) || "Errore");
        if ((data as any)?.error) throw new Error((data as any).error);
        ok++;
        setProgress((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "ok" } : r));
      } catch (e: any) {
        err++;
        setProgress((prev) => prev.map((r, idx) => idx === i
          ? { ...r, status: "error", message: e?.message ?? "Errore" }
          : r));
      }

      // delay tra candidati: 2s in modalità completa (rilettura PDF), 1s in modalità veloce
      if (i < initial.length - 1) {
        await new Promise((r) => setTimeout(r, analysisMode === "completa" ? 2000 : 1000));
      }
    }

    setDoneSummary({ ok, skip, err });
    setRunning(false);
    toast.success(`Analisi completata: ${ok} OK, ${skip} saltati, ${err} errori`);
  };

  const completedCount = progress.filter((r) => r.status !== "pending" && r.status !== "running").length;
  const progressPct = progress.length > 0 ? Math.round((completedCount / progress.length) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Analisi su periodo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Rianalizza candidati già caricati per una nuova posizione, usando i dati
          già estratti dai CV (più veloce, nessuna rilettura del PDF).
        </p>
      </div>

      {/* STEP 1 — Configura */}
      <Card>
        <CardHeader>
          <CardTitle>1. Configura l'analisi</CardTitle>
          <CardDescription>Posizione, periodo di caricamento, filtri.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-2 max-w-md">
            <Label>Posizione aperta *</Label>
            <Select value={posizioneId} onValueChange={setPosizioneId}>
              <SelectTrigger><SelectValue placeholder="Seleziona una posizione…" /></SelectTrigger>
              <SelectContent>
                {(posizioni ?? []).length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">Nessuna posizione aperta</div>
                 ) : posizioni!.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.titolo} — {p.macrocategoria}{p.reparto ? ` (${p.reparto})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Modalità di analisi</Label>
            <RadioGroup
              value={analysisMode}
              onValueChange={(v) => setAnalysisMode(v as "veloce" | "completa")}
              className="grid gap-2 sm:grid-cols-2"
            >
              <label
                htmlFor="mode-veloce"
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors",
                  analysisMode === "veloce"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <RadioGroupItem value="veloce" id="mode-veloce" className="mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Zap className="h-4 w-4 text-emerald-600" />
                    Veloce — usa dati già estratti
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Riusa le informazioni già estratte dai CV. Più rapido e consuma meno crediti.
                  </p>
                </div>
              </label>
              <label
                htmlFor="mode-completa"
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors",
                  analysisMode === "completa"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <RadioGroupItem value="completa" id="mode-completa" className="mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileSearch className="h-4 w-4 text-amber-600" />
                    Completa — rilegge il PDF con l'IA
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Estrae di nuovo i dati dal PDF prima di rivalutare il candidato.
                  </p>
                </div>
              </label>
            </RadioGroup>

            {analysisMode === "completa" && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                <span>
                  Questa modalità rilancia l'estrazione completa del PDF via AI.
                  È più lenta e consuma più crediti API.
                </span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label>Periodo di caricamento CV</Label>
            <div className="flex flex-wrap gap-2">
              {SHORTCUTS.map((s) => (
                <Button key={s.label} type="button" variant="outline" size="sm"
                  onClick={() => applyShortcut(s.days)}>
                  <Clock className="h-3 w-3" />{s.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <DatePickerField label="Da" value={from} onChange={setFrom} />
              <DatePickerField label="A" value={to} onChange={setTo} />
              {(from || to) && (
                <Button type="button" variant="ghost" size="sm" className="self-end"
                  onClick={() => { setFrom(undefined); setTo(undefined); }}>
                  Pulisci date
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Filtri opzionali</Label>
            <div className="space-y-2">
              <label className={cn(
                "flex items-center gap-2 text-sm",
                analysisMode === "completa" ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
              )}>
                <Checkbox
                  checked={effectiveOnlyWithInfo}
                  disabled={analysisMode === "completa"}
                  onCheckedChange={(c) => setOnlyWithInfo(!!c)}
                />
                Solo candidati con dati estratti (esclude estrazioni fallite)
                {analysisMode === "completa" && (
                  <span className="text-xs text-muted-foreground">(disabilitato in modalità Completa)</span>
                )}
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={onlyNotAnalyzed} onCheckedChange={(c) => setOnlyNotAnalyzed(!!c)} />
                Solo candidati non ancora analizzati per questa posizione
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label className="text-xs">Lingue richieste (separa con virgola)</Label>
                <Input placeholder="es. inglese, tedesco" value={lingueFilter}
                  onChange={(e) => setLingueFilter(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Anni di esperienza minimi</Label>
                <Input type="number" min={0} placeholder="es. 3" value={minEsperienza}
                  onChange={(e) => setMinEsperienza(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">
            <span className="font-semibold text-foreground">{filteredCandidati.length}</span>{" "}
            <span className="text-muted-foreground">
              candidati trovati nel periodo selezionato
            </span>
          </div>
        </CardContent>
      </Card>

      {/* STEP 2 — Avvia */}
      <Card>
        <CardHeader>
          <CardTitle>2. Avvia analisi</CardTitle>
          <CardDescription>
            {analysisMode === "completa"
              ? "L'IA rilegge ogni PDF prima di valutarlo. Delay di 2s tra candidati, più lento e costoso."
              : "L'analisi usa i dati già estratti — non rilegge i PDF. Delay di 1s tra candidati."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={startAnalysis} disabled={!canStart} size="lg">
            <Sparkles className="h-4 w-4" />
            {running
              ? `Analisi in corso… (${completedCount}/${progress.length})`
              : `Avvia analisi su ${filteredCandidati.length} candidati`}
          </Button>

          {progress.length > 0 && (
            <div className="space-y-3">
              <Progress value={progressPct} />
              <div className="max-h-80 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {progress.map((r) => (
                  <div key={r.candidato_id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="truncate">{r.nome}</span>
                    <StatusBadge row={r} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* STEP 3 — Risultati */}
      {doneSummary && (
        <Card>
          <CardHeader>
            <CardTitle>3. Risultati</CardTitle>
            <CardDescription>Riepilogo dell'analisi su periodo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <SummaryTile icon={<CheckCircle2 className="h-4 w-4" />} label="Analizzati" value={doneSummary.ok} tone="ok" />
              <SummaryTile icon={<SkipForward className="h-4 w-4" />} label="Saltati" value={doneSummary.skip} tone="muted" />
              <SummaryTile icon={<AlertTriangle className="h-4 w-4" />} label="Errori" value={doneSummary.err} tone="error" />
            </div>
            <Button asChild>
              <Link to="/ranking" search={{ posizione: posizioneId } as any}>
                <Trophy className="h-4 w-4" />
                Vai al ranking di questa posizione
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DatePickerField({
  label, value, onChange,
}: { label: string; value: Date | undefined; onChange: (d: Date | undefined) => void }) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline"
            className={cn("w-[180px] justify-start text-left font-normal",
              !value && "text-muted-foreground")}>
            <CalendarIcon className="h-4 w-4" />
            {value ? format(value, "dd MMM yyyy", { locale: it }) : "—"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={value} onSelect={onChange} initialFocus
            className={cn("p-3 pointer-events-auto")} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function StatusBadge({ row }: { row: ProgressRow }) {
  if (row.status === "pending") return <Badge variant="outline">In coda</Badge>;
  if (row.status === "running") return <Badge>In corso…</Badge>;
  if (row.status === "ok") return <Badge className="bg-emerald-600 hover:bg-emerald-600">OK</Badge>;
  if (row.status === "skip") return (
    <span className="flex items-center gap-2">
      <Badge variant="secondary">Saltato</Badge>
      {row.message && <span className="text-xs text-muted-foreground truncate max-w-[260px]">{row.message}</span>}
    </span>
  );
  return (
    <span className="flex items-center gap-2">
      <Badge variant="destructive">Errore</Badge>
      {row.message && <span className="text-xs text-muted-foreground truncate max-w-[260px]">{row.message}</span>}
    </span>
  );
}

function SummaryTile({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone: "ok" | "muted" | "error" }) {
  const toneClass =
    tone === "ok" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
    : tone === "error" ? "border-destructive/30 bg-destructive/5 text-destructive"
    : "border-border bg-muted/40 text-foreground";
  return (
    <div className={cn("rounded-md border p-4", toneClass)}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide font-semibold">
        {icon}{label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function startOfDay(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function endOfDay(d: Date) {
  const x = new Date(d); x.setHours(23, 59, 59, 999); return x;
}

function extractInvokeError(error: unknown): string {
  if (!error) return "";
  const anyErr = error as any;
  const ctx = anyErr?.context;
  if (ctx && typeof ctx === "object") {
    if (typeof ctx.error === "string") return ctx.error;
    if (typeof ctx.body === "string") {
      try { const j = JSON.parse(ctx.body); if (j?.error) return String(j.error); } catch { /* ignore */ }
    }
  }
  return anyErr?.message ?? String(error);
}
