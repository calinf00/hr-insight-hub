import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Trash2, Trophy, AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/analisi")({
  head: () => ({ meta: [{ title: "Analisi AI — CV Analyzer" }] }),
  component: AnalisiPage,
});

type Candidato = Tables<"candidati">;
type Posizione = Tables<"posizioni">;
type Analisi = Tables<"analisi"> & {
  candidati?: Pick<Candidato, "id" | "nome" | "cognome"> | null;
};

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

function AnalisiPage() {
  const queryClient = useQueryClient();
  const [candidatoId, setCandidatoId] = useState<string>("");
  const [selectedPos, setSelectedPos] = useState<Set<string>>(new Set());
  const [allPositions, setAllPositions] = useState(false);
  const [toDelete, setToDelete] = useState<Analisi | null>(null);

  const { data: candidati } = useQuery({
    queryKey: ["candidati", "con-cv"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidati")
        .select("id, nome, cognome, cv_path")
        .not("cv_path", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pick<Candidato, "id" | "nome" | "cognome" | "cv_path">[];
    },
  });

  const { data: posizioni } = useQuery({
    queryKey: ["posizioni", "aperte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posizioni")
        .select("id, titolo, reparto")
        .eq("stato", "aperta")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pick<Posizione, "id" | "titolo" | "reparto">[];
    },
  });

  const { data: analisi, isLoading: loadingAnalisi } = useQuery({
    queryKey: ["analisi"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analisi")
        .select("*, candidati(id, nome, cognome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Analisi[];
    },
  });

  const posizioniMap = useMemo(() => {
    const m = new Map<string, string>();
    posizioni?.forEach((p) => m.set(p.id, p.titolo));
    return m;
  }, [posizioni]);

  const togglePos = (id: string) => {
    const next = new Set(selectedPos);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedPos(next);
  };

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!candidatoId) throw new Error("Seleziona un candidato");
      const ids = allPositions
        ? (posizioni ?? []).map((p) => p.id)
        : Array.from(selectedPos);
      if (ids.length === 0) throw new Error("Seleziona almeno una posizione");

      const { data, error } = await supabase.functions.invoke("analizza-cv", {
        body: { candidato_id: candidatoId, posizioni_ids: ids },
      });
      if (error) throw new Error(error.message || "Errore durante l'analisi");
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analisi"] });
      queryClient.invalidateQueries({ queryKey: ["candidati"] });
      toast.success("Analisi completata");
      setSelectedPos(new Set());
      setAllPositions(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("analisi").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analisi"] });
      toast.success("Analisi eliminata");
      setToDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canRun =
    !!candidatoId &&
    !runMutation.isPending &&
    (allPositions ? (posizioni?.length ?? 0) > 0 : selectedPos.size > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Analisi AI</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Confronta un candidato con una o più posizioni aperte tramite AI.
        </p>
      </div>

      {/* Setup analisi */}
      <Card>
        <CardHeader>
          <CardTitle>Avvia una nuova analisi</CardTitle>
          <CardDescription>
            Seleziona un candidato (con CV caricato) e le posizioni da confrontare.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2 max-w-md">
            <Label>Candidato</Label>
            <Select value={candidatoId} onValueChange={setCandidatoId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona un candidato…" />
              </SelectTrigger>
              <SelectContent>
                {(candidati ?? []).length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    Nessun candidato con CV disponibile
                  </div>
                ) : (
                  candidati!.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} {c.cognome}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Posizioni da confrontare</Label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={allPositions}
                  onCheckedChange={(c) => {
                    setAllPositions(!!c);
                    if (c) setSelectedPos(new Set());
                  }}
                />
                Confronta con tutte le posizioni aperte
              </label>
            </div>

            {!allPositions && (
              <div className="grid gap-2 sm:grid-cols-2">
                {(posizioni ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground col-span-2">
                    Nessuna posizione aperta disponibile.
                  </p>
                ) : (
                  posizioni!.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-accent/40 transition-colors"
                    >
                      <Checkbox
                        checked={selectedPos.has(p.id)}
                        onCheckedChange={() => togglePos(p.id)}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{p.titolo}</div>
                        {p.reparto && (
                          <div className="text-xs text-muted-foreground">{p.reparto}</div>
                        )}
                      </div>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <Button onClick={() => runMutation.mutate()} disabled={!canRun} size="lg">
            <Sparkles className="h-4 w-4" />
            {runMutation.isPending ? "Analisi in corso…" : "Avvia analisi"}
          </Button>
        </CardContent>
      </Card>

      {/* Risultati */}
      <div>
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-foreground">
          Analisi precedenti
        </h2>
        {loadingAnalisi ? (
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        ) : (analisi ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nessuna analisi ancora effettuata.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {analisi!.map((a) => (
              <AnalisiCard
                key={a.id}
                analisi={a}
                posizioniMap={posizioniMap}
                onDelete={() => setToDelete(a)}
              />
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare l'analisi?</AlertDialogTitle>
            <AlertDialogDescription>
              L'analisi verrà eliminata definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteMutation.mutate(toDelete.id)}
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

function AnalisiCard({
  analisi,
  posizioniMap,
  onDelete,
}: {
  analisi: Analisi;
  posizioniMap: Map<string, string>;
  onDelete: () => void;
}) {
  const r = analisi.risultato as unknown as Risultato;
  const valutazioni = [...(r.valutazioni ?? [])].sort(
    (a, b) => (b.punteggio ?? 0) - (a.punteggio ?? 0),
  );
  const best =
    valutazioni.find((v) => v.posizione_id === r.posizione_migliore_id) ?? valutazioni[0];
  const titoloFor = (id: string, fallback?: string) =>
    posizioniMap.get(id) || fallback || "Posizione";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg">
            {analisi.candidati?.nome} {analisi.candidati?.cognome}
          </CardTitle>
          <CardDescription>
            Analizzato il{" "}
            {new Date(analisi.created_at).toLocaleString("it-IT", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {analisi.modello ? ` • ${analisi.modello}` : ""}
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Elimina">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {r.non_adatto ? (
          <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">
                Candidato non adatto a nessuna posizione
              </p>
              {r.spiegazione_non_adatto && (
                <p className="mt-1 text-sm text-muted-foreground">{r.spiegazione_non_adatto}</p>
              )}
            </div>
          </div>
        ) : (
          best && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary font-semibold">
                <Trophy className="h-4 w-4" />
                Posizione più adatta
              </div>
              <div className="mt-2 flex items-center justify-between gap-4">
                <h4 className="text-lg font-semibold">
                  {titoloFor(best.posizione_id, best.titolo)}
                </h4>
                <Badge className="text-base px-3 py-1">{best.punteggio}%</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{r.motivazione_migliore}</p>
            </div>
          )
        )}

        {valutazioni.length > 0 && (
          <div>
            <h5 className="mb-3 text-sm font-semibold">Classifica delle posizioni</h5>
            <div className="space-y-3">
              {valutazioni.map((v) => (
                <div key={v.posizione_id + v.titolo} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">
                      {titoloFor(v.posizione_id, v.titolo)}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{v.punteggio}%</span>
                  </div>
                  <Progress value={v.punteggio} />
                  <p className="text-xs text-muted-foreground">{v.motivazione}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {r.punti_di_forza_generali?.length > 0 && (
          <Section
            icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
            title="Punti di forza del candidato"
            items={r.punti_di_forza_generali}
          />
        )}

        {r.suggerimenti?.length > 0 && (
          <Section
            icon={<Lightbulb className="h-4 w-4 text-primary" />}
            title="Suggerimenti per migliorare il match"
            items={r.suggerimenti}
          />
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <div>
      <h5 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h5>
      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground marker:text-primary">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
