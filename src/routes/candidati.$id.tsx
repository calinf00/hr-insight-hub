import { handleDbError } from "@/lib/handle-error";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, FileText, Save, User, Calendar, MapPin, Globe, Mail, Phone,
  GraduationCap, Building2, Briefcase, Wrench, Award, Languages, Sparkles, Pencil,
  Send, Flag, History, CalendarDays, Briefcase as BriefcaseIcon, StickyNote,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tagChipClass } from "@/lib/auto-tags";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CvPreviewDialog } from "@/components/cv-preview-dialog";
import { PromuoviDialog } from "@/components/promuovi-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Candidato = Tables<"candidati"> & {
  posizioni?: { id: string; titolo: string; stato: string } | null;
};

type Lingua = { lingua: string; livello: string };
type Estratte = {
  nome?: string;
  cognome?: string;
  eta?: string;
  residenza?: string;
  nazionalita?: string;
  email?: string;
  telefono?: string;
  lingue?: Lingua[];
  titolo_studio?: string;
  istituto?: string;
  anni_esperienza?: string;
  ultimo_ruolo?: string;
  competenze_tecniche?: string[];
  certificazioni?: string[];
  campi_personalizzati?: Record<string, string>;
  _da_rivalutare?: boolean;
  _nota_rivalutare?: string;
};

export const Route = createFileRoute("/candidati/$id")({
  head: () => ({ meta: [{ title: "Candidato — CV Analyzer" }] }),
  component: CandidatoDetailPage,
});

