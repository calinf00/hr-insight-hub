import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Users, FileText, Search, X, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CandidatoFormDialog } from "@/components/candidato-form-dialog";
import { CvPreviewDialog } from "@/components/cv-preview-dialog";
import { ConfrontaCvDialog } from "@/components/confronta-cv-dialog";

export const Route = createFileRoute("/candidati")({
  head: () => ({ meta: [{ title: "Candidati — CV Analyzer" }] }),
  component: CandidatiPage,
});

type Lingua = { lingua: string; livello?: string };
type Estratte = {
  residenza?: string;
  lingue?: Lingua[];
  titolo_studio?: string;
  anni_esperienza?: string;
  ultimo_ruolo?: string;
  competenze_tecniche?: string[];
  _da_rivalutare?: boolean;
  _nota_rivalutare?: string;
};

type Candidato = Tables<"candidati"> & {
  posizioni?: { id: string; titolo: string; stato: string } | null;
};

type Vista = "attivi" | "archivio" | "rivalutare";
type StatoCand = "attivo" | "archivio" | "rivalutare";

const ANY = "__any__";

const ANNI_RANGES: { value: string; label: string; min: number; max: number }[] = [
  { value: "0-2", label: "0–2 anni", min: 0, max: 2 },
  { value: "3-5", label: "3–5 anni", min: 3, max: 5 },
  { value: "5-10", label: "5–10 anni", min: 5, max: 10 },
  { value: "10+", label: "10+ anni", min: 10, max: Number.POSITIVE_INFINITY },
];

type PeriodoPreset = "any" | "30d" | "3m" | "6m" | "1y" | "custom";
const PERIODO_OPZIONI: { value: PeriodoPreset; label: string }[] = [
  { value: "any", label: "Qualsiasi periodo" },
  { value: "30d", label: "Ultimi 30 giorni" },
  { value: "3m", label: "Ultimi 3 mesi" },
  { value: "6m", label: "Ultimi 6 mesi" },
  { value: "1y", label: "Ultimo anno" },
  { value: "custom", label: "Personalizzato" },
];

function presetToRange(p: PeriodoPreset): { from?: Date; to?: Date } {
  if (p === "any" || p === "custom") return {};
  const now = new Date();
  const from = new Date(now);
  if (p === "30d") from.setDate(now.getDate() - 30);
  else if (p === "3m") from.setMonth(now.getMonth() - 3);
  else if (p === "6m") from.setMonth(now.getMonth() - 6);
  else if (p === "1y") from.setFullYear(now.getFullYear() - 1);
  return { from, to: now };
}

function getEstratte(c: Candidato): Estratte {
  return (c.informazioni_estratte as Estratte | null) ?? {};
}

function statoCandidato(c: Candidato): StatoCand {
  const e = getEstratte(c);
  if (e._da_rivalutare) return "rivalutare";
  if (c.posizione_id && c.posizioni?.stato === "aperta") return "attivo";
  return "archivio";
}

function parseAnni(raw?: string): number | null {
  if (!raw) return null;
  const m = raw.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function StatoBadge({ stato }: { stato: StatoCand }) {
  if (stato === "attivo") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/20 dark:text-emerald-400">
        🟢 Attivo
      </Badge>
    );
  }
  if (stato === "rivalutare") {
    return (
      <Badge className="bg-amber-500/15 text-amber-700 border border-amber-500/30 hover:bg-amber-500/20 dark:text-amber-400">
        🟡 Da rivalutare
      </Badge>
    );
  }
  return (
    <Badge className="bg-sky-500/15 text-sky-700 border border-sky-500/30 hover:bg-sky-500/20 dark:text-sky-400">
      🔵 In archivio
    </Badge>
  );
}

