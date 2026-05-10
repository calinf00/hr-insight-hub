import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, FileText, Save, User, Calendar, MapPin, Globe, Mail, Phone,
  GraduationCap, Building2, Briefcase, Wrench, Award, Languages, Sparkles, Pencil,
  Send, Flag,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        .select("*, posizioni(id, titolo)")
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
    onError: (e: Error) => toast.error(e.message),
  });

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(estratte), [draft, estratte]);

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
            {data.posizioni?.titolo && <span>Ruolo applicato: {data.posizioni.titolo}</span>}
            <Badge variant={data.stato_analisi === "analizzato" ? "default" : "secondary"}>
              {data.stato_analisi === "analizzato" ? "Analizzato" : "In attesa di analisi"}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {data.cv_path && (
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <FileText className="h-4 w-4" />
              Visualizza CV
            </Button>
          )}
        </div>
      </div>

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

      {data.note && (
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-2 text-sm font-semibold">Note HR</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.note}</p>
        </section>
      )}

      <CvPreviewDialog candidato={previewOpen ? data : null} onClose={() => setPreviewOpen(false)} />
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
