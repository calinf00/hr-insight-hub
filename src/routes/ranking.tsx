import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Star,
  Eye,
  Download,
  Trophy,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import Papa from "papaparse";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { handleDbError } from "@/lib/handle-error";

export const Route = createFileRoute("/ranking")({
  head: () => ({ meta: [{ title: "Ranking candidati — CV Analyzer" }] }),
  component: RankingPage,
});

type Candidato = Tables<"candidati">;
type Posizione = Tables<"posizioni">;
type Analisi = Tables<"analisi"> & {
  candidati?: Pick<Candidato, "id" | "nome" | "cognome" | "informazioni_estratte" | "note"> | null;
};

interface Lingua {
  lingua: string;
  livello?: string;
}
interface Estratte {
  email?: string;
  telefono?: string;
  eta?: string;
  residenza?: string;
  nazionalita?: string;
  lingue?: Lingua[];
  titolo_studio?: string;
  istituto?: string;
  anni_esperienza?: string;
  ultimo_ruolo?: string;
  competenze_tecniche?: string[];
  certificazioni?: Array<string | { nome?: string }>;
  campi_personalizzati?: Record<string, string>;
}
interface Valutazione {
  posizione_id: string;
  titolo: string;
  punteggio: number;
  motivazione: string;
  punti_di_forza: string[];
  lacune: string[];
}
interface Risultato {
  valutazioni: Valutazione[];
  posizione_migliore_id: string | null;
  motivazione_migliore: string;
  suggerimenti: string[];
  punti_di_forza_generali: string[];
  non_adatto: boolean;
  spiegazione_non_adatto?: string | null;
}

type Fascia = "tutti" | "alto" | "medio" | "basso" | "non_idoneo";
type Periodo = "tutti" | "settimana" | "mese" | "custom";

const FASCE: { value: Fascia; label: string }[] = [
  { value: "tutti", label: "Tutti i punteggi" },
  { value: "alto", label: "Alto (80–100)" },
  { value: "medio", label: "Medio (60–79)" },
  { value: "basso", label: "Basso (40–59)" },
  { value: "non_idoneo", label: "Non idoneo (<40)" },
];

const PERIODI: { value: Periodo; label: string }[] = [
  { value: "tutti", label: "Tutte le date" },
  { value: "settimana", label: "Ultima settimana" },
  { value: "mese", label: "Ultimo mese" },
  { value: "custom", label: "Personalizzato" },
];

const INTERESSANTI_KEY = "cv-analyzer:interessanti";

function loadInteressanti(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(INTERESSANTI_KEY) || "[]"));
  } catch {
    return new Set();
  }
}
function saveInteressanti(set: Set<string>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(INTERESSANTI_KEY, JSON.stringify(Array.from(set)));
}

function fasciaFromScore(score: number | null | undefined): Fascia {
  if (score == null) return "non_idoneo";
  if (score >= 80) return "alto";
  if (score >= 60) return "medio";
  if (score >= 40) return "basso";
  return "non_idoneo";
}

function esitoLabel(score: number | null | undefined) {
  const f = fasciaFromScore(score);
  if (f === "alto") return { label: "Alto match", variant: "default" as const, className: "bg-emerald-600 hover:bg-emerald-600" };
  if (f === "medio") return { label: "Match medio", variant: "default" as const, className: "bg-amber-500 hover:bg-amber-500" };
  if (f === "basso") return { label: "Basso match", variant: "secondary" as const, className: "" };
  return { label: "Non idoneo", variant: "destructive" as const, className: "" };
}

