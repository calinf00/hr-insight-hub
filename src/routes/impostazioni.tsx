import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Save, Settings as SettingsIcon, GripVertical } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Campo = Tables<"campi_personalizzati">;

export const Route = createFileRoute("/impostazioni")({
  head: () => ({ meta: [{ title: "Impostazioni — CV Analyzer" }] }),
  component: ImpostazioniPage,
});

function ImpostazioniPage() {
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
      const ordine = (campi?.length ?? 0);
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
        const { [c.id]: _, ...rest } = d;
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
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Impostazioni</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestisci i campi personalizzati che l'AI deve estrarre dai CV, oltre a quelli standard.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <SettingsIcon className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold">Campi personalizzati</h2>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Questi campi vengono aggiunti al prompt di estrazione AI. Se presenti nel CV,
          verranno mostrati nella scheda del candidato. Esempi: "Disponibilità a trasferte",
          "Stipendio atteso", "Notice period".
        </p>

        <div className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : !campi || campi.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nessun campo personalizzato. Aggiungine uno qui sotto.
            </p>
          ) : (
            campi.map((c) => {
              const draft = getDraft(c);
              const dirty = isDirty(c);
              return (
                <div
                  key={c.id}
                  className="grid grid-cols-1 items-start gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[auto,1fr,2fr,auto]"
                >
                  <GripVertical className="hidden h-5 w-5 self-center text-muted-foreground sm:block" />
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
                      variant="ghost"
                      size="icon"
                      disabled={!dirty || updateMutation.isPending}
                      onClick={() => updateMutation.mutate(c)}
                      aria-label="Salva"
                    >
                      <Save className={`h-4 w-4 ${dirty ? "text-primary" : "text-muted-foreground"}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
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
      </section>

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
    </div>
  );
}