function CandidatiPage() {
  const queryClient = useQueryClient();
  const [vista, setVista] = useState<Vista>("attivi");
  const [formOpen, setFormOpen] = useState(false);
  const [preview, setPreview] = useState<Candidato | null>(null);
  const [toDelete, setToDelete] = useState<Candidato | null>(null);

  // Filtri archivio
  const [search, setSearch] = useState("");
  const [filtroLingua, setFiltroLingua] = useState<string>(ANY);
  const [filtroAnni, setFiltroAnni] = useState<string>(ANY);
  const [filtroTitolo, setFiltroTitolo] = useState<string>(ANY);
  const [filtroResidenza, setFiltroResidenza] = useState<string>(ANY);

  // Filtro temporale (created_at)
  const [periodoPreset, setPeriodoPreset] = useState<PeriodoPreset>("any");
  const [dataDa, setDataDa] = useState<string>("");
  const [dataA, setDataA] = useState<string>("");
  const [confrontaOpen, setConfrontaOpen] = useState(false);

  const periodoRange = useMemo(() => {
    if (periodoPreset === "custom") {
      return {
        from: dataDa ? new Date(dataDa + "T00:00:00") : undefined,
        to: dataA ? new Date(dataA + "T23:59:59") : undefined,
      };
    }
    return presetToRange(periodoPreset);
  }, [periodoPreset, dataDa, dataA]);

  const periodoAttivo = !!(periodoRange.from || periodoRange.to);

  const periodoLabel = useMemo(() => {
    const opt = PERIODO_OPZIONI.find((o) => o.value === periodoPreset);
    if (periodoPreset === "custom") {
      const fmt = (d?: Date) =>
        d ? d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" }) : "—";
      return `Periodo: ${fmt(periodoRange.from)} → ${fmt(periodoRange.to)}`;
    }
    return opt?.label || "Qualsiasi periodo";
  }, [periodoPreset, periodoRange]);

  const { data, isLoading } = useQuery({
    queryKey: ["candidati"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidati")
        .select("*, posizioni(id, titolo, stato)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Candidato[];
    },
  });

  // Conteggi per badge sui tab
  const counts = useMemo(() => {
    const c = { attivi: 0, archivio: 0, rivalutare: 0 };
    (data ?? []).forEach((cand) => {
      const s = statoCandidato(cand);
      if (s === "attivo") c.attivi++;
      else if (s === "rivalutare") c.rivalutare++;
      else c.archivio++;
    });
    return c;
  }, [data]);

  // Opzioni filtri (solo per archivio/rivalutare, derivate da TUTTI i candidati)
  const opzioni = useMemo(() => {
    const lingue = new Set<string>();
    const titoli = new Set<string>();
    const residenze = new Set<string>();
    (data ?? []).forEach((c) => {
      const e = getEstratte(c);
      (e.lingue || []).forEach((l) => l.lingua && lingue.add(l.lingua.trim()));
      if (e.titolo_studio?.trim()) titoli.add(e.titolo_studio.trim());
      if (e.residenza?.trim()) residenze.add(e.residenza.trim());
    });
    return {
      lingue: Array.from(lingue).sort(),
      titoli: Array.from(titoli).sort(),
      residenze: Array.from(residenze).sort(),
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.filter((c) => {
      const s = statoCandidato(c);
      if (vista === "attivi") return s === "attivo";
      if (vista === "rivalutare") return s === "rivalutare";
      return s === "archivio";
    });

    // I filtri di ricerca si applicano ad archivio e rivalutare
    if (vista === "attivi") return list;

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const e = getEstratte(c);
        const hay = [
          c.nome,
          c.cognome,
          e.ultimo_ruolo,
          e.residenza,
          ...(e.competenze_tecniche || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (filtroLingua !== ANY) {
      list = list.filter((c) =>
        (getEstratte(c).lingue || []).some(
          (l) => l.lingua?.trim().toLowerCase() === filtroLingua.toLowerCase(),
        ),
      );
    }
    if (filtroAnni !== ANY) {
      const range = ANNI_RANGES.find((r) => r.value === filtroAnni);
      if (range) {
        list = list.filter((c) => {
          const n = parseAnni(getEstratte(c).anni_esperienza);
          return n !== null && n >= range.min && n <= range.max;
        });
      }
    }
    if (filtroTitolo !== ANY) {
      list = list.filter(
        (c) => getEstratte(c).titolo_studio?.trim() === filtroTitolo,
      );
    }
    if (filtroResidenza !== ANY) {
      list = list.filter(
        (c) => getEstratte(c).residenza?.trim() === filtroResidenza,
      );
    }
    if (periodoRange.from || periodoRange.to) {
      list = list.filter((c) => {
        const t = new Date(c.created_at).getTime();
        if (periodoRange.from && t < periodoRange.from.getTime()) return false;
        if (periodoRange.to && t > periodoRange.to.getTime()) return false;
        return true;
      });
    }
    return list;
  }, [data, vista, search, filtroLingua, filtroAnni, filtroTitolo, filtroResidenza, periodoRange]);

  const deleteMutation = useMutation({
    mutationFn: async (c: Candidato) => {
      if (c.cv_path) {
        const { error: sErr } = await supabase.storage.from("cvs").remove([c.cv_path]);
        if (sErr) console.warn("Errore eliminazione CV:", sErr);
      }
      const { error } = await supabase.from("candidati").delete().eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidati"] });
      toast.success("Candidato eliminato");
      setToDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });

  const resetFiltri = () => {
    setSearch("");
    setFiltroLingua(ANY);
    setFiltroAnni(ANY);
    setFiltroTitolo(ANY);
    setFiltroResidenza(ANY);
    setPeriodoPreset("any");
    setDataDa("");
    setDataA("");
  };

  const filtriAttivi =
    !!search ||
    filtroLingua !== ANY ||
    filtroAnni !== ANY ||
    filtroTitolo !== ANY ||
    filtroResidenza !== ANY ||
    periodoAttivo;

  const showFiltri = vista !== "attivi";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Candidati</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestisci i candidati attivi e consulta lo storico per riproporli su nuove posizioni.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          Aggiungi candidato
        </Button>
      </div>

      <div className="mb-4">
        <Tabs value={vista} onValueChange={(v) => setVista(v as Vista)}>
          <TabsList>
            <TabsTrigger value="attivi">
              Attivi <span className="ml-1.5 text-xs text-muted-foreground">({counts.attivi})</span>
            </TabsTrigger>
            <TabsTrigger value="archivio">
              Archivio <span className="ml-1.5 text-xs text-muted-foreground">({counts.archivio})</span>
            </TabsTrigger>
            <TabsTrigger value="rivalutare">
              Da rivalutare <span className="ml-1.5 text-xs text-muted-foreground">({counts.rivalutare})</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {showFiltri && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Cerca per nome, ruolo, competenze…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={filtroLingua} onValueChange={setFiltroLingua}>
              <SelectTrigger>
                <SelectValue placeholder="Lingua" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutte le lingue</SelectItem>
                {opzioni.lingue.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroAnni} onValueChange={setFiltroAnni}>
              <SelectTrigger>
                <SelectValue placeholder="Anni esperienza" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Qualsiasi esperienza</SelectItem>
                {ANNI_RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroTitolo} onValueChange={setFiltroTitolo}>
              <SelectTrigger>
                <SelectValue placeholder="Titolo di studio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutti i titoli</SelectItem>
                {opzioni.titoli.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroResidenza} onValueChange={setFiltroResidenza}>
              <SelectTrigger>
                <SelectValue placeholder="Residenza" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutte le città</SelectItem>
                {opzioni.residenze.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Select value={periodoPreset} onValueChange={(v) => setPeriodoPreset(v as PeriodoPreset)}>
              <SelectTrigger>
                <SelectValue placeholder="Arco temporale" />
              </SelectTrigger>
              <SelectContent>
                {PERIODO_OPZIONI.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {periodoPreset === "custom" && (
              <>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Da</label>
                  <Input type="date" value={dataDa} onChange={(e) => setDataDa(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">A</label>
                  <Input type="date" value={dataA} onChange={(e) => setDataA(e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {periodoAttivo ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfrontaOpen(true)}
                disabled={filtered.length === 0}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Confronta CV nel periodo ({filtered.length})
              </Button>
            ) : (
              <span />
            )}
            {filtriAttivi && (
              <Button variant="ghost" size="sm" onClick={resetFiltri}>
                <X className="h-3.5 w-3.5" />
                Azzera filtri
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              {vista === "attivi" ? (
                <>
                  <TableHead>Ruolo applicato</TableHead>
                  <TableHead>Data caricamento</TableHead>
                </>
              ) : (
                <>
                  <TableHead>Ultimo ruolo</TableHead>
                  <TableHead>Residenza</TableHead>
                  <TableHead>Esperienza</TableHead>
                  <TableHead>Lingue</TableHead>
                  <TableHead>Competenze</TableHead>
                  <TableHead>Inserito il</TableHead>
                </>
              )}
              <TableHead>Stato</TableHead>
              <TableHead>Analisi</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={vista === "attivi" ? 6 : 10} className="h-24 text-center text-sm text-muted-foreground">
                  Caricamento…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={vista === "attivi" ? 6 : 10} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Users className="h-8 w-8 opacity-50" />
                    <p className="text-sm">
                      {vista === "attivi"
                        ? "Nessun candidato attivo"
                        : vista === "rivalutare"
                          ? "Nessun candidato da rivalutare"
                          : "Nessun candidato in archivio"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => {
                const e = getEstratte(c);
                const stato = statoCandidato(c);
                const lingueStr = (e.lingue || [])
                  .map((l) => (l.livello ? `${l.lingua} (${l.livello})` : l.lingua))
                  .filter(Boolean)
                  .join(", ");
                const competenzeTop = (e.competenze_tecniche || []).slice(0, 3);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        to="/candidati/$id"
                        params={{ id: c.id }}
                        className="flex items-center gap-2 font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {c.cv_path && <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                        {c.nome} {c.cognome}
                      </Link>
                    </TableCell>

                    {vista === "attivi" ? (
                      <>
                        <TableCell className="text-muted-foreground">
                          {c.posizioni?.titolo || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-muted-foreground">{e.ultimo_ruolo || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{e.residenza || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{e.anni_esperienza || "—"}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[180px] truncate" title={lingueStr}>
                          {lingueStr || "—"}
                        </TableCell>
                        <TableCell>
                          {competenzeTop.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {competenzeTop.map((k, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">{k}</Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                      </>
                    )}

                    <TableCell><StatoBadge stato={stato} /></TableCell>
                    <TableCell>
                      <Badge variant={c.stato_analisi === "analizzato" ? "default" : "secondary"}>
                        {c.stato_analisi === "analizzato" ? "Analizzato" : "In attesa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {c.cv_path && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPreview(c)}
                          aria-label="Anteprima CV"
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setToDelete(c)}
                        aria-label="Elimina"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <CandidatoFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <CvPreviewDialog candidato={preview} onClose={() => setPreview(null)} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il candidato?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare <strong>{toDelete?.nome} {toDelete?.cognome}</strong> e
              il relativo CV. Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteMutation.mutate(toDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