function scoreBarColor(score: number) {
  if (score >= 80) return "bg-emerald-600";
  if (score >= 60) return "bg-amber-500";
  if (score >= 40) return "bg-orange-500";
  return "bg-destructive";
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type Row = {
  candidato_id: string;
  nome: string;
  cognome: string;
  punteggio: number;
  ultimo_ruolo: string;
  anni_esperienza: string;
  data_analisi: string;
  analisi: Analisi;
  estratte: Estratte | null;
  valutazioneCorrente: Valutazione | null;
};

function RankingPage() {
  const queryClient = useQueryClient();

  const [posizioneId, setPosizioneId] = useState<string>("");
  const [fascia, setFascia] = useState<Fascia>("tutti");
  const [periodo, setPeriodo] = useState<Periodo>("tutti");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [interessanti, setInteressanti] = useState<Set<string>>(() => loadInteressanti());
  const [openCandidatoId, setOpenCandidatoId] = useState<string | null>(null);

  const { data: posizioni } = useQuery({
    queryKey: ["ranking", "posizioni"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posizioni")
        .select("id, titolo, reparto, stato")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pick<Posizione, "id" | "titolo" | "reparto" | "stato">[];
    },
  });

  // Default posizione: la prima aperta
  useEffect(() => {
    if (!posizioneId && posizioni && posizioni.length > 0) {
      const firstOpen = posizioni.find((p) => p.stato === "aperta") ?? posizioni[0];
      setPosizioneId(firstOpen.id);
    }
  }, [posizioni, posizioneId]);

  const { data: analisi, isLoading } = useQuery({
    queryKey: ["ranking", "analisi", posizioneId],
    enabled: !!posizioneId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analisi")
        .select("*, candidati(id, nome, cognome, informazioni_estratte, note)")
        .contains("posizioni_ids", [posizioneId])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Analisi[];
    },
  });

  // Riga per candidato: l'ultima analisi che valuta la posizione selezionata
  const rows: Row[] = useMemo(() => {
    if (!analisi || !posizioneId) return [];
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const a of analisi) {
      if (seen.has(a.candidato_id)) continue;
      const r = a.risultato as unknown as Risultato | null;
      const val = r?.valutazioni?.find((v) => v.posizione_id === posizioneId) ?? null;
      if (!val) continue;
      seen.add(a.candidato_id);
      const estratte = (a.candidati?.informazioni_estratte as Estratte | null) ?? null;
      out.push({
        candidato_id: a.candidato_id,
        nome: a.candidati?.nome ?? "",
        cognome: a.candidati?.cognome ?? "",
        punteggio: val.punteggio ?? 0,
        ultimo_ruolo: estratte?.ultimo_ruolo ?? "—",
        anni_esperienza: estratte?.anni_esperienza ?? "—",
        data_analisi: a.created_at,
        analisi: a,
        estratte,
        valutazioneCorrente: val,
      });
    }
    // ordina per punteggio desc
    out.sort((x, y) => y.punteggio - x.punteggio);
    return out;
  }, [analisi, posizioneId]);

  const filtered: Row[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    let from: Date | null = null;
    let to: Date | null = null;
    if (periodo === "settimana") {
      from = new Date(now);
      from.setDate(now.getDate() - 7);
    } else if (periodo === "mese") {
      from = new Date(now);
      from.setMonth(now.getMonth() - 1);
    } else if (periodo === "custom") {
      if (customFrom) from = new Date(customFrom);
      if (customTo) {
        to = new Date(customTo);
        to.setHours(23, 59, 59, 999);
      }
    }
    return rows.filter((r) => {
      if (fascia !== "tutti" && fasciaFromScore(r.punteggio) !== fascia) return false;
      if (q) {
        const full = `${r.nome} ${r.cognome}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      if (from || to) {
        const d = new Date(r.data_analisi);
        if (from && d < from) return false;
        if (to && d > to) return false;
      }
      return true;
    });
  }, [rows, fascia, search, periodo, customFrom, customTo, /* re-evaluate on switching to custom */]);

  const toggleInteressante = (cid: string) => {
    setInteressanti((prev) => {
      const next = new Set(prev);
      next.has(cid) ? next.delete(cid) : next.add(cid);
      saveInteressanti(next);
      return next;
    });
  };

  const posizioneSel = useMemo(
    () => posizioni?.find((p) => p.id === posizioneId),
    [posizioni, posizioneId],
  );

  const exportCSV = () => {
    if (filtered.length === 0) {
      toast.error("Nessun dato da esportare");
      return;
    }
    const rowsCsv = filtered.map((r, i) => ({
      "#": i + 1,
      Nome: r.nome,
      Cognome: r.cognome,
      Punteggio: r.punteggio,
      Esito: esitoLabel(r.punteggio).label,
      "Ultimo ruolo": r.ultimo_ruolo,
      "Anni esperienza": r.anni_esperienza,
      "Data analisi": fmtDate(r.data_analisi),
      Interessante: interessanti.has(r.candidato_id) ? "Sì" : "",
    }));
    const csv = Papa.unparse(rowsCsv, { quotes: true });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const slug = (posizioneSel?.titolo ?? "ranking").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    a.download = `ranking-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase.from("candidati").update({ note }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ranking", "analisi"] });
      toast.success("Note salvate");
    },
    onError: (e: Error) => handleDbError(e, "ranking-note"),
  });

  const selectedRow = filtered.find((r) => r.candidato_id === openCandidatoId)
    ?? rows.find((r) => r.candidato_id === openCandidatoId)
    ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ranking candidati</h1>
          <p className="text-sm text-muted-foreground">
            Classifica dei candidati analizzati per una posizione specifica.
          </p>
        </div>
        <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Esporta CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtri</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-1.5">
              <Label className="text-xs">Posizione</Label>
              <Select value={posizioneId} onValueChange={setPosizioneId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona…" />
                </SelectTrigger>
                <SelectContent>
                  {(posizioni ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.titolo}
                      {p.stato === "chiusa" ? " (chiusa)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Fascia punteggio</Label>
              <Select value={fascia} onValueChange={(v) => setFascia(v as Fascia)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FASCE.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Periodo</Label>
              <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODI.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Ricerca per nome/cognome</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="es. Rossi"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {periodo === "custom" && (
              <>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Dal</Label>
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">Al</Label>
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {!posizioneId ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Seleziona una posizione per vedere il ranking.
            </div>
          ) : isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Caricamento…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nessun candidato analizzato per questi filtri.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Candidato</TableHead>
                    <TableHead className="min-w-[180px]">Punteggio</TableHead>
                    <TableHead>Esito</TableHead>
                    <TableHead>Ultimo ruolo</TableHead>
                    <TableHead>Anni esp.</TableHead>
                    <TableHead>Data analisi</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r, i) => {
                    const esito = esitoLabel(r.punteggio);
                    const isFav = interessanti.has(r.candidato_id);
                    return (
                      <TableRow key={r.candidato_id}>
                        <TableCell className="font-semibold tabular-nums">{i + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isFav && <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />}
                            <span className="font-medium">
                              {r.nome} {r.cognome}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <span className="w-10 text-sm font-semibold tabular-nums">
                              {r.punteggio}
                            </span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                              <div
                                className={`h-full ${scoreBarColor(r.punteggio)}`}
                                style={{ width: `${Math.min(100, Math.max(0, r.punteggio))}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={esito.variant} className={esito.className}>
                            {esito.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={r.ultimo_ruolo}>
                          {r.ultimo_ruolo}
                        </TableCell>
                        <TableCell>{r.anni_esperienza}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {fmtDate(r.data_analisi)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setOpenCandidatoId(r.candidato_id)}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              Vedi
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleInteressante(r.candidato_id)}
                              title={isFav ? "Rimuovi da interessanti" : "Segna come interessante"}
                            >
                              <Star
                                className={`h-4 w-4 ${isFav ? "fill-amber-500 text-amber-500" : "text-muted-foreground"}`}
                              />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CandidatoDrawer
        row={selectedRow}
        open={!!openCandidatoId}
        onOpenChange={(o) => !o && setOpenCandidatoId(null)}
        onSaveNote={(note) =>
          selectedRow && updateNoteMutation.mutate({ id: selectedRow.candidato_id, note })
        }
        savingNote={updateNoteMutation.isPending}
      />
    </div>
  );
}

function CandidatoDrawer({
  row,
  open,
  onOpenChange,
  onSaveNote,
  savingNote,
}: {
  row: Row | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaveNote: (note: string) => void;
  savingNote: boolean;
}) {
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    setNote(row?.analisi.candidati?.note ?? "");
  }, [row?.candidato_id, row?.analisi.candidati?.note]);

  if (!row) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-xl" />
      </Sheet>
    );
  }

  const e = row.estratte;
  const r = row.analisi.risultato as unknown as Risultato;
  const valutazioni = [...(r.valutazioni ?? [])].sort(
    (a, b) => (b.punteggio ?? 0) - (a.punteggio ?? 0),
  );
  const corrente = row.valutazioneCorrente;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {row.nome} {row.cognome}
          </SheetTitle>
          <SheetDescription>
            Analizzato il {fmtDate(row.data_analisi)}
            {row.analisi.modello ? ` • ${row.analisi.modello}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Dati estratti */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">Dati estratti dal CV</h3>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              <KV k="Email" v={e?.email} />
              <KV k="Telefono" v={e?.telefono} />
              <KV k="Età" v={e?.eta} />
              <KV k="Residenza" v={e?.residenza} />
              <KV k="Nazionalità" v={e?.nazionalita} />
              <KV k="Titolo di studio" v={e?.titolo_studio} />
              <KV k="Istituto" v={e?.istituto} />
              <KV k="Anni esperienza" v={e?.anni_esperienza} />
              <KV k="Ultimo ruolo" v={e?.ultimo_ruolo} />
              <KV
                k="Lingue"
                v={(e?.lingue ?? [])
                  .map((l) => `${l.lingua}${l.livello ? ` (${l.livello})` : ""}`)
                  .join(", ")}
              />
              <KV
                k="Competenze"
                v={(e?.competenze_tecniche ?? []).join(", ")}
                full
              />
              <KV k="Certificazioni" v={(e?.certificazioni ?? []).map((c) => typeof c === "string" ? c : (c?.nome ?? "")).filter(Boolean).join(", ")} full />
            </dl>
            {e?.campi_personalizzati && Object.keys(e.campi_personalizzati).length > 0 && (
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                {Object.entries(e.campi_personalizzati).map(([k, v]) => (
                  <KV key={k} k={k} v={v} />
                ))}
              </dl>
            )}
          </section>

          {/* Punteggi tutte le posizioni */}
          <section>
            <h3 className="mb-2 text-sm font-semibold">Punteggi per posizione</h3>
            {valutazioni.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna valutazione disponibile.</p>
            ) : (
              <div className="space-y-3">
                {valutazioni.map((v) => {
                  const isBest = v.posizione_id === r.posizione_migliore_id;
                  const isCorrente = corrente && v.posizione_id === corrente.posizione_id;
                  return (
                    <div key={v.posizione_id + v.titolo} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-1.5 font-medium">
                          {isBest && <Trophy className="h-3.5 w-3.5 text-amber-500" />}
                          {v.titolo}
                          {isCorrente && (
                            <Badge variant="outline" className="ml-1 text-[10px]">
                              corrente
                            </Badge>
                          )}
                        </span>
                        <span className="tabular-nums font-semibold">{v.punteggio}%</span>
                      </div>
                      <Progress value={v.punteggio} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Punti di forza / lacune per la posizione corrente */}
          {corrente && (
            <section className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Punti di forza
                </h4>
                {corrente.punti_di_forza?.length ? (
                  <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground marker:text-emerald-600">
                    {corrente.punti_di_forza.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
              <div>
                <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Lacune
                </h4>
                {corrente.lacune?.length ? (
                  <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground marker:text-amber-600">
                    {corrente.lacune.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
            </section>
          )}

          {/* Suggerimenti */}
          {r.suggerimenti?.length > 0 && (
            <section>
              <h4 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
                <Lightbulb className="h-4 w-4 text-primary" />
                Suggerimenti AI
              </h4>
              <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground marker:text-primary">
                {r.suggerimenti.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Note HR */}
          <section>
            <h4 className="mb-1.5 text-sm font-semibold">Note HR</h4>
            <Textarea
              rows={4}
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
              placeholder="Aggiungi una nota interna sul candidato…"
            />
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                onClick={() => onSaveNote(note)}
                disabled={savingNote || note === (row.analisi.candidati?.note ?? "")}
              >
                {savingNote ? "Salvataggio…" : "Salva note"}
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function KV({ k, v, full }: { k: string; v?: string | null; full?: boolean }) {
  if (!v) return null;
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="text-sm">{v}</dd>
    </div>
  );
}
