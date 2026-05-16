import { handleDbError } from "@/lib/handle-error";
import { useMemo, useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, FileText, Save, User, Calendar, MapPin, Globe, Mail, Phone,
  GraduationCap, Building2, Briefcase, Wrench, Award, Languages, Sparkles,
  Send, Flag, History, CalendarDays, Briefcase as BriefcaseIcon, StickyNote,
  CarFront, BadgeCheck, Sparkle, Target,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tagChipClass } from "@/lib/auto-tags";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CvPreviewDialog } from "@/components/cv-preview-dialog";
import { PromuoviDialog } from "@/components/promuovi-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Candidato = Tables<"candidati"> & {
  posizioni?: { id: string; titolo: string; stato: string } | null;
};

type Lingua = { lingua?: string; livello?: string };
type Istruzione = {
  titolo?: string; istituto?: string; anno_inizio?: string; anno_fine?: string;
  voto?: string; note?: string;
};
type Esperienza = {
  ruolo?: string; azienda?: string; settore?: string; data_inizio?: string;
  data_fine?: string; attuale?: boolean; descrizione?: string;
  anni_esperienza_calcolati?: number | null;
};
type Certificazione = string | {
  nome?: string; ente?: string; anno?: string; scadenza?: string;
};

type Estratte = {
  nome?: string; cognome?: string; email?: string; telefono?: string;
  data_nascita?: string; eta?: number | string | null;
  citta_residenza?: string; provincia?: string; residenza?: string;
  nazionalita?: string; patente?: string;
  lingue?: Lingua[]; istruzione?: Istruzione[];
  esperienze_professionali?: Esperienza[];
  certificazioni?: Certificazione[];
  competenze_tecniche?: string[]; competenze_soft?: string[];
  anni_esperienza_totale?: number | null; anni_esperienza?: string;
  ultimo_ruolo?: string; ultimo_datore?: string;
  titolo_studio?: string; istituto?: string;
  disponibile_trasferte?: boolean | null;
  disponibile_relocation?: boolean | null;
  stipendio_atteso?: string; notice_period?: string;
  summary_professionale?: string;
  campi_personalizzati?: Record<string, string>;
  _da_rivalutare?: boolean;
  _nota_rivalutare?: string;
};

export const Route = createFileRoute("/candidati/$id")({
  head: () => ({ meta: [{ title: "Candidato — CV Analyzer" }] }),
  component: CandidatoDetailPage,
});

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function valOrDash(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s.length === 0 ? "—" : s;
}

