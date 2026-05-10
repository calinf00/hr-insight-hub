import { handleDbError } from "@/lib/handle-error";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  candidatoId: string;
  candidatoNome: string;
};

export function PromuoviDialog({ open, onOpenChange, candidatoId, candidatoNome }: Props) {
  const queryClient = useQueryClient();
  const [posizioneId, setPosizioneId] = useState<string>("");
  const [nota, setNota] = useState("");
  const [avviaAnalisi, setAvviaAnalisi] = useState(false);

  const { data: posizioni } = useQuery({
    queryKey: ["posizioni-aperte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posizioni")
        .select("id, titolo, reparto, stato")
        .eq("stato", "aperta")
        .order("titolo", { ascending: true });
      if (error) throw error;
      return data as Pick<Tables<"posizioni">, "id" | "titolo" | "reparto" | "stato">[];
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!posizioneId) throw new Error("Seleziona una posizione");

      const { data: cand, error: getErr } = await supabase
        .from("candidati")
        .select("note")
        .eq("id", candidatoId)
        .maybeSingle();
      if (getErr) throw getErr;

      const noteAggiornate = nota.trim()
        ? [cand?.note, `[Proposta ${new Date().toLocaleDateString("it-IT")}] ${nota.trim()}`]
            .filter(Boolean)
            .join("\n\n")
        : cand?.note ?? null;

      const { error } = await supabase
        .from("candidati")
        .update({ posizione_id: posizioneId, note: noteAggiornate })
        .eq("id", candidatoId);
      if (error) throw error;

      if (avviaAnalisi) {
        const { data, error: fnErr } = await supabase.functions.invoke("analizza-cv", {
          body: { candidato_id: candidatoId, posizioni_ids: [posizioneId] },
        });
        if (fnErr) throw new Error(fnErr.message || "Errore analisi");
        if ((data as { error?: string } | null)?.error) {
          throw new Error((data as { error: string }).error);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidato", candidatoId] });
      queryClient.invalidateQueries({ queryKey: ["candidati"] });
      queryClient.invalidateQueries({ queryKey: ["analisi"] });
      toast.success(avviaAnalisi ? "Candidato proposto e analisi avviata" : "Candidato proposto");
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => handleDbError(e, "mutation"),
  });

  const reset = () => {
    setPosizioneId("");
    setNota("");
    setAvviaAnalisi(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Proponi {candidatoNome} per una posizione</DialogTitle>
          <DialogDescription>
            Associa il candidato a una posizione aperta. Puoi facoltativamente avviare subito una nuova analisi AI.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Posizione aperta</Label>
            <Select value={posizioneId} onValueChange={setPosizioneId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona una posizione…" />
              </SelectTrigger>
              <SelectContent>
                {(posizioni ?? []).length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Nessuna posizione aperta
                  </div>
                ) : (
                  posizioni!.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.titolo}
                      {p.reparto ? ` — ${p.reparto}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Nota (opzionale)</Label>
            <Textarea
              rows={3}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Es. profilo interessante per una nuova selezione…"
            />
          </div>

          <label className="flex items-start gap-2 rounded-md border border-border bg-background p-3 text-sm">
            <Checkbox
              checked={avviaAnalisi}
              onCheckedChange={(v) => setAvviaAnalisi(v === true)}
              className="mt-0.5"
            />
            <div>
              <div className="flex items-center gap-1.5 font-medium">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Avvia analisi AI sulla posizione selezionata
              </div>
              <p className="text-xs text-muted-foreground">
                Verrà eseguito subito il matching del CV con la posizione scelta.
              </p>
            </div>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!posizioneId || mutation.isPending}
          >
            {mutation.isPending ? "Salvataggio…" : "Conferma"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
