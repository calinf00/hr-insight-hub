import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Users, FileText } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CandidatoFormDialog } from "@/components/candidato-form-dialog";
import { CvPreviewDialog } from "@/components/cv-preview-dialog";

export const Route = createFileRoute("/candidati")({
  head: () => ({ meta: [{ title: "Candidati — CV Analyzer" }] }),
  component: CandidatiPage,
});

type Candidato = Tables<"candidati"> & {
  posizioni?: { id: string; titolo: string } | null;
};
type Filtro = "tutti" | "in_attesa" | "analizzato";

function CandidatiPage() {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("tutti");
  const [formOpen, setFormOpen] = useState(false);
  const [preview, setPreview] = useState<Candidato | null>(null);
  const [toDelete, setToDelete] = useState<Candidato | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["candidati"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("candidati")
        .select("*, posizioni(id, titolo)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Candidato[];
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filtro === "tutti") return data;
    return data.filter((c) => c.stato_analisi === filtro);
  }, [data, filtro]);

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

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Candidati</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Carica i CV ricevuti e gestisci la lista dei candidati.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          Aggiungi candidato
        </Button>
      </div>

      <div className="mb-4">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)}>
          <TabsList>
            <TabsTrigger value="tutti">Tutti</TabsTrigger>
            <TabsTrigger value="in_attesa">In attesa</TabsTrigger>
            <TabsTrigger value="analizzato">Analizzati</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cognome</TableHead>
              <TableHead>Ruolo applicato</TableHead>
              <TableHead>Data caricamento</TableHead>
              <TableHead>Stato analisi</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  Caricamento…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Users className="h-8 w-8 opacity-50" />
                    <p className="text-sm">Nessun candidato da mostrare</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      to="/candidati/$id"
                      params={{ id: c.id }}
                      className="flex items-center gap-2 font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {c.cv_path && <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                      {c.nome}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/candidati/$id"
                      params={{ id: c.id }}
                      className="font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {c.cognome}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.posizioni?.titolo || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
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
              ))
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