function isPresent(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function CandidatoDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [promuoviOpen, setPromuoviOpen] = useState(false);
  const [rivalutaOpen, setRivalutaOpen] = useState(false);
  const [notaRivaluta, setNotaRivaluta] = useState("");
  const [noteDraft, setNoteDraft] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["candidato", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidati")
        .select("*, posizioni(id, titolo, stato)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as Candidato | null;
    },
  });

  const { data: analisiList } = useQuery({
    queryKey: ["analisi", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analisi").select("*").eq("candidato_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Tables<"analisi">[];
    },
  });

  const { data: analisiPosizioni } = useQuery({
    queryKey: ["analisi-posizioni", id, analisiList?.length ?? 0],
    enabled: !!analisiList && analisiList.length > 0,
    queryFn: async () => {
      const ids = Array.from(
        new Set(
          (analisiList || [])
            .flatMap((a) => [a.best_posizione_id, ...((a.posizioni_ids as string[]) || [])])
            .filter(Boolean) as string[],
        ),
      );
      if (ids.length === 0) return new Map<string, string>();
      const { data, error } = await supabase
        .from("posizioni").select("id, titolo").in("id", ids);
      if (error) throw error;
      return new Map((data || []).map((p) => [p.id, p.titolo]));
    },
  });

  const estratte: Estratte | null = useMemo(
    () => (data?.informazioni_estratte as Estratte | null) ?? null,
    [data],
  );

  useEffect(() => {
    setNoteDraft(data?.note ?? "");
  }, [data?.note]);

  const rivalutaMutation = useMutation({
    mutationFn: async (params: { attivo: boolean; nota: string }) => {
      const base: Estratte = (estratte ?? {}) as Estratte;
      const next: Estratte = {
        ...base,
        _da_rivalutare: params.attivo,
        _nota_rivalutare: params.attivo ? params.nota.trim() || base._nota_rivalutare || "" : "",
      };
      const { error } = await supabase
        .from("candidati")
        .update({ informazioni_estratte: next as never })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["candidato", id] });
      queryClient.invalidateQueries({ queryKey: ["candidati"] });
      toast.success(vars.attivo ? "Candidato segnato da rivalutare" : "Flag rimosso");
      setRivalutaOpen(false);
      setNotaRivaluta("");
    },
    onError: (e: Error) => handleDbError(e, "mutation"),
  });

  const saveNoteMutation = useMutation({
    mutationFn: async (testo: string) => {
      const { error } = await supabase
        .from("candidati").update({ note: testo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidato", id] });
      toast.success("Note salvate");
    },
    onError: (e: Error) => handleDbError(e, "mutation"),
  });

  const statoCand: "attivo" | "archivio" | "rivalutare" = (() => {
    if (estratte?._da_rivalutare) return "rivalutare";
    if (data?.posizione_id && data?.posizioni?.stato === "aperta") return "attivo";
    return "archivio";
  })();

  if (isLoading) {
    return <div className="mx-auto max-w-5xl text-sm text-muted-foreground">Caricamento…</div>;
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-muted-foreground">Candidato non trovato.</p>
        <Button asChild variant="link" className="mt-2 px-0">
          <Link to="/candidati">Torna ai candidati</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link to="/candidati">
              <ArrowLeft className="h-4 w-4" />
              Candidati
            </Link>
          </Button>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {data.nome} {data.cognome}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <CalendarDays className="h-3.5 w-3.5 text-primary" />
              Candidato il {fmtDate(data.created_at)}
            </span>
            {data.posizioni?.titolo && <span>· Ruolo applicato: {data.posizioni.titolo}</span>}
            {statoCand === "attivo" && (
              <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-400">
                🟢 Attivo
              </Badge>
            )}
            {statoCand === "archivio" && (
              <Badge className="bg-sky-500/15 text-sky-700 border border-sky-500/30 dark:text-sky-400">
                🔵 In archivio
              </Badge>
            )}
            {statoCand === "rivalutare" && (
              <Badge className="bg-amber-500/15 text-amber-700 border border-amber-500/30 dark:text-amber-400">
                🟡 Da rivalutare
              </Badge>
            )}
            <Badge variant={data.stato_analisi === "analizzato" ? "default" : "secondary"}>
              {data.stato_analisi === "analizzato" ? "Analizzato" : "In attesa di analisi"}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPromuoviOpen(true)}>
            <Send className="h-4 w-4" />
            Proponi per posizione
          </Button>
          {estratte?._da_rivalutare ? (
            <Button
              variant="outline"
              onClick={() => rivalutaMutation.mutate({ attivo: false, nota: "" })}
              disabled={rivalutaMutation.isPending}
            >
              <Flag className="h-4 w-4 text-amber-500" />
              Rimuovi "Da rivalutare"
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setNotaRivaluta(estratte?._nota_rivalutare || "");
                setRivalutaOpen(true);
              }}
            >
              <Flag className="h-4 w-4" />
              Segna da rivalutare
            </Button>
          )}
          {data.cv_path && (
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <FileText className="h-4 w-4" />
              Visualizza CV
            </Button>
          )}
        </div>
      </div>

      {estratte?._da_rivalutare && estratte._nota_rivalutare && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          <span className="font-medium">Nota rivalutazione: </span>
          {estratte._nota_rivalutare}
        </div>
      )}

      {!estratte ? (
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="rounded-md border border-dashed border-border p-8 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm font-medium">Nessuna informazione estratta</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Avvia un'analisi AI per estrarre automaticamente le informazioni dal CV.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/analisi">Vai ad Analisi AI</Link>
            </Button>
          </div>
        </section>
      ) : (
        <SchedaCandidatoTabs
          candidato={data}
          estratte={estratte}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          onSaveNote={() => saveNoteMutation.mutate(noteDraft)}
          savingNote={saveNoteMutation.isPending}
        />
      )}

      <StoricoCandidature
        candidato={data}
        analisi={analisiList || []}
        posMap={analisiPosizioni || new Map<string, string>()}
      />

      {data.tags && data.tags.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-3 text-sm font-semibold">Tag</h2>
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((t: string) => (
              <Badge key={t} variant="outline" className={tagChipClass(t)}>
                {t}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Modifica i tag dal Talent Pool.
          </p>
        </section>
      )}

      <CvPreviewDialog candidato={previewOpen ? data : null} onClose={() => setPreviewOpen(false)} />

      <PromuoviDialog
        open={promuoviOpen}
        onOpenChange={setPromuoviOpen}
        candidatoId={id}
        candidatoNome={`${data.nome} ${data.cognome}`}
      />

      <Dialog open={rivalutaOpen} onOpenChange={setRivalutaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Segna come "Da rivalutare"</DialogTitle>
            <DialogDescription>
              Aggiungi una nota per ricordarti perché vuoi rivedere questo candidato in futuro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Nota (opzionale)</Label>
            <Textarea
              rows={3}
              value={notaRivaluta}
              onChange={(e) => setNotaRivaluta(e.target.value)}
              placeholder="Es. profilo promettente, da considerare per future aperture nel reparto X…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRivalutaOpen(false)}>Annulla</Button>
            <Button
              onClick={() => rivalutaMutation.mutate({ attivo: true, nota: notaRivaluta })}
              disabled={rivalutaMutation.isPending}
            >
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================================================
 * SCHEDA A TABS
 * ============================================================ */

function SchedaCandidatoTabs({
  candidato, estratte, noteDraft, setNoteDraft, onSaveNote, savingNote,
}: {
  candidato: Candidato;
  estratte: Estratte;
  noteDraft: string;
  setNoteDraft: (s: string) => void;
  onSaveNote: () => void;
  savingNote: boolean;
}) {
  return (
    <Tabs defaultValue="riepilogo" className="w-full">
      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
        <TabsTrigger value="riepilogo">Riepilogo</TabsTrigger>
        <TabsTrigger value="esperienze">Esperienze</TabsTrigger>
        <TabsTrigger value="formazione">Formazione</TabsTrigger>
        <TabsTrigger value="skills">Competenze & Lingue</TabsTrigger>
        <TabsTrigger value="preferenze">Preferenze & Note</TabsTrigger>
      </TabsList>

      <TabsContent value="riepilogo" className="mt-4">
        <TabRiepilogo estratte={estratte} />
      </TabsContent>
      <TabsContent value="esperienze" className="mt-4">
        <TabEsperienze estratte={estratte} />
      </TabsContent>
      <TabsContent value="formazione" className="mt-4">
        <TabFormazione estratte={estratte} />
      </TabsContent>
      <TabsContent value="skills" className="mt-4">
        <TabSkills estratte={estratte} />
      </TabsContent>
      <TabsContent value="preferenze" className="mt-4">
        <TabPreferenze
          candidato={candidato}
          estratte={estratte}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          onSaveNote={onSaveNote}
          savingNote={savingNote}
        />
      </TabsContent>
    </Tabs>
  );
}

/* ----------- TAB 1: RIEPILOGO ----------- */
function TabRiepilogo({ estratte }: { estratte: Estratte }) {
  const citta = [estratte.citta_residenza, estratte.provincia].filter(Boolean).join(", ")
    || estratte.residenza || "";
  const etaStr = (() => {
    if (typeof estratte.eta === "number") return `${estratte.eta} anni`;
    if (typeof estratte.eta === "string" && estratte.eta.trim()) return estratte.eta;
    return estratte.data_nascita || "";
  })();

  const anagrafica: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; value: string }> = [
    { icon: User, label: "Nome", value: `${estratte.nome ?? ""} ${estratte.cognome ?? ""}`.trim() },
    { icon: Mail, label: "Email", value: estratte.email ?? "" },
    { icon: Phone, label: "Telefono", value: estratte.telefono ?? "" },
    { icon: Calendar, label: "Età / Nascita", value: etaStr },
    { icon: MapPin, label: "Città", value: citta },
    { icon: Globe, label: "Nazionalità", value: estratte.nazionalita ?? "" },
    { icon: CarFront, label: "Patente", value: estratte.patente ?? "" },
  ];

  const numLingue = (estratte.lingue ?? []).filter((l) => l?.lingua?.trim()).length;
  const annoTot = estratte.anni_esperienza_totale ?? null;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <User className="h-4 w-4 text-primary" /> Dati anagrafici
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {anagrafica.map(({ icon: Icon, label, value }) => (
            <div key={label}>
              <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3.5 w-3.5" /> {label}
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">{valOrDash(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {isPresent(estratte.summary_professionale) && (
        <section className="rounded-lg border border-primary/30 bg-primary/5 p-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Sparkle className="h-4 w-4 text-primary" /> Summary professionale
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {estratte.summary_professionale}
          </p>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={Briefcase} label="Anni esperienza"
          value={annoTot !== null && annoTot !== undefined ? `${annoTot}` : (estratte.anni_esperienza || "—")}
        />
        <KpiCard icon={BadgeCheck} label="Ultimo ruolo" value={estratte.ultimo_ruolo || "—"} />
        <KpiCard icon={GraduationCap} label="Titolo di studio" value={highestTitolo(estratte) || "—"} />
        <KpiCard icon={Languages} label="Lingue parlate" value={`${numLingue}`} />
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 line-clamp-2 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function highestTitolo(estratte: Estratte): string {
  if (estratte.istruzione && estratte.istruzione.length > 0) {
    const first = estratte.istruzione.find((i) => i?.titolo?.trim());
    if (first?.titolo) return first.titolo;
  }
  return estratte.titolo_studio || "";
}

/* ----------- TAB 2: ESPERIENZE ----------- */
function TabEsperienze({ estratte }: { estratte: Estratte }) {
  const list = (estratte.esperienze_professionali ?? []).slice();
  list.sort((a, b) => {
    if (a.attuale && !b.attuale) return -1;
    if (!a.attuale && b.attuale) return 1;
    return parseDateForSort(b.data_fine || b.data_inizio) - parseDateForSort(a.data_fine || a.data_inizio);
  });
  const totale = estratte.anni_esperienza_totale ?? null;

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Briefcase className="h-4 w-4 text-primary" /> Esperienze professionali
        </h2>
        <Badge variant="secondary">
          Totale: {totale !== null && totale !== undefined ? `${totale} anni` : (estratte.anni_esperienza || "—")}
        </Badge>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna esperienza professionale estratta.</p>
      ) : (
        <ol className="relative ml-2 space-y-5 border-l border-border pl-6">
          {list.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[34px] top-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background">
                <Briefcase className="h-3.5 w-3.5 text-primary" />
              </span>
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-sm font-semibold text-foreground">{e.ruolo || "—"}</p>
                {e.attuale && (
                  <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-400">
                    In corso
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {[e.azienda, e.settore].filter(Boolean).join(" · ") || "—"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatPeriodo(e.data_inizio, e.data_fine, e.attuale)}
                {e.anni_esperienza_calcolati ? ` · ${e.anni_esperienza_calcolati} anni` : ""}
              </p>
              {e.descrizione && (
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground/90">{e.descrizione}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function parseDateForSort(d?: string): number {
  if (!d) return 0;
  const m = d.match(/(\d{1,2})[/-](\d{4})/);
  if (m) return parseInt(m[2], 10) * 100 + parseInt(m[1], 10);
  const y = d.match(/(\d{4})/);
  if (y) return parseInt(y[1], 10) * 100;
  return 0;
}

function formatPeriodo(start?: string, end?: string, attuale?: boolean): string {
  const s = (start || "").trim();
  const e = attuale ? "Oggi" : (end || "").trim();
  if (!s && !e) return "—";
  return `${s || "?"} — ${e || "?"}`;
}

/* ----------- TAB 3: FORMAZIONE ----------- */
function TabFormazione({ estratte }: { estratte: Estratte }) {
  const list = (estratte.istruzione ?? []).slice().sort((a, b) =>
    parseDateForSort(b.anno_fine || b.anno_inizio) - parseDateForSort(a.anno_fine || a.anno_inizio),
  );
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <GraduationCap className="h-4 w-4 text-primary" /> Formazione
      </h2>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna formazione estratta.</p>
      ) : (
        <ul className="space-y-4">
          {list.map((i, idx) => (
            <li key={idx} className="rounded-md border border-border bg-background p-4">
              <p className="text-sm font-semibold text-foreground">{i.titolo || "—"}</p>
              <p className="text-sm text-muted-foreground">{i.istituto || "—"}</p>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>{formatPeriodo(i.anno_inizio, i.anno_fine, false)}</span>
                {i.voto && <span>Voto: <span className="text-foreground font-medium">{i.voto}</span></span>}
              </div>
              {i.note && <p className="mt-1.5 text-sm text-foreground/90">{i.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ----------- TAB 4: COMPETENZE & LINGUE ----------- */
function TabSkills({ estratte }: { estratte: Estratte }) {
  const lingue = (estratte.lingue ?? []).filter((l) => l?.lingua?.trim());
  const tech = estratte.competenze_tecniche ?? [];
  const soft = estratte.competenze_soft ?? [];
  const certs = (estratte.certificazioni ?? []).map((c) =>
    typeof c === "string" ? { nome: c } : c,
  );

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Languages className="h-4 w-4 text-primary" /> Lingue
        </h2>
        {lingue.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {lingue.map((l, i) => (
              <Badge key={i} variant="outline" className="bg-primary/5">
                {l.lingua}{l.livello ? ` — ${l.livello}` : ""}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Wrench className="h-4 w-4 text-primary" /> Competenze tecniche
        </h2>
        {tech.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tech.map((c, i) => (
              <Badge key={i} variant="secondary">{c}</Badge>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Sparkle className="h-4 w-4 text-primary" /> Competenze soft
        </h2>
        {soft.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {soft.map((c, i) => (
              <Badge key={i} variant="outline">{c}</Badge>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Award className="h-4 w-4 text-primary" /> Certificazioni
        </h2>
        {certs.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Ente</TableHead>
                <TableHead>Anno</TableHead>
                <TableHead>Scadenza</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certs.map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{valOrDash(c.nome)}</TableCell>
                  <TableCell>{valOrDash(c.ente)}</TableCell>
                  <TableCell>{valOrDash(c.anno)}</TableCell>
                  <TableCell>{valOrDash(c.scadenza)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

/* ----------- TAB 5: PREFERENZE & NOTE ----------- */
function TabPreferenze({
  candidato, estratte, noteDraft, setNoteDraft, onSaveNote, savingNote,
}: {
  candidato: Candidato;
  estratte: Estratte;
  noteDraft: string;
  setNoteDraft: (s: string) => void;
  onSaveNote: () => void;
  savingNote: boolean;
}) {
  const boolLabel = (v: boolean | null | undefined) =>
    v === true ? "Sì" : v === false ? "No" : "—";

  const rows: Array<{ icon: React.ComponentType<{ className?: string }>; label: string; value: string }> = [
    { icon: Target, label: "Disponibile trasferte", value: boolLabel(estratte.disponibile_trasferte) },
    { icon: Target, label: "Disponibile relocation", value: boolLabel(estratte.disponibile_relocation) },
    { icon: BadgeCheck, label: "Stipendio atteso", value: estratte.stipendio_atteso || "" },
    { icon: CalendarDays, label: "Notice period", value: estratte.notice_period || "" },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Target className="h-4 w-4 text-primary" /> Preferenze
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label}>
              <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <Icon className="h-3.5 w-3.5" /> {label}
              </dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground">{valOrDash(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <StickyNote className="h-4 w-4 text-primary" /> Note HR
          </h2>
          <Button
            size="sm"
            onClick={onSaveNote}
            disabled={savingNote || noteDraft === (candidato.note ?? "")}
          >
            <Save className="h-4 w-4" />
            Salva note
          </Button>
        </div>
        <Textarea
          rows={6}
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="Aggiungi note libere sul candidato…"
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-3 text-sm font-semibold">Origine</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Data caricamento CV</dt>
            <dd className="mt-0.5 text-sm font-medium">{fmtDate(candidato.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Canale</dt>
            <dd className="mt-0.5 text-sm font-medium">{valOrDash(candidato.canale)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

/* ============================================================
 * STORICO CANDIDATURE (inalterato)
 * ============================================================ */

type StoricoProps = {
  candidato: Candidato;
  analisi: Tables<"analisi">[];
  posMap: Map<string, string>;
};

function StoricoCandidature({ candidato, analisi, posMap }: StoricoProps) {
  type Evento = {
    ts: number; data: string; icon: typeof Sparkles; color: string;
    titolo: string; descrizione?: string;
  };
  const eventi: Evento[] = [];

  eventi.push({
    ts: new Date(candidato.created_at).getTime(),
    data: fmtDate(candidato.created_at),
    icon: User, color: "text-primary",
    titolo: "Candidato inserito",
    descrizione: candidato.canale ? `Canale: ${candidato.canale}` : undefined,
  });

  if (candidato.posizioni?.titolo) {
    eventi.push({
      ts: new Date(candidato.created_at).getTime() + 1,
      data: fmtDate(candidato.created_at),
      icon: BriefcaseIcon, color: "text-emerald-600 dark:text-emerald-400",
      titolo: `Associato a "${candidato.posizioni.titolo}"`,
      descrizione: `Posizione ${candidato.posizioni.stato}`,
    });
  }

  for (const a of analisi) {
    const titolo = a.best_posizione_id ? posMap.get(a.best_posizione_id) : null;
    const numPos = ((a.posizioni_ids as string[]) || []).length;
    eventi.push({
      ts: new Date(a.created_at).getTime(),
      data: fmtDate(a.created_at),
      icon: Sparkles, color: "text-primary",
      titolo: `Analisi AI eseguita${numPos > 0 ? ` su ${numPos} posizione/i` : ""}`,
      descrizione: titolo && a.best_score !== null
        ? `Migliore: ${titolo} — ${a.best_score}/100`
        : a.best_score !== null ? `Punteggio migliore: ${a.best_score}/100` : undefined,
    });
  }

  if (candidato.note?.trim()) {
    eventi.push({
      ts: new Date(candidato.updated_at).getTime(),
      data: fmtDate(candidato.updated_at),
      icon: StickyNote, color: "text-amber-600 dark:text-amber-400",
      titolo: "Note HR aggiornate",
      descrizione: candidato.note.length > 140 ? candidato.note.slice(0, 140) + "…" : candidato.note,
    });
  }

  eventi.sort((a, b) => b.ts - a.ts);

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Storico Candidature</h2>
        <Badge variant="secondary" className="ml-1">{eventi.length}</Badge>
      </div>
      {eventi.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun evento registrato.</p>
      ) : (
        <ol className="relative ml-2 space-y-4 border-l border-border pl-6">
          {eventi.map((ev, i) => {
            const Icon = ev.icon;
            return (
              <li key={i} className="relative">
                <span className="absolute -left-[34px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-background">
                  <Icon className={`h-3.5 w-3.5 ${ev.color}`} />
                </span>
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-sm font-medium text-foreground">{ev.titolo}</p>
                  <span className="text-xs text-muted-foreground">· {ev.data}</span>
                </div>
                {ev.descrizione && <p className="mt-0.5 text-sm text-muted-foreground">{ev.descrizione}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