function CandidatoDetailPage() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draft, setDraft] = useState<Estratte | null>(null);
  const [promuoviOpen, setPromuoviOpen] = useState(false);
  const [rivalutaOpen, setRivalutaOpen] = useState(false);
  const [notaRivaluta, setNotaRivaluta] = useState("");

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

  const { data: campiPers } = useQuery({
    queryKey: ["campi_personalizzati"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campi_personalizzati")
        .select("*")
        .order("ordine", { ascending: true });
      if (error) throw error;
      return data as Tables<"campi_personalizzati">[];
    },
  });

  const { data: analisiList } = useQuery({
    queryKey: ["analisi", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analisi")
        .select("*")
        .eq("candidato_id", id)
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
        .from("posizioni")
        .select("id, titolo")
        .in("id", ids);
      if (error) throw error;
      return new Map((data || []).map((p) => [p.id, p.titolo]));
    },
  });

  const estratte: Estratte | null = useMemo(() => {
    return (data?.informazioni_estratte as Estratte | null) ?? null;
  }, [data]);

  useEffect(() => {
    setDraft(estratte ? { ...estratte } : null);
  }, [estratte]);

  const saveMutation = useMutation({
    mutationFn: async (next: Estratte) => {
      const { error } = await supabase
        .from("candidati")
        .update({ informazioni_estratte: next as never })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidato", id] });
      toast.success("Modifiche salvate");
    },
    onError: (e: Error) => handleDbError(e, "mutation"),
  });

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

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(estratte), [draft, estratte]);

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

  const updateField = <K extends keyof Estratte>(key: K, value: Estratte[K]) =>
    setDraft((d) => ({ ...(d || {}), [key]: value }));

  const updateLingua = (i: number, patch: Partial<Lingua>) =>
    setDraft((d) => {
      const lingue = [...(d?.lingue || [])];
      lingue[i] = { ...lingue[i], ...patch };
      return { ...(d || {}), lingue };
    });
  const addLingua = () =>
    setDraft((d) => ({ ...(d || {}), lingue: [...(d?.lingue || []), { lingua: "", livello: "" }] }));
  const removeLingua = (i: number) =>
    setDraft((d) => ({ ...(d || {}), lingue: (d?.lingue || []).filter((_, j) => j !== i) }));

  const updateCustom = (key: string, value: string) =>
    setDraft((d) => ({
      ...(d || {}),
      campi_personalizzati: { ...(d?.campi_personalizzati || {}), [key]: value },
    }));

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
              Candidato il{" "}
              {new Date(data.created_at).toLocaleDateString("it-IT", {
                day: "2-digit", month: "short", year: "numeric",
              })}
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

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Informazioni Estratte dal CV</h2>
          </div>
          {estratte && (
            <Button
              size="sm"
              onClick={() => draft && saveMutation.mutate(draft)}
              disabled={!dirty || saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              Salva modifiche
            </Button>
          )}
        </div>

        {!estratte || !draft ? (
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
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field icon={User} label="Nome">
                <Input value={draft.nome || ""} onChange={(e) => updateField("nome", e.target.value)} />
              </Field>
              <Field icon={User} label="Cognome">
                <Input value={draft.cognome || ""} onChange={(e) => updateField("cognome", e.target.value)} />
              </Field>
              <Field icon={Calendar} label="Età / Data di nascita">
                <Input value={draft.eta || ""} onChange={(e) => updateField("eta", e.target.value)} />
              </Field>
              <Field icon={MapPin} label="Residenza">
                <Input value={draft.residenza || ""} onChange={(e) => updateField("residenza", e.target.value)} />
              </Field>
              <Field icon={Globe} label="Nazionalità">
                <Input value={draft.nazionalita || ""} onChange={(e) => updateField("nazionalita", e.target.value)} />
              </Field>
              <Field icon={Mail} label="Email">
                <Input value={draft.email || ""} onChange={(e) => updateField("email", e.target.value)} />
              </Field>
              <Field icon={Phone} label="Telefono">
                <Input value={draft.telefono || ""} onChange={(e) => updateField("telefono", e.target.value)} />
              </Field>
              <Field icon={GraduationCap} label="Titolo di studio">
                <Input
                  value={draft.titolo_studio || ""}
                  onChange={(e) => updateField("titolo_studio", e.target.value)}
                />
              </Field>
              <Field icon={Building2} label="Istituto / Università">
                <Input value={draft.istituto || ""} onChange={(e) => updateField("istituto", e.target.value)} />
              </Field>
              <Field icon={Briefcase} label="Anni di esperienza">
                <Input
                  value={draft.anni_esperienza || ""}
                  onChange={(e) => updateField("anni_esperienza", e.target.value)}
                />
              </Field>
              <Field icon={Briefcase} label="Ultimo ruolo">
                <Input
                  value={draft.ultimo_ruolo || ""}
                  onChange={(e) => updateField("ultimo_ruolo", e.target.value)}
                />
              </Field>
            </div>

            <div className="rounded-md border border-border bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Languages className="h-4 w-4 text-primary" />
                  Lingue parlate
                </div>
                <Button variant="ghost" size="sm" onClick={addLingua}>
                  <Pencil className="h-3.5 w-3.5" />
                  Aggiungi
                </Button>
              </div>
              {(draft.lingue || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna lingua indicata.</p>
              ) : (
                <div className="space-y-2">
                  {(draft.lingue || []).map((l, i) => (
                    <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,1fr,auto]">
                      <Input
                        placeholder="Lingua"
                        value={l.lingua}
                        onChange={(e) => updateLingua(i, { lingua: e.target.value })}
                      />
                      <Input
                        placeholder="Livello (es. C1)"
                        value={l.livello}
                        onChange={(e) => updateLingua(i, { livello: e.target.value })}
                      />
                      <Button variant="ghost" size="sm" onClick={() => removeLingua(i)}>
                        Rimuovi
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <ListField
              icon={Wrench}
              label="Competenze tecniche"
              items={draft.competenze_tecniche || []}
              onChange={(items) => updateField("competenze_tecniche", items)}
            />

            <ListField
              icon={Award}
              label="Certificazioni"
              items={draft.certificazioni || []}
              onChange={(items) => updateField("certificazioni", items)}
            />

            {campiPers && campiPers.length > 0 && (
              <div className="rounded-md border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Campi personalizzati
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {campiPers.map((cp) => (
                    <div key={cp.id} className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{cp.etichetta}</Label>
                      <Input
                        value={draft.campi_personalizzati?.[cp.etichetta] || ""}
                        onChange={(e) => updateCustom(cp.etichetta, e.target.value)}
                        placeholder="—"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

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

      {data.note && (
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-2 text-sm font-semibold">Note HR</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.note}</p>
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

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </Label>
      {children}
    </div>
  );
}

function ListField({
  icon: Icon,
  label,
  items,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const value = items.join("\n");
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <Label className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </Label>
      {items.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <Badge key={i} variant="secondary">
              {it}
            </Badge>
          ))}
        </div>
      )}
      <Textarea
        rows={3}
        value={value}
        onChange={(e) =>
          onChange(
            e.target.value
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        placeholder="Una voce per riga"
      />
    </div>
  );
}

type StoricoProps = {
  candidato: Candidato;
  analisi: Tables<"analisi">[];
  posMap: Map<string, string>;
};

function StoricoCandidature({ candidato, analisi, posMap }: StoricoProps) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit", month: "short", year: "numeric",
    });

  type Evento = {
    ts: number;
    data: string;
    icon: typeof Sparkles;
    color: string;
    titolo: string;
    descrizione?: string;
  };

  const eventi: Evento[] = [];

  eventi.push({
    ts: new Date(candidato.created_at).getTime(),
    data: fmt(candidato.created_at),
    icon: User,
    color: "text-primary",
    titolo: "Candidato inserito",
    descrizione: candidato.canale ? `Canale: ${candidato.canale}` : undefined,
  });

  if (candidato.posizioni?.titolo) {
    eventi.push({
      ts: new Date(candidato.created_at).getTime() + 1,
      data: fmt(candidato.created_at),
      icon: BriefcaseIcon,
      color: "text-emerald-600 dark:text-emerald-400",
      titolo: `Associato a "${candidato.posizioni.titolo}"`,
      descrizione: `Posizione ${candidato.posizioni.stato}`,
    });
  }

  for (const a of analisi) {
    const titolo = a.best_posizione_id ? posMap.get(a.best_posizione_id) : null;
    const numPos = ((a.posizioni_ids as string[]) || []).length;
    eventi.push({
      ts: new Date(a.created_at).getTime(),
      data: fmt(a.created_at),
      icon: Sparkles,
      color: "text-primary",
      titolo: `Analisi AI eseguita${numPos > 0 ? ` su ${numPos} posizione/i` : ""}`,
      descrizione:
        titolo && a.best_score !== null
          ? `Migliore: ${titolo} — ${a.best_score}/100`
          : a.best_score !== null
            ? `Punteggio migliore: ${a.best_score}/100`
            : undefined,
    });
  }

  if (candidato.note?.trim()) {
    eventi.push({
      ts: new Date(candidato.updated_at).getTime(),
      data: fmt(candidato.updated_at),
      icon: StickyNote,
      color: "text-amber-600 dark:text-amber-400",
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
                {ev.descrizione && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{ev.descrizione}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
