import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Papa from "papaparse";
import { Download, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type Candidato = Tables<"candidati"> & {
  posizioni?: { id: string; titolo: string; stato: string } | null;
};

type Estratte = {
  ultimo_ruolo?: string;
  competenze_tecniche?: string[];
  _da_rivalutare?: boolean;
};

type Valutazione = {
  posizione_id: string;
  titolo: string;
  punteggio: number;
};

type RisultatoAI = {
  valutazioni?: Valutazione[];
  posizione_migliore_id?: string | null;
};

type RowRisultato = {
  candidato: Candidato;
  bestPosizioneId: string | null;
  bestTitolo: string | null;
  bestScore: number | null;
  errore?: string;
  fonte: "nuova" | "esistente";
  archivio: boolean;
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidati: Candidato[];
  periodoLabel: string;
}

function getEstratte(c: Candidato): Estratte {
  return (c.informazioni_estratte as Estratte | null) ?? {};
}

export function ConfrontaCvDialog({ open, onOpenChange, candidati, periodoLabel }: Props) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [risultati, setRisultati] = useState<RowRisultato[]>([]);
  const [started, setStarted] = useState(false);

  const { data: posizioniAperte } = useQuery({
    queryKey: ["posizioni", "aperte"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posizioni")
        .select("id, titolo, stato")
        .eq("stato", "aperta");
      if (error) throw error;
      return data as { id: string; titolo: string; stato: string }[];
    },
    enabled: open,
  });

  const { data: soglia } = useQuery({
    queryKey: ["app_settings", "soglia"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("soglia_non_idoneo")
        .eq("id", "default")
        .maybeSingle();
      return data?.soglia_non_idoneo ?? 60;
    },
    enabled: open,
  });

  // Reset stato quando apre/chiude
  useEffect(() => {
    if (!open) {
      setRisultati([]);
      setRunning(false);
      setStarted(false);
      setProgress({ done: 0, total: 0 });
    }
  }, [open]);

  const candidatiCV = useMemo(
    () => candidati.filter((c) => !!c.cv_path),
    [candidati],
  );

  const posMap = useMemo(() => {
    const m = new Map<string, string>();
    (posizioniAperte || []).forEach((p) => m.set(p.id, p.titolo));
    return m;
  }, [posizioniAperte]);

  const startConfronto = async () => {
    if (!posizioniAperte || posizioniAperte.length === 0) {
      toast.error("Nessuna posizione aperta su cui confrontare");
      return;
    }
    if (candidatiCV.length === 0) {
      toast.error("Nessun candidato con CV nel periodo selezionato");
      return;
    }
    setStarted(true);
    setRunning(true);
    setRisultati([]);
    setProgress({ done: 0, total: candidatiCV.length });
    const posizioniIds = posizioniAperte.map((p) => p.id);
    const out: RowRisultato[] = [];

    for (const c of candidatiCV) {
      const archivio =
        !c.posizione_id || c.posizioni?.stato !== "aperta" || getEstratte(c)._da_rivalutare === true;

      // Riusa l'analisi più recente se include tutte le posizioni aperte attuali
      const { data: existing } = await supabase
        .from("analisi")
        .select("*")
        .eq("candidato_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const existingIds = (existing?.posizioni_ids as string[] | null) ?? [];
      const coverAll = posizioniIds.every((id) => existingIds.includes(id));

      if (existing && coverAll) {
        const r = existing.risultato as unknown as RisultatoAI;
        const valutazioni = r.valutazioni || [];
        // Limita ai punteggi sulle posizioni attualmente aperte
        const filtered = valutazioni.filter((v) => posMap.has(v.posizione_id));
        const top = [...filtered].sort((a, b) => (b.punteggio ?? 0) - (a.punteggio ?? 0))[0];
        out.push({
          candidato: c,
          bestPosizioneId: top?.posizione_id ?? null,
          bestTitolo: top ? posMap.get(top.posizione_id) ?? top.titolo : null,
          bestScore: top?.punteggio ?? null,
          fonte: "esistente",
          archivio,
        });
        setProgress((p) => ({ ...p, done: p.done + 1 }));
        setRisultati([...out]);
        continue;
      }

      try {
        const { data, error } = await supabase.functions.invoke("analizza-cv", {
          body: { candidato_id: c.id, posizioni_ids: posizioniIds },
        });
        if (error) throw error;
        const r = (data?.analisi?.risultato ?? {}) as RisultatoAI;
        const valutazioni = (r.valutazioni || []).filter((v) => posMap.has(v.posizione_id));
        const top = [...valutazioni].sort((a, b) => (b.punteggio ?? 0) - (a.punteggio ?? 0))[0];
        out.push({
          candidato: c,
          bestPosizioneId: top?.posizione_id ?? null,
          bestTitolo: top ? posMap.get(top.posizione_id) ?? top.titolo : null,
          bestScore: top?.punteggio ?? null,
          fonte: "nuova",
          archivio,
        });
      } catch (e) {
        out.push({
          candidato: c,
          bestPosizioneId: null,
          bestTitolo: null,
          bestScore: null,
          errore: e instanceof Error ? e.message : "Errore analisi",
          fonte: "nuova",
          archivio,
        });
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }));
      setRisultati([...out]);
    }

    setRunning(false);
    toast.success("Confronto completato");
  };

  const sogliaNum = soglia ?? 60;
  const daRivalutare = useMemo(
    () =>
      risultati.filter(
        (r) => r.archivio && r.bestScore !== null && r.bestScore >= sogliaNum,
      ),
    [risultati, sogliaNum],
  );

  const exportCsv = () => {
    const rows = risultati.map((r) => {
      const e = getEstratte(r.candidato);
      return {
        Nome: `${r.candidato.nome} ${r.candidato.cognome}`,
        "Ultimo ruolo": e.ultimo_ruolo || "",
        "Competenze chiave": (e.competenze_tecniche || []).slice(0, 5).join("; "),
        "Posizione migliore": r.bestTitolo || "",
        Punteggio: r.bestScore ?? "",
        "In archivio": r.archivio ? "Sì" : "No",
        "Da rivalutare": r.archivio && r.bestScore !== null && r.bestScore >= sogliaNum ? "Sì" : "No",
        "Data candidatura": new Date(r.candidato.created_at).toLocaleDateString("it-IT"),
        Fonte: r.fonte === "esistente" ? "Analisi esistente" : "Nuova analisi",
        Errore: r.errore || "",
      };
    });
    const csv = Papa.unparse(rows, { quotes: true });
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `confronto_cv_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Confronta CV nel periodo
          </DialogTitle>
          <DialogDescription>
            {periodoLabel} · {candidatiCV.length} candidati con CV su {candidati.length} totali ·{" "}
            {posizioniAperte?.length ?? 0} posizioni aperte
          </DialogDescription>
        </DialogHeader>

        {!started && (
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm">
              Avvia il confronto AI per ottenere una sintesi comparativa dei candidati nel periodo selezionato
              rispetto alle posizioni attualmente aperte.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Verranno riutilizzate le analisi esistenti quando coprono tutte le posizioni aperte attuali.
            </p>
          </div>
        )}

        {started && (
          <div className="space-y-4">
            {running && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analisi in corso… {progress.done}/{progress.total}
              </div>
            )}

            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Ultimo ruolo</TableHead>
                    <TableHead>Competenze chiave</TableHead>
                    <TableHead>Posizione migliore</TableHead>
                    <TableHead className="text-right">Punteggio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {risultati.length === 0 && !running ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                        Nessun risultato.
                      </TableCell>
                    </TableRow>
                  ) : (
                    risultati.map((r) => {
                      const e = getEstratte(r.candidato);
                      const comp = (e.competenze_tecniche || []).slice(0, 3);
                      return (
                        <TableRow key={r.candidato.id}>
                          <TableCell className="font-medium">
                            {r.candidato.nome} {r.candidato.cognome}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {e.ultimo_ruolo || "—"}
                          </TableCell>
                          <TableCell>
                            {comp.length === 0 ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {comp.map((k, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">{k}</Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {r.errore ? (
                              <span className="flex items-center gap-1 text-destructive text-xs">
                                <AlertCircle className="h-3.5 w-3.5" />
                                {r.errore}
                              </span>
                            ) : (
                              r.bestTitolo || "—"
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.bestScore !== null ? (
                              <Badge
                                className={
                                  r.bestScore >= sogliaNum
                                    ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-400"
                                    : "bg-muted text-muted-foreground"
                                }
                              >
                                {r.bestScore}/100
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {daRivalutare.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  🟡 Candidati da rivalutare ({daRivalutare.length})
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Profili in archivio che oggi raggiungono almeno {sogliaNum}/100 su una posizione aperta.
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {daRivalutare.map((r) => (
                    <li key={r.candidato.id} className="flex items-center justify-between gap-2">
                      <span>
                        <span className="font-medium">
                          {r.candidato.nome} {r.candidato.cognome}
                        </span>{" "}
                        <span className="text-muted-foreground">→ {r.bestTitolo}</span>
                      </span>
                      <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-400">
                        {r.bestScore}/100
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {!started ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
              <Button onClick={startConfronto} disabled={!posizioniAperte}>
                <Sparkles className="h-4 w-4" />
                Avvia confronto
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={exportCsv}
                disabled={running || risultati.length === 0}
              >
                <Download className="h-4 w-4" />
                Esporta CSV
              </Button>
              <Button onClick={() => onOpenChange(false)} disabled={running}>
                Chiudi
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
