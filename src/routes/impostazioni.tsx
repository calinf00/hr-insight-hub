import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Trash2, Save, Settings as SettingsIcon, ArrowUp, ArrowDown,
  Sliders, Download, FileSpreadsheet, FileText,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { exportCandidatiCSV, exportAnalisiPDF } from "@/lib/exports";

type Campo = Tables<"campi_personalizzati">;
type Settings = Tables<"app_settings">;

export const Route = createFileRoute("/impostazioni")({
  head: () => ({ meta: [{ title: "Impostazioni — CV Analyzer" }] }),
  component: ImpostazioniPage,
});

const LINGUE = ["Italiano", "Inglese", "Francese", "Spagnolo", "Tedesco"];

function ImpostazioniPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Impostazioni</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configura campi personalizzati, API, preferenze di analisi ed esporta i dati.
        </p>
      </div>

      <CampiPersonalizzatiSection />
      <PreferenzeSection />
      <EsportazioneSection />
    </div>
  );
}

/* ============== CAMPI PERSONALIZZATI ============== */
function CampiPersonalizzatiSection() {
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<Campo | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { etichetta: string; descrizione: string }>>({});
  const [newEtichetta, setNewEtichetta] = useState("");
  const [newDescrizione, setNewDescrizione] = useState("");

  const { data: campi, isLoading } = useQuery({
    queryKey: ["campi_personalizzati"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campi_personalizzati")
        .select("*")
        .order("ordine", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Campo[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const etichetta = newEtichetta.trim();
      if (!etichetta) throw new Error("L'etichetta è obbligatoria");
      const ordine = campi?.length ?? 0;
      const { error } = await supabase
        .from("campi_personalizzati")
        .insert({ etichetta, descrizione: newDescrizione.trim() || null, ordine });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campi_personalizzati"] });
      setNewEtichetta("");
      setNewDescrizione("");
      toast.success("Campo aggiunto");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (c: Campo) => {
      const draft = drafts[c.id];
      if (!draft) return;
      const etichetta = draft.etichetta.trim();
      if (!etichetta) throw new Error("L'etichetta è obbligatoria");
      const { error } = await supabase
        .from("campi_personalizzati")
        .update({ etichetta, descrizione: draft.descrizione.trim() || null })
        .eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: (_d, c) => {
      queryClient.invalidateQueries({ queryKey: ["campi_personalizzati"] });
      setDrafts((d) => {
        const { [c.id]: _omit, ...rest } = d;
        return rest;
      });
      toast.success("Campo aggiornato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (c: Campo) => {
      const { error } = await supabase.from("campi_personalizzati").delete().eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campi_personalizzati"] });
      setToDelete(null);
      toast.success("Campo eliminato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ index, direction }: { index: number; direction: -1 | 1 }) => {
      if (!campi) return;
      const target = index + direction;
      if (target < 0 || target >= campi.length) return;
      const a = campi[index];
      const b = campi[target];
      // swap ordine values; use distinct temporary to avoid potential unique constraint issues (none here)
      const { error: e1 } = await supabase
        .from("campi_personalizzati")
        .update({ ordine: b.ordine })
        .eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("campi_personalizzati")
        .update({ ordine: a.ordine })
        .eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campi_personalizzati"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const getDraft = (c: Campo) =>
    drafts[c.id] ?? { etichetta: c.etichetta, descrizione: c.descrizione ?? "" };
  const setDraft = (c: Campo, patch: Partial<{ etichetta: string; descrizione: string }>) =>
    setDrafts((d) => ({ ...d, [c.id]: { ...getDraft(c), ...patch } }));
  const isDirty = (c: Campo) => {
    const d = drafts[c.id];
    if (!d) return false;
    return d.etichetta !== c.etichetta || (d.descrizione || "") !== (c.descrizione || "");
  };

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <SettingsIcon className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Campi personalizzati da CV</h2>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Campi extra estratti dall'AI oltre a quelli standard. Esempi: "Disponibilità a trasferte",
        "Stipendio atteso", "Notice period". Verranno mostrati nella scheda del candidato se presenti nel CV.
      </p>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : !campi || campi.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nessun campo personalizzato. Aggiungine uno qui sotto.
          </p>
        ) : (
          campi.map((c, i) => {
            const draft = getDraft(c);
            const dirty = isDirty(c);
            return (
              <div
                key={c.id}
                className="grid grid-cols-1 items-start gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[auto,1fr,2fr,auto]"
              >
                <div className="flex items-center gap-0.5 sm:flex-col">
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6"
                    disabled={i === 0 || reorderMutation.isPending}
                    onClick={() => reorderMutation.mutate({ index: i, direction: -1 })}
                    aria-label="Sposta su"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6"
                    disabled={i === campi.length - 1 || reorderMutation.isPending}
                    onClick={() => reorderMutation.mutate({ index: i, direction: 1 })}
                    aria-label="Sposta giù"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Input
                  value={draft.etichetta}
                  onChange={(e) => setDraft(c, { etichetta: e.target.value })}
                  placeholder="Etichetta"
                />
                <Input
                  value={draft.descrizione}
                  onChange={(e) => setDraft(c, { descrizione: e.target.value })}
                  placeholder="Descrizione (istruzioni per l'AI, opzionale)"
                />
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost" size="icon"
                    disabled={!dirty || updateMutation.isPending}
                    onClick={() => updateMutation.mutate(c)}
                    aria-label="Salva"
                  >
                    <Save className={`h-4 w-4 ${dirty ? "text-primary" : "text-muted-foreground"}`} />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => setToDelete(c)}
                    aria-label="Elimina"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-6 rounded-md border border-dashed border-border p-4">
        <h3 className="mb-3 text-sm font-medium">Aggiungi un nuovo campo</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-etichetta">Etichetta *</Label>
            <Input
              id="new-etichetta"
              value={newEtichetta}
              onChange={(e) => setNewEtichetta(e.target.value)}
              placeholder="Es. Disponibilità a trasferte"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-descrizione">Descrizione</Label>
            <Textarea
              id="new-descrizione"
              value={newDescrizione}
              onChange={(e) => setNewDescrizione(e.target.value)}
              placeholder="Istruzioni per l'AI (opzionale)"
              rows={2}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!newEtichetta.trim() || addMutation.isPending}
          >
            <Plus className="h-4 w-4" />
            Aggiungi campo
          </Button>
        </div>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il campo?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare il campo <strong>{toDelete?.etichetta}</strong>.
              Le analisi già effettuate non verranno modificate.
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
    </section>
  );
}

/* ============== PREFERENZE ============== */
function PreferenzeSection() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const [draft, setDraft] = useState<{
    lingua_output: string;
    soglia_non_idoneo: number;
    escludi_posizioni_chiuse: boolean;
  } | null>(null);

  useEffect(() => {
    if (settings) {
      setDraft({
        lingua_output: settings.lingua_output,
        soglia_non_idoneo: settings.soglia_non_idoneo,
        escludi_posizioni_chiuse: settings.escludi_posizioni_chiuse,
      });
    }
  }, [settings]);

  const dirty = useMemo(() => {
    if (!settings || !draft) return false;
    return (
      draft.lingua_output !== settings.lingua_output ||
      draft.soglia_non_idoneo !== settings.soglia_non_idoneo ||
      draft.escludi_posizioni_chiuse !== settings.escludi_posizioni_chiuse
    );
  }, [draft, settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const { error } = await supabase
        .from("app_settings")
        .update(draft)
        .eq("id", "default");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_settings"] });
      toast.success("Preferenze salvate");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Sliders className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Preferenze di analisi</h2>
      </div>

      {isLoading || !draft ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lingua">Lingua dell'output AI</Label>
              <Select
                value={draft.lingua_output}
                onValueChange={(v) => setDraft({ ...draft, lingua_output: v })}
              >
                <SelectTrigger id="lingua">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINGUE.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="soglia">Soglia "non idoneo" (%)</Label>
              <Input
                id="soglia"
                type="number"
                min={0}
                max={100}
                value={draft.soglia_non_idoneo}
                onChange={(e) => {
                  const n = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  setDraft({ ...draft, soglia_non_idoneo: n });
                }}
              />
              <p className="text-xs text-muted-foreground">
                Sotto questa percentuale il candidato è segnalato come non idoneo.
              </p>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border border-border bg-background p-4">
            <div className="space-y-0.5">
              <Label htmlFor="escludi" className="text-sm font-medium">
                Escludi automaticamente posizioni chiuse
              </Label>
              <p className="text-xs text-muted-foreground">
                Le posizioni con stato "Chiusa" non saranno incluse nei confronti.
              </p>
            </div>
            <Switch
              id="escludi"
              checked={draft.escludi_posizioni_chiuse}
              onCheckedChange={(v) => setDraft({ ...draft, escludi_posizioni_chiuse: v })}
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              Salva preferenze
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ============== ESPORTAZIONE ============== */
function EsportazioneSection() {
  const [csvBusy, setCsvBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [selectedCandidato, setSelectedCandidato] = useState<string>("");

  const { data: candidatiAnalizzati } = useQuery({
    queryKey: ["candidati", "analizzati"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidati")
        .select("id, nome, cognome")
        .eq("stato_analisi", "analizzato")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleCsv = async () => {
    setCsvBusy(true);
    try {
      await exportCandidatiCSV();
      toast.success("CSV scaricato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore export CSV");
    } finally {
      setCsvBusy(false);
    }
  };

  const handlePdf = async () => {
    if (!selectedCandidato) return;
    setPdfBusy(true);
    try {
      await exportAnalisiPDF(selectedCandidato);
      toast.success("PDF generato");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore export PDF");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Download className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Esportazione dati</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border bg-background p-4">
          <div className="mb-2 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">Candidati in CSV</h3>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Esporta la lista completa dei candidati con tutti i campi standard ed estratti dal CV
            (inclusi i campi personalizzati).
          </p>
          <Button onClick={handleCsv} disabled={csvBusy}>
            <Download className="h-4 w-4" />
            {csvBusy ? "Esportazione…" : "Scarica CSV"}
          </Button>
        </div>

        <div className="rounded-md border border-border bg-background p-4">
          <div className="mb-2 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">Report analisi (PDF)</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Genera un PDF con i risultati dell'ultima analisi AI per un candidato.
          </p>
          <div className="space-y-2">
            <Select value={selectedCandidato} onValueChange={setSelectedCandidato}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona un candidato analizzato…" />
              </SelectTrigger>
              <SelectContent>
                {(candidatiAnalizzati || []).length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Nessun candidato analizzato
                  </div>
                ) : (
                  (candidatiAnalizzati || []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} {c.cognome}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button onClick={handlePdf} disabled={!selectedCandidato || pdfBusy}>
              <Download className="h-4 w-4" />
              {pdfBusy ? "Generazione…" : "Scarica PDF"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============== HOOK ============== */
function useSettings() {
  return useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", "default")
        .maybeSingle();
      if (error) throw error;
      return data as Settings | null;
    },
  });
}
